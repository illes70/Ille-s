import "server-only";
import type { AccountSummary, Ad, AdAccount, DailyPoint, Lead, SyncState } from "./types";
import { getLeads, getProvider, invalidateAccounts, listAccounts } from "./meta/provider";
import type { PendingAccount } from "./meta/graph";
import { adsCacheOf, listenerCount, publish } from "./live-bus";
import { logActivity, newId, readStore, updateStore } from "./store";
import { currentTenant, runAsTenant } from "./tenant";
import { listTenants } from "./users";

// Live data layer.
// - Ads are cached per account on the server; every browser reads the cache (instant),
//   and one background poller keeps it fresh and pushes "ads changed" over SSE.
// - Leads arrive by webhook (seconds); a fallback poll catches them if the webhook isn't set up.
// - Webhook leads are counted into today's numbers right away; Meta's insights catch up later.
// - Everything is per workspace (tenant). The poller runs 0-24 for every workspace, also
//   when nobody has the app open: fast while someone watches, slower otherwise.

const META_POLL_MS = Number(process.env.META_POLL_SECONDS ?? 60) * 1000;
const META_IDLE_POLL_MS = Number(process.env.META_IDLE_POLL_SECONDS ?? 300) * 1000;
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
  seenLeads?: Set<string>;
  ticking?: boolean;
  overview?: Overview;
  overviewJob?: Promise<Overview>;
  sync: SyncState;
  /** accounts seen so far – a new one means a client just gave access */
  knownAccounts?: Set<string>;
  /** Business Manager accounts the user isn't assigned to yet */
  pending: PendingAccount[];
  lastDiscovery?: number;
  lastMetaPoll?: number;
  lastSchedule?: number;
}
const g = globalThis as unknown as { __ocpLive?: Map<string, LiveState>; __ocpPoller?: ReturnType<typeof setInterval> };
const states = (g.__ocpLive ??= new Map());

function stateOf(tenant: string): LiveState {
  let s = states.get(tenant);
  if (!s) states.set(tenant, (s = { inflight: new Map(), sync: { running: false, done: 0, total: 0 }, pending: [] }));
  return s;
}
/** live state + ads cache of the current workspace */
async function live() {
  const t = await currentTenant();
  return { t, state: stateOf(t), cache: adsCacheOf(t) as Map<string, Snapshot> };
}

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
  const { state, cache } = await live();
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
  const { cache } = await live();
  const cached = cache.get(id);
  const snap =
    cached && Date.now() - new Date(cached.fetchedAt).getTime() < maxAgeMs ? cached : await fetchSnapshot(id);
  return { mode: provider.mode, account: provider.account, ...snap };
}

/** Drop cached ads after a change (pause, budget, new ad…); the next read refetches. */
export async function markAdsDirty(accountId?: string) {
  const { cache } = await live();
  if (accountId) cache.delete(accountId);
  else cache.clear();
}

/** A new lead (webhook or fallback poll): store it, push it, and bump today's numbers. */
export async function ingestLead(lead: Lead, source: "webhook" | "poll" | "demo") {
  const { assessLead } = await import("./lead-quality");
  const isNew = await updateStore((d) => {
    if (d.leads.some((l) => l.id === lead.id)) return false;
    lead.quality = assessLead(lead, d.leads);
    d.leads.unshift(lead);
    d.leads = d.leads.slice(0, 5000);
    return true;
  });
  if (!isNew) return;
  const { state } = await live();
  state.seenLeads?.add(lead.id);
  if (lead.accountId) await markAdsDirty(lead.accountId);
  const accounts = await import("./meta/provider").then((m) => m.listAccounts()).catch(() => []);
  const accountName = accounts.find((a) => a.id === lead.accountId)?.name;
  publish({ type: "lead", lead, accountName });
  const q = lead.quality!;
  const warn = q.verdict === "ok" ? "" : ` ⚠ ${q.flags.join(", ")}`;
  await logActivity(
    "system",
    "lead",
    `Új lead${source === "webhook" ? " (azonnal)" : source === "demo" ? " (demó szimuláció)" : ""}: ${lead.name}${lead.city ? `, ${lead.city}` : ""} – ${lead.formName}${warn}`,
  );
  // speed-to-lead: the phone rings within seconds (not for spam, not for the demo)
  if (q.verdict !== "spam" && source !== "demo") {
    const { notify } = await import("./notify");
    await notify("lead", {
      title: `${q.verdict === "suspect" ? "⚠ " : ""}Új lead: ${lead.name}`,
      body: [lead.phone, lead.city, lead.formName, accountName].filter(Boolean).join(" · ") + (warn ? `\n${warn.trim()}` : "") + "\nHívd vissza 5 percen belül – akkor a legnagyobb az esély.",
      url: "/leads",
      tag: `lead-${lead.id}`,
    });
  }
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
    const y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const s: AccountSummary = { accountId: acc.id, today: emptyTotals(), yesterday: emptyTotals(), last7: emptyTotals(), activeAds: mine.filter((a) => a.status === "ACTIVE").length };
    for (const ad of mine) {
      for (const d of ad.daily.slice(-7)) {
        const into = [s.last7, ...(d.date === t ? [s.today] : []), ...(d.date === y ? [s.yesterday!] : [])];
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
  const { state } = await live();
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
  const { state } = await live();
  const ov = state.overview && Date.now() - new Date(state.overview.fetchedAt).getTime() < maxAgeMs ? state.overview : await fetchOverview();
  return { ...ov, sync: state.sync, pending: state.pending };
}

/** Load one account completely: profile, ads, creative images. */
async function loadAccount(acc: AdAccount) {
  const [{ autoProfile }, { warmCreativeImages }] = await Promise.all([import("./company"), import("./creative/creative-images")]);
  await autoProfile(acc.id);
  const snap = await fetchSnapshot(acc.id);
  publish({ type: "invalidate", keys: ["ads", "company"] });
  await warmCreativeImages(snap.ads.flatMap((a) => (a.creative.creativeId ? [a.creative.creativeId] : [])));
}

/**
 * New client accounts appear by themselves: when a client gives the user access, the
 * account shows up in /me/adaccounts and is loaded here – no reconnecting. Accounts
 * that sit in a Business Manager without the user assigned are listed as "pending".
 */
export async function discoverAccounts(announce = true) {
  if ((await getProvider()).mode !== "meta") return;
  const { state } = await live();
  state.lastDiscovery = Date.now();
  await invalidateAccounts();
  const accounts = await listAccounts();
  const ids = new Set(accounts.map((a) => a.id));
  const fresh = state.knownAccounts ? accounts.filter((a) => !state.knownAccounts!.has(a.id)) : [];
  state.knownAccounts = ids;
  for (const acc of fresh) {
    if (!announce) break;
    publish({ type: "account", account: acc });
    await logActivity("system", "action", `Új ügyfélfiók csatlakoztatva: ${acc.name} – a profil, a hirdetések és a képek betöltve.`);
    await loadAccount(acc).catch((err) => console.error("[ocp discover]", acc.id, err));
  }
  const { discoverBusinessAccounts } = await import("./meta/graph");
  const before = JSON.stringify(state.pending);
  state.pending = await discoverBusinessAccounts(ids).catch(() => state.pending);
  if (fresh.length || JSON.stringify(state.pending) !== before) {
    await fetchOverview().catch(() => undefined);
    publish({ type: "invalidate", keys: ["overview", "accounts"] });
  }
}

function setSync(state: LiveState, sync: SyncState) {
  state.sync = sync;
  publish({ type: "sync", sync });
}

/**
 * Right after connecting: overview first (seconds), then every account's ads and
 * creative images in the background, with progress pushed to the browser.
 */
export async function startFullSync() {
  const { t, state } = await live();
  if (state.sync.running) return;
  void runAsTenant(t, async () => {
    try {
      await invalidateAccounts();
      const accounts = await listAccounts();
      state.knownAccounts = new Set(accounts.map((a) => a.id));
      setSync(state, { running: true, done: 0, total: accounts.length });
      await fetchOverview();
      publish({ type: "invalidate", keys: ["overview", "accounts"] });

      const queue = [...accounts];
      let done = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          for (let acc = queue.shift(); acc; acc = queue.shift()) {
            setSync(state, { running: true, done, total: accounts.length, current: acc.name });
            try {
              await loadAccount(acc);
            } catch (err) {
              console.error("[ocp sync]", acc.id, err);
            }
            done++;
            setSync(state, { running: true, done, total: accounts.length });
          }
        }),
      );
      await discoverAccounts(false).catch(() => undefined);
      await logActivity("system", "action", `Szinkron kész: ${accounts.length} hirdetési fiók, minden hirdetés és kép betöltve.`);
    } catch (err) {
      await logActivity("system", "error", `Szinkron hiba: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSync(state, { ...state.sync, running: false, current: undefined });
      publish({ type: "invalidate", keys: ["overview", "ads"] });
    }
  });
}

// ---------- background poller (0-24, every workspace) ----------

/** Started once per server process (instrumentation.ts at boot, and defensively by /api/live). */
export function ensureLivePoller() {
  if (g.__ocpPoller) return;
  g.__ocpPoller = setInterval(() => void tickAll(), DEMO_POLL_MS);
  void tickAll();
}

async function tickAll() {
  const tenants = await listTenants().catch(() => [] as string[]);
  await Promise.all(tenants.map((t) => runAsTenant(t, () => tick(t))));
}

async function tick(tenant: string) {
  const state = stateOf(tenant);
  if (state.ticking) return;
  state.ticking = true;
  try {
    const watching = listenerCount(tenant) > 0;
    const provider = await getProvider();
    const id = provider.account.id;
    // demo: only "lives" while someone looks at it; Meta: fast while watched, slower otherwise
    const due =
      provider.mode === "demo" ? watching : Date.now() - (state.lastMetaPoll ?? 0) >= (watching ? META_POLL_MS : META_IDLE_POLL_MS);
    if (due) {
      state.lastMetaPoll = Date.now();
      if (provider.mode === "demo") for (const acc of await listAccounts()) await simulateDemo(acc.id);
      const cache = adsCacheOf(tenant) as Map<string, Snapshot>;

      if (watching) {
        const before = cache.get(id)?.signature;
        const snap = await fetchSnapshot(id);
        if (snap.signature !== before) publish({ type: "invalidate", keys: ["ads"] }, tenant);
      }

      // new client accounts (access granted after connecting) – every 5 minutes
      if (provider.mode === "meta" && Date.now() - (state.lastDiscovery ?? 0) > 5 * 60_000) await discoverAccounts();

      // every account's headline numbers: one batched call
      const prev = state.overview?.signature;
      const ov = await fetchOverview();
      if (ov.signature !== prev) publish({ type: "invalidate", keys: ["overview"] }, tenant);

      if (provider.mode === "meta") await pollLeads();
    }

    // scheduled work (monitor scans, morning brief, spend guard, token expiry) – once a minute
    if (Date.now() - (state.lastSchedule ?? 0) >= 60_000) {
      state.lastSchedule = Date.now();
      const { runSchedules } = await import("./engine/schedule");
      await runSchedules(state.overview ?? (await fetchOverview()));
    }
  } catch (err) {
    console.error("[ocp live]", tenant, err);
  } finally {
    state.ticking = false;
  }
}

/** Fallback when the webhook isn't connected: diff the lead list. */
async function pollLeads() {
  const { state } = await live();
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
  for (const lead of newLeads) await ingestLead(lead, "demo");
}
