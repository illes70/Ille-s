import "server-only";
import type { Lead, MetaPage } from "../types";
import { all, graph, metaPages, toLead, type RawLead } from "./graph";
import { subscribeLeadgen } from "./oauth";
import { logActivity, readStore, updateStore } from "../store";
import { currentUser } from "../tenant";

// "Engedélyezed, hogy az összes leadet bekössem?" – after a yes, for every page:
//   1. switch on the instant lead webhook (seconds after a form is sent)
//   2. check that the page really lets this app read leads (Leads Access Manager)
//   3. pull in the leads of the last 90 days
// Pages where something blocks it get an exact, clickable fix.

export interface PageLeadStatus {
  id: string;
  name: string;
  /** webhook switched on */
  live: boolean;
  /** leads can be read */
  readable: boolean;
  forms: number;
  imported: number;
  problem?: string;
  fix?: { text: string; href: string };
}

const LEADS_ACCESS_FIX = (page: MetaPage) => ({
  text: `Meta Business Suite → Beállítások → Integrációk → Lead-hozzáférés („${page.name}”): add hozzá az OCP-t (vagy kapcsold ki a korlátozást), utána nyomd meg újra az „Ellenőrzés” gombot.`,
  href: "https://business.facebook.com/latest/settings/leads_accesses",
});

async function checkPage(page: MetaPage, sinceDays: number): Promise<{ status: PageLeadStatus; leads: Lead[] }> {
  const status: PageLeadStatus = { id: page.id, name: page.name, live: false, readable: false, forms: 0, imported: 0 };
  status.live = await subscribeLeadgen(page.id, page.token);
  let forms: { id: string; name: string }[] = [];
  try {
    forms = await all<{ id: string; name: string }>(`${page.id}/leadgen_forms`, { fields: "id,name", limit: "50" }, 200, page.token);
    status.forms = forms.length;
    status.readable = true;
  } catch (err) {
    status.problem = `A Meta nem engedi olvasni ennek az oldalnak a leadjeit: ${err instanceof Error ? err.message : String(err)}`;
    status.fix = LEADS_ACCESS_FIX(page);
    return { status, leads: [] };
  }
  if (!status.live && !status.problem) {
    status.problem = "Az azonnali lead-értesítés nem kapcsolható be (az oldalon nincs elég jogod, vagy a Meta app webhookja nincs beállítva). A leadek percenként így is bejönnek.";
    status.fix = { text: "Rendszerállapot → „Azonnali leadek” → Javítás", href: "/settings#health" };
  }
  const since = Math.floor((Date.now() - sinceDays * 86_400_000) / 1000);
  const leads: Lead[] = [];
  for (const form of forms) {
    try {
      const rows = await all<RawLead>(
        `${form.id}/leads`,
        { fields: "id,created_time,ad_id,field_data", limit: "100", filtering: [{ field: "time_created", operator: "GREATER_THAN", value: since }] },
        2000,
        page.token,
      );
      leads.push(...rows.map((l) => toLead(l, form.name)));
    } catch (err) {
      status.readable = false;
      status.problem = `„${form.name}” űrlap leadjei nem olvashatók: ${err instanceof Error ? err.message : String(err)}`;
      status.fix = LEADS_ACCESS_FIX(page);
    }
  }
  return { status, leads };
}

/** Which ad account a lead came from (one batched lookup per distinct ad). */
async function attachAccounts(leads: Lead[]) {
  const ads = [...new Set(leads.flatMap((l) => (l.adId ? [l.adId] : [])))];
  const byAd = new Map<string, string>();
  for (let i = 0; i < ads.length; i += 50) {
    const chunk = ads.slice(i, i + 50);
    const res = await graph<Record<string, { account_id?: string }>>("", { params: { ids: chunk.join(","), fields: "account_id" } }).catch(() => ({}) as Record<string, { account_id?: string }>);
    for (const [id, v] of Object.entries(res)) if (v.account_id) byAd.set(id, `act_${v.account_id}`);
  }
  for (const l of leads) if (l.adId) l.accountId = byAd.get(l.adId);
}

/** The "yes" button: consent + webhooks + backfill for every page (or the given ones). */
export async function connectAllLeads(pageIds?: string[], sinceDays = 90): Promise<PageLeadStatus[]> {
  const me = await currentUser();
  const pages = (await metaPages()).filter((p) => !pageIds || pageIds.includes(p.id));
  const results = await Promise.all(pages.map((p) => checkPage(p, sinceDays)));
  const leads = results.flatMap((r) => r.leads);
  await attachAccounts(leads).catch(() => undefined);

  const { assessLead } = await import("../lead-quality");
  const added = await updateStore(
    (d) => {
      d.leadConsent = {
        userId: me?.id ?? "unknown",
        userName: me?.name ?? "ismeretlen",
        at: new Date().toISOString(),
        pageIds: [...new Set([...(d.leadConsent?.pageIds ?? []), ...pages.map((p) => p.id)])],
      };
      if (d.metaAuth) {
        for (const p of d.metaAuth.pages) {
          const r = results.find((x) => x.status.id === p.id);
          if (r) p.leadgenSubscribed = r.status.live;
        }
      }
      const known = new Set(d.leads.map((l) => l.id));
      const fresh = leads.filter((l) => !known.has(l.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const l of fresh) {
        l.quality = assessLead(l, d.leads);
        d.leads.unshift(l);
      }
      d.leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      d.leads = d.leads.slice(0, 20000);
      return fresh.length;
    },
    ["leads", "health", "ads", "overview"],
  );
  for (const r of results) r.status.imported = r.leads.length;
  const live = results.filter((r) => r.status.live).length;
  const problems = results.filter((r) => r.status.problem).length;
  await logActivity(
    "user",
    "action",
    `Leadek bekötve (${me?.name ?? "felhasználó"} engedélyével): ${pages.length} oldal, ${live} azonnali értesítéssel, ${added} korábbi lead betöltve${problems ? `, ${problems} oldalon teendő van` : ""}.`,
  );
  return results.map((r) => r.status);
}

/** Current state for the consent card (no changes). */
export async function leadAccessOverview() {
  const store = await readStore();
  const pages = await metaPages().catch(() => [] as MetaPage[]);
  return {
    consent: store.leadConsent ?? null,
    pages: pages.map((p) => ({ id: p.id, name: p.name, live: !!p.leadgenSubscribed, consented: !!store.leadConsent?.pageIds.includes(p.id) })),
  };
}

/** Withdraw: webhooks off, stored leads stay until deleted (GDPR: the user decides). */
export async function revokeLeadConsent() {
  const pages = await metaPages().catch(() => [] as MetaPage[]);
  await Promise.all(pages.map((p) => graph(`${p.id}/subscribed_apps`, { method: "DELETE", token: p.token }).catch(() => undefined)));
  await updateStore(
    (d) => {
      d.leadConsent = undefined;
      if (d.metaAuth) for (const p of d.metaAuth.pages) p.leadgenSubscribed = false;
    },
    ["leads", "health"],
  );
  await logActivity("user", "action", "Lead-hozzáférés visszavonva – új leadek nem érkeznek az OCP-be.");
}
