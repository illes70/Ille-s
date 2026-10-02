import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getProvider } from "../meta/provider";
import { logActivity, newId, readStore, updateStore } from "../store";
import { runScan } from "../engine/monitor";
import type { Proposal } from "../types";

type Tool = Anthropic.Beta.Messages.BetaTool;

interface ToolDef<S extends z.ZodType> {
  schema: S;
  definition: Tool;
  /** short Hungarian label shown in the chat while the tool runs */
  label: (input: z.infer<S>) => string;
  run: (input: z.infer<S>) => Promise<unknown>;
}

function tool<S extends z.ZodType>(name: string, description: string, schema: S, label: ToolDef<S>["label"], run: ToolDef<S>["run"]): ToolDef<S> {
  const input_schema = z.toJSONSchema(schema) as Tool["input_schema"];
  delete (input_schema as Record<string, unknown>)["$schema"];
  return {
    schema,
    label,
    run,
    definition: { name, description, input_schema, eager_input_streaming: true },
  };
}

const CTA = z
  .enum(["LEARN_MORE", "SIGN_UP", "GET_QUOTE", "CONTACT_US", "APPLY_NOW", "BOOK_NOW", "CALL_NOW", "SUBSCRIBE"])
  .describe("Meta call-to-action típus");

const tools = [
  tool(
    "get_account_overview",
    "Összesítő a hirdetési fiókról az elmúlt 7 napra: költés, leadek, CPL, aktív hirdetések, nyitott javaslatok és a beállított célok.",
    z.object({}),
    () => "Fiók áttekintése",
    async () => {
      const provider = await getProvider();
      const [ads, store] = await Promise.all([provider.listAds(), readStore()]);
      const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
      const leads = ads.reduce((s, a) => s + a.metrics.leads, 0);
      return {
        mode: provider.mode,
        currency: store.settings.currency,
        targetCpl: store.settings.targetCpl,
        autopilot: store.settings.autopilot,
        brandVoice: store.settings.brandVoice,
        last7d: { spend, leads, cpl: leads ? Math.round(spend / leads) : null },
        activeAds: ads.filter((a) => a.status === "ACTIVE").length,
        totalAds: ads.length,
        pendingProposals: store.proposals.filter((p) => p.status === "pending").length,
        lastScanAt: store.lastScanAt ?? null,
      };
    },
  ),
  tool(
    "list_ads",
    "Hirdetések listája kreatívval és 7 napos adatokkal (spend, leads, cpl, ctr, frequency, cpm). Szűrhető státuszra.",
    z.object({
      status: z.enum(["ACTIVE", "PAUSED", "ALL"]).default("ALL"),
      sort_by: z.enum(["spend", "cpl", "ctr", "frequency", "leads"]).default("spend"),
    }),
    () => "Hirdetések lekérése",
    async ({ status, sort_by }) => {
      const ads = (await (await getProvider()).listAds()).filter(
        (a) => status === "ALL" || a.status === status,
      );
      const key = (a: (typeof ads)[number]) =>
        sort_by === "cpl" ? (a.metrics.cpl ?? Infinity) : a.metrics[sort_by];
      return ads
        .sort((a, b) => (sort_by === "cpl" ? key(a) - key(b) : key(b) - key(a)))
        .map(({ spendTrend: _t, ...a }) => a);
    },
  ),
  tool(
    "set_ad_status",
    "Hirdetés leállítása (PAUSED) vagy indítása (ACTIVE). Csak akkor hívd, ha a felhasználó kérte, vagy egyértelműen jóváhagyta.",
    z.object({ ad_id: z.string(), status: z.enum(["ACTIVE", "PAUSED"]), reason: z.string() }),
    (i) => (i.status === "PAUSED" ? "Hirdetés leállítása" : "Hirdetés indítása"),
    async ({ ad_id, status, reason }) => {
      await (await getProvider()).setAdStatus(ad_id, status);
      await logActivity("agent", "action", `${status === "PAUSED" ? "Leállítottam" : "Elindítottam"}: ${ad_id} – ${reason}`);
      return { ok: true };
    },
  ),
  tool(
    "set_adset_budget",
    "Hirdetéscsoport napi büdzséjének módosítása (fiók pénznemében, egész szám). A robotpilóta maximum emelési korlátja érvényes, kivéve ha a felhasználó kifejezetten nagyobb emelést kért.",
    z.object({
      adset_id: z.string(),
      daily_budget: z.number().int().positive(),
      user_explicitly_requested: z.boolean().describe("true, ha a felhasználó maga mondta ezt az összeget"),
      reason: z.string(),
    }),
    () => "Büdzsé módosítása",
    async ({ adset_id, daily_budget, user_explicitly_requested, reason }) => {
      const provider = await getProvider();
      const [ads, store] = await Promise.all([provider.listAds(), readStore()]);
      const current = ads.find((a) => a.adsetId === adset_id)?.adsetDailyBudget;
      if (current === undefined) throw new Error(`Nincs ilyen hirdetéscsoport: ${adset_id}`);
      const maxPct = store.settings.autopilot.maxBudgetIncreasePct;
      if (!user_explicitly_requested && daily_budget > current * (1 + maxPct / 100)) {
        throw new Error(
          `Az emelés meghaladja a ${maxPct}%-os korlátot (${current} → ${daily_budget}). Kérdezd meg a felhasználót.`,
        );
      }
      await provider.setAdsetBudget(adset_id, daily_budget);
      await logActivity("agent", "action", `Büdzsé ${adset_id}: ${current} → ${daily_budget} (${reason})`);
      return { ok: true, previous: current, now: daily_budget };
    },
  ),
  tool(
    "create_ads",
    "Új hirdetések feltöltése egy meglévő hirdetéscsoportba. Minden variánshoz kell kép: image_url (nyilvános URL) vagy reuse_image_from_ad_id (egy meglévő hirdetés képe). Alapból PAUSED állapotban jönnek létre; activate=true csak ha a felhasználó kifejezetten kérte az élesítést.",
    z.object({
      adset_id: z.string(),
      activate: z.boolean().default(false),
      lead_form_id: z.string().optional(),
      link_url: z.string().optional(),
      ads: z
        .array(
          z.object({
            name: z.string(),
            headline: z.string().max(60),
            primary_text: z.string().max(600),
            cta: CTA,
            image_url: z.string().optional(),
            reuse_image_from_ad_id: z.string().optional(),
          }),
        )
        .min(1)
        .max(20),
    }),
    (i) => `${i.ads.length} hirdetés feltöltése`,
    async ({ adset_id, activate, lead_form_id, link_url, ads }) => {
      const provider = await getProvider();
      const results = [];
      for (const ad of ads) {
        try {
          const { id } = await provider.createAd({
            adsetId: adset_id,
            name: ad.name,
            headline: ad.headline,
            primaryText: ad.primary_text,
            cta: ad.cta,
            imageUrl: ad.image_url,
            reuseImageFromAdId: ad.reuse_image_from_ad_id,
            leadFormId: lead_form_id,
            linkUrl: link_url,
            activate,
          });
          results.push({ name: ad.name, id, ok: true });
        } catch (e) {
          results.push({ name: ad.name, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const ok = results.filter((r) => r.ok).length;
      await logActivity("agent", "create", `${ok}/${ads.length} új hirdetés feltöltve (${activate ? "élesítve" : "szüneteltetve"}) – ${adset_id}`);
      return results;
    },
  ),
  tool(
    "create_lead_form",
    "Meta Instant Form (lead űrlap) létrehozása a Facebook oldalon. Rövid, kevés mezős űrlapot javasolj (név + telefon + 1 kérdés).",
    z.object({
      name: z.string(),
      intro: z.string(),
      questions: z.array(z.enum(["FULL_NAME", "PHONE", "EMAIL", "CITY"])).min(1),
      custom_question: z.string().optional(),
      privacy_url: z.string(),
      thank_you: z.string(),
    }),
    () => "Instant form létrehozása",
    async (i) => {
      const res = await (await getProvider()).createLeadForm({
        name: i.name,
        intro: i.intro,
        questions: i.questions,
        customQuestion: i.custom_question,
        privacyUrl: i.privacy_url,
        thankYou: i.thank_you,
      });
      await logActivity("agent", "create", `Instant form létrehozva: ${i.name}`);
      return res;
    },
  ),
  tool(
    "list_leads",
    "Legutóbbi leadek egyszerűsített formában (név, telefon, email, város, megjegyzés, melyik hirdetésből).",
    z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    () => "Leadek lekérése",
    async ({ limit }) => (await (await getProvider()).listLeads()).slice(0, limit),
  ),
  tool(
    "run_monitor_scan",
    "Lefuttatja a figyelő szabályokat (költés eredmény nélkül, drága CPL, magas frequency, skálázható nyertesek, gyenge CTR) és új javaslatokat tesz az Üzenetek fülre.",
    z.object({}),
    () => "Fiók átvizsgálása",
    async () => runScan("agent"),
  ),
  tool(
    "list_proposals",
    "A nyitott (jóváhagyásra váró) javaslatok listája.",
    z.object({}),
    () => "Javaslatok lekérése",
    async () => (await readStore()).proposals.filter((p) => p.status === "pending"),
  ),
  tool(
    "create_proposal",
    "Javaslat küldése a felhasználónak az Üzenetek fülre (pl. „ma ezt csinálnám, mit gondolsz?”). Ha van konkrét végrehajtható lépés, add meg az action mezőt; jóváhagyáskor az OCP automatikusan végrehajtja.",
    z.object({
      title: z.string(),
      reason: z.string(),
      impact: z.string().optional(),
      severity: z.enum(["high", "medium", "low"]).default("medium"),
      ad_id: z.string().optional(),
      action: z
        .discriminatedUnion("type", [
          z.object({ type: z.literal("set_status"), adId: z.string(), status: z.enum(["ACTIVE", "PAUSED"]) }),
          z.object({ type: z.literal("set_budget"), adsetId: z.string(), dailyBudget: z.number().int().positive() }),
          z.object({ type: z.literal("none") }),
        ])
        .default({ type: "none" }),
    }),
    () => "Javaslat küldése",
    async (i) => {
      const p: Proposal = {
        id: newId("prp"),
        key: `agent:${Date.now()}`,
        kind: i.action.type === "set_budget" ? "scale_budget" : i.action.type === "set_status" ? (i.action.status === "PAUSED" ? "pause_ad" : "activate_ad") : "info",
        severity: i.severity,
        title: i.title,
        reason: i.reason,
        impact: i.impact,
        adId: i.ad_id,
        action: i.action,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await updateStore((d) => void d.proposals.unshift(p));
      await logActivity("agent", "proposal", `Új javaslat: ${p.title}`);
      return { id: p.id };
    },
  ),
];

export const clientTools: Tool[] = tools.map((t) => t.definition);

export const serverTools: Anthropic.Beta.Messages.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
];

export function toolLabel(name: string, input: unknown): string {
  if (name === "web_search") return "Keresés a weben";
  const t = tools.find((x) => x.definition.name === name);
  if (!t) return name;
  const parsed = t.schema.safeParse(input);
  return parsed.success ? t.label(parsed.data as never) : name;
}

export async function runTool(name: string, input: unknown): Promise<{ ok: boolean; content: string }> {
  const t = tools.find((x) => x.definition.name === name);
  if (!t) return { ok: false, content: `Ismeretlen eszköz: ${name}` };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, content: `Érvénytelen bemenet: ${parsed.error.message}` };
  }
  try {
    const result = await t.run(parsed.data as never);
    return { ok: true, content: JSON.stringify(result ?? { ok: true }) };
  } catch (e) {
    return { ok: false, content: e instanceof Error ? e.message : String(e) };
  }
}
