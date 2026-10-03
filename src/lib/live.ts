import "server-only";
import type { AccountSummary, Ad, AdAccount, DailyPoint, Lead, SyncState } from "./types";
import { getLeads, getProvider, listAccounts } from "./meta/provider";
import { adsCache, listenerCount, publish } from "./live-bus";
import { logActivity, newId, readStore, updateStore } from "./store";

// Live data layer.
// - Ads are cached per account on the server; every browser reads the cache (instant),
//   and one background poller keeps it fresh and pushes "ads changed" over SSE.
// - Leads arrive by webhook (seconds); a fallback poll catches them if the webhook isn't set up.
// - Webhook leads are counted into today's numbers right away; Meta's insights catch up later.

const META_POLL_MS = Number(process.env.META_POLL_SECONDS ?? 60) * 1000;
const DEMO_POLL_MS = 8000;

interface Snapshot {
  ads: Ad[];
  fetchedAt: string;
  signature: string;
}

export interface Overview {
  mode: "demo" | "meta";
  rows: { account: AdAccount; summary: AccountSummary }[];
  fetchedAt: string;
  signature: string;
}

interface LiveState {
  inflight: Map<string, Promise<Snapshot>>;
  timer?: ReturnType<typeof setInterval>;
  seenLeads?: Set<string>;
  ticking?: boolean;
  overview?: Overview;
  overviewJob?: Promise<Overview>;
  sync: SyncState;
}
const g = globalThis as unknown as { __ocpLive?: LiveState };
const state: LiveState = (g.__ocpLive ??= { inflight: new Map(), sync: { running: false, done: 0, total: 0 } });
const cache = adsCache as Map<string, Snapshot>;

const today = () => new Date().toISOString().slice(0, 10);

function signature(ads: Ad[]) {
  return ads
    .map((a) => {
      const t = a.daily[a.daily.length - 1];
      return `${a.id}:${a.status}:${a.adsetDailyBudget}:${a.metrics.spend}:${a.metrics.leads}:${t?.spend ?? 0}:${t?.leads ?? 0}:${a.creative.headline}:${a.creative.imageUrl ?? ""}`;
    })
    .join("|");
}

/** Count webhook leads that Meta's insights don't show yet into today's numbers. */
function reconcile(ads: Ad[], leads: Lead[]): Ad[] {
  const t = today();
  const todayByAd = new Map<string, number>();
  for (const l of leads) {
    if (l.adId && l.createdAt.slice(0, 10) === t) todayByAd.set(l.adId, (todayByAd.get(l.adId) ?? 0) + 1);
  }
  return ads.map((ad) => {
    const pushed = todayByAd.get(ad.id) ?? 0;
    const last = ad.daily[ad.daily.length - 1];
    const fromInsights = last?.date === t ? last.leads : 0;
    if (pushed <= fromInsights) return ad;
    const extra = pushed - fromInsights;
    const daily: DailyPoint[] =
      last?.date === t
        ? [...ad.daily.slice(0, -1), { ...last, leads: pushed }]
        : [...ad.daily, { date: t, spend: 0, impressions: 0, clicks: 0, leads: pushed }];
    const leadsTotal = ad.metrics.leads + extra;
    return { ...ad, daily, metrics: { ...ad.metrics, leads: leadsTotal, cpl: leadsTotal ? Math.round(ad.metrics.spend / leadsTotal) : null } };
  });
}

async function fetchSnapshot(accountId: string): Promise<Snapshot> {
  const running = state.inflight.get(accountId);
  if (running) return running;
  const job = (async () => {
    const provider = await getProvider(accountId);
    const pushed = (await readStore()).leads.filter((l) => l.accountId === accountId);
    const ads = reconcile(await provider.listAds(), pushed);
    const snap = { ads, fetchedAt: new Date().toISOString(), signature: signature(ads) };
    cache.set(accountId, snap);
    return snap;
  })().finally(() => state.inflight.delete(accountId));
  state.inflight.set(accountId, job);
  return job;
}

/** Ads of the active (or given) account, from cache when fresh. */
export async function getAdsLive(accountId?: string, maxAgeMs = 30_000) {
  const provider = await getProvider(accountId);
  const id = provider.account.id;
  const cached = cache.get(id);
  const snap =
    cached && Date.now() - new Date(cached.fetchedAt).getTime() < maxAgeMs ? cached : await fetchSnapshot(id);
  return { mode: provider.mode, account: provider.account, ...snap };
}

/** Drop cached ads after a change (pause, budget, new ad…); the next read refetches. */
export function markAdsDirty(accountId?: string) {
  if (accountId) cache.delete(accountId);
  else cache.clear();
}

/** A new lead (webhook or fallback poll): store it, push it, and bump today's numbers. */
export async function ingestLead(lead: Lead, source: "webhook" | "poll") {
  const isNew = await updateStore((d) => {
    if (d.leads.some((l) => l.id === lead.id)) return false;
    d.leads.unshift(lead);
    d.leads = d.leads.slice(0, 5000);
    return true;
  });
  if (!isNew) return;
  state.seenLeads?.add(lead.id);
  if (lead.accountId) markAdsDirty(lead.accountId);
  const accounts = await import("./meta/provider").then((m) => m.listAccounts()).catch(() => []);
  publish({ type: "lead", lead, accountName: accounts.find((a) => a.id === lead.accountId)?.name });
  await logActivity("system", "lead", `Új lead${source === "poll" ? "" : " (azonnal)"}: ${lead.name}${lead.city ? `, ${lead.city}` : ""} – ${lead.formName}`);
}

// ---------- all accounts at a glance ----------

function emptyTotals() {
  return { spend: 0, leads: 0, clicks: 0, impressions: 0 };
}

/** Demo: the same numbers computed from the demo ads. */
async function demoSummaries(accounts: AdAccount[]): Promise<AccountSummary[]> {
  const { ads } = await readStore();
  const t = today();
  return accounts.map((acc) => {
    const mine = ads.filter((a) => a.accountId === acc.id);
    const s: AccountSummary = { accountId: acc.id, today: emptyTotals(), last7: emptyTotals(), activeAds: mine.filter((a) => a.status === "ACTIVE").length };
    for (const ad of mine) {
      for (const d of ad.daily.slice(-7)) {
        const into = [s.last7, ...(d.date === t ? [s.today] : [])];
        for (const x of into) {
          x.spend += d.spend;
          x.leads += d.leads;
          x.clicks += d.clicks;
          x.impressions += d.impressions;
        }
      }
    }
    return s;
  });
}

async function fetchOverview(): Promise<Overview> {
  if (state.overviewJob) return state.overviewJob;
  const job = (async () => {
    const accounts = await listAccounts();
    const mode = (await getProvider()).mode;
    const summaries =
      mode === "meta" ? await import("./meta/graph").then((m) => m.metaAccountSummaries(accounts.map((a) => a.id))) : await demoSummaries(accounts);
    const rows = accounts.map((account, i) => ({ account, summary: summaries[i] }));
    const signature = JSON.stringify(summaries);
    const ov: Overview = { mode, rows, fetchedAt: new Date().toISOString(), signature };
    state.overview = ov;
    return ov;
  })().finally(() => (state.overviewJob = undefined));
  state.overviewJob = job;
  return job;
}

/** Headline numbers of every ad account (one batched Meta call), from cache when fresh. */
export async function getOverview(maxAgeMs = 30_000) {
  const ov = state.overview && Date.now() - new Date(state.overview.fetchedAt).getTime() < maxAgeMs ? state.overview : await fetchOverview();
  return { ...ov, sync: state.sync };
}

function setSync(sync: SyncState) {
  state.sync = sync;
  publish({ type: "sync", sync });
}

/**
 * Right after connecting: overview first (seconds), then every account's ads and
 * creative images in the background, with progress pushed to the browser.
 */
export function startFullSync() {
  if (state.sync.running) return;
  void (async () => {
    try {
      const accounts = await listAccounts();
      setSync({ running: true, done: 0, total: accounts.length });
      await fetchOverview();
      publish({ type: "invalidate", keys: ["overview", "accounts"] });

      const { warmCreativeImages } = await import("./creative/creative-images");
      const queue = [...accounts];
      let done = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          for (let acc = queue.shift(); acc; acc = queue.shift()) {
            setSync({ running: true, done, total: accounts.length, current: acc.name });
            try {
              const snap = await fetchSnapshot(acc.id);
              publish({ type: "invalidate", keys: ["ads"] });
              await warmCreativeImages(snap.ads.flatMap((a) => (a.creative.creativeId ? [a.creative.creativeId] : [])));
            } catch (err) {
              console.error("[ocp sync]", acc.id, err);
            }
            done++;
            setSync({ running: true, done, total: accounts.length });
          }
        }),
      );
      await logActivity("system", "action", `Szinkron kész: ${accounts.length} hirdetési fiók, minden hirdetés és kép betöltve.`);
    } catch (err) {
      await logActivity("system", "error", `Szinkron hiba: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSync({ ...state.sync, running: false, current: undefined });
      publish({ type: "invalidate", keys: ["overview", "ads"] });
    }
  })();
}

// ---------- background poller ----------

export function ensureLivePoller() {
  if (state.timer) return;
  state.timer = setInterval(() => void tick(), DEMO_POLL_MS);
  void tick();
}

let lastMetaPoll = 0;

async function tick() {
  if (state.ticking) return;
  // nobody is watching → don't spend Meta API quota
  if (listenerCount() === 0) return;
  state.ticking = true;
  try {
    const provider = await getProvider();
    const id = provider.account.id;
    if (provider.mode === "demo") {
      for (const acc of await listAccounts()) await simulateDemo(acc.id);
    } else if (Date.now() - lastMetaPoll < META_POLL_MS) return;
    lastMetaPoll = Date.now();

    const before = cache.get(id)?.signature;
    const snap = await fetchSnapshot(id);
    if (snap.signature !== before) publish({ type: "invalidate", keys: ["ads"] });

    // every account's headline numbers: one batched call
    const prev = state.overview?.signature;
    const ov = await fetchOverview();
    if (ov.signature !== prev) publish({ type: "invalidate", keys: ["overview"] });

    if (provider.mode === "meta") await pollLeads();
  } catch (err) {
    console.error("[ocp live]", err);
  } finally {
    state.ticking = false;
  }
}

/** Fallback when the webhook isn't connected: diff the lead list. */
async function pollLeads() {
  const leads = await getLeads();
  if (!state.seenLeads) {
    state.seenLeads = new Set(leads.map((l) => l.id));
    return;
  }
  for (const l of leads.filter((x) => !state.seenLeads!.has(x.id)).reverse()) {
    await ingestLead(l, "poll");
  }
}

// ---------- demo simulation (clearly demo-only) ----------

const NAMES = ["Kiss Bence", "Fekete Lilla", "Balogh Ádám", "Papp Réka", "Lakatos Márk", "Simon Dóra", "Takács Levente", "Farkas Nóra"];
const CITIES = ["Budapest XII.", "Vác", "Szentendre", "Gödöllő", "Budapest IV.", "Dunakeszi", "Budaörs", "Érd"];

async function simulateDemo(accountId: string) {
  const newLeads: Lead[] = [];
  await updateStore((d) => {
    const t = today();
    for (const ad of d.ads.filter((a) => a.accountId === accountId && a.status === "ACTIVE")) {
      let last = ad.daily[ad.daily.length - 1];
      if (!last || last.date !== t) {
        last = { date: t, spend: 0, impressions: 0, clicks: 0, leads: 0 };
        ad.daily.push(last);
        ad.daily = ad.daily.slice(-90);
      }
      // stay within the daily budget, like Meta does
      if (last.spend >= ad.adsetDailyBudget) continue;
      const spend = Math.round(ad.adsetDailyBudget / 600 + Math.random() * (ad.adsetDailyBudget / 400));
      const clicks = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 3) : 0;
      last.spend += spend;
      last.clicks += clicks;
      last.impressions += 40 + Math.floor(Math.random() * 120);
      // lead probability follows the ad's real cost per lead
      const cpl = ad.metrics.cpl ?? Infinity;
      if (Math.random() < spend / cpl) {
        last.leads += 1;
        const i = Math.floor(Math.random() * NAMES.length);
        const lead: Lead = {
          id: newId("ld"),
          accountId,
          adId: ad.id,
          createdAt: new Date().toISOString(),
          formName: "Demó űrlap",
          name: NAMES[i],
          phone: `+36 30 ${100 + Math.floor(Math.random() * 899)} ${1000 + Math.floor(Math.random() * 8999)}`,
          city: CITIES[i],
          status: "new",
        };
        d.leads.unshift(lead);
        newLeads.push(lead);
      }
      const last7 = ad.daily.slice(-7);
      ad.metrics.spend = last7.reduce((s, x) => s + x.spend, 0);
      ad.metrics.leads = last7.reduce((s, x) => s + x.leads, 0);
      ad.metrics.clicks = last7.reduce((s, x) => s + x.clicks, 0);
      ad.metrics.impressions = last7.reduce((s, x) => s + x.impressions, 0);
      ad.metrics.cpl = ad.metrics.leads ? Math.round(ad.metrics.spend / ad.metrics.leads) : null;
    }
  });
  for (const lead of newLeads) {
    publish({ type: "lead", lead, accountName: "Demó" });
    await logActivity("system", "lead", `Új lead (demó szimuláció): ${lead.name}, ${lead.city}`);
  }
}
