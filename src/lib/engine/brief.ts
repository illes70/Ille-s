import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Brief, PeriodTotals } from "../types";
import type { Overview } from "../live";
import { fmtMoney, fmtNum } from "../format";
import { logActivity, newId, readStore, settingsWithDefaults, updateStore } from "../store";
import { runScan } from "./monitor";

// The morning brief: "Jó reggelt! Tegnap ennyi lead jött ennyiért; ma ezt csináld."
// Numbers and to-dos are computed (always correct); the wording is written by Claude
// in the voice of a senior media buyer when an API key is set, else a template.

const add = (a: PeriodTotals, b?: PeriodTotals): PeriodTotals => ({
  spend: a.spend + (b?.spend ?? 0),
  leads: a.leads + (b?.leads ?? 0),
  clicks: a.clicks + (b?.clicks ?? 0),
  impressions: a.impressions + (b?.impressions ?? 0),
});
const zero = (): PeriodTotals => ({ spend: 0, leads: 0, clicks: 0, impressions: 0 });

export function localDate(timezone: string, at = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}
export function localTime(timezone: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

export async function writeBrief(ov: Overview, firstName?: string): Promise<Brief> {
  // fresh proposals first, so the to-do list is current
  await runScan("cron").catch((err) => console.error("[ocp brief scan]", err));
  const store = await readStore();
  const s = settingsWithDefaults(store.settings);
  const currency = ov.rows[0]?.account.currency ?? s.currency;
  const money = (n: number) => fmtMoney(n, currency);

  let yesterday = zero();
  let last7 = zero();
  for (const r of ov.rows) {
    yesterday = add(yesterday, r.summary.yesterday);
    last7 = add(last7, r.summary.last7);
  }
  const lastBrief = store.briefs?.[0]?.createdAt;
  const newLeads = store.leads.filter((l) => (!lastBrief || l.createdAt > lastBrief) && l.quality?.verdict !== "spam").length;
  const uncalled = store.leads.filter((l) => (store.leadStatus[l.id] ?? l.status) === "new" && l.quality?.verdict !== "spam").length;

  const pending = store.proposals.filter((p) => p.status === "pending");
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const todo: Brief["todo"] = [
    ...(uncalled ? [{ text: `${uncalled} lead még nincs visszahívva – kezdd velük, minden óra késés csökkenti az esélyt.`, severity: "high" as const }] : []),
    ...pending
      .sort((a, b) => rank[a.severity] - rank[b.severity])
      .slice(0, 6)
      .map((p) => ({ text: `${p.title} – ${p.reason}`, proposalId: p.id, accountId: p.accountId, severity: p.severity })),
  ];

  // per-account lines for the writer
  const accounts = ov.rows.map((r) => {
    const y = r.summary.yesterday ?? zero();
    const cpl = y.leads ? money(y.spend / y.leads) : "–";
    const w = r.summary.last7;
    return `${r.account.name}: tegnap ${money(y.spend)} / ${y.leads} lead (CPL ${cpl}); 7 nap ${money(w.spend)} / ${w.leads} lead; ${r.summary.activeAds} aktív hirdetés`;
  });

  const cplY = yesterday.leads ? money(yesterday.spend / yesterday.leads) : "–";
  const fallback = [
    `Jó reggelt${firstName ? `, ${firstName}` : ""}! ☀️`,
    `Tegnap ${money(yesterday.spend)} költéssel ${fmtNum(yesterday.leads)} lead jött (CPL ${cplY}). Az elmúlt 7 napban ${fmtNum(last7.leads)} lead, ${money(last7.spend)}.`,
    todo.length ? `Ma ennyi a dolgod: ${todo.length} tétel – lent a lista, egy kattintással jóváhagyhatók.` : "Ma nincs teendő: minden a terv szerint megy. 👌",
  ].join("\n\n");

  const text = await aiWording({ firstName, yesterday: `${money(yesterday.spend)}, ${yesterday.leads} lead, CPL ${cplY}`, last7: `${money(last7.spend)}, ${last7.leads} lead`, newLeads, uncalled, accounts, todo: todo.map((t) => t.text) }).catch(
    (err) => {
      console.error("[ocp brief ai]", err);
      return null;
    },
  );

  const brief: Brief = {
    id: newId("brf"),
    date: localDate(s.schedule.timezone),
    createdAt: new Date().toISOString(),
    text: text ?? fallback,
    totals: { yesterday, last7, newLeads },
    todo,
  };
  await updateStore(
    (d) => {
      d.briefs = [brief, ...(d.briefs ?? [])].slice(0, 60);
      d.jobs = { ...d.jobs, lastBriefDate: brief.date };
    },
    ["brief"],
  );
  await logActivity("agent", "brief", `Reggeli összefoglaló elkészült: ${todo.length} teendő mára.`);
  return brief;
}

async function aiWording(facts: Record<string, unknown>): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const client = new Anthropic();
  const msg = await client.beta.messages.create({
    model: process.env.OCP_MODEL ?? "claude-opus-5-5",
    max_tokens: 1500,
    output_config: { effort: "low" },
    system:
      "Te az OCP vagy, egy tapasztalt Meta-hirdetési szakember és ajánlat-stratéga (Hormozi-szemlélet), aki minden reggel rövid összefoglalót küld a tulajdonosnak. " +
      "Magyarul, tegezve, emberien és lényegre törően írj. Max. 6 rövid mondat. Kezdd köszönéssel (\"Jó reggelt, <név>!\"), mondd el a tegnapi számokat egy mondatban, " +
      "emeld ki az egy legfontosabb dolgot (jó vagy rossz), és zárd azzal, mi ma a #1 teendő. Ne találj ki számot, csak a kapott adatokból dolgozz. Ne használj címsort vagy felsorolást.",
    messages: [{ role: "user", content: `Adatok (JSON):\n${JSON.stringify(facts)}` }],
    fallbacks: "default",
    betas: ["server-side-fallback-2026-07-01"],
  });
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return text || null;
}
