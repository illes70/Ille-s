import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getLeads, getProvider } from "../meta/provider";
import { logActivity, newId, readStore, updateStore } from "../store";
import { runScan } from "../engine/monitor";
import { getCompany, saveCompany, searchKnowledge } from "../company";
import { composeAdImage } from "../creative/render";
import { generatePhoto } from "../creative/generate";
import { claudeImageBlock } from "../creative/claude-files";
import type { KnowledgeEntry, Proposal, Recipe } from "../types";

type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolResultContent = Exclude<Anthropic.Beta.Messages.BetaToolResultBlockParam["content"], string | undefined>;

/** A tool result that carries images (e.g. a composed ad) so the assistant can look at it. */
class Rich {
  constructor(readonly blocks: ToolResultContent) {}
}

async function withImage(text: unknown, url: string) {
  return new Rich([{ type: "text", text: JSON.stringify(text) }, await claudeImageBlock(url)] as ToolResultContent);
}

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
      const company = await getCompany();
      return {
        mode: provider.mode,
        account: provider.account,
        otherAccounts: (await provider.listAccounts()).filter((a) => a.id !== provider.account.id),
        currency: provider.account.currency,
        targetCpl: company.targetCpl ?? store.settings.targetCpl,
        autopilot: store.settings.autopilot,
        company,
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
        .map(({ daily: _d, ...a }) => a);
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
    "Új hirdetések feltöltése egy meglévő hirdetéscsoportba. Minden variánshoz kell kép: image_url (OCP kép: /api/media/…, vagy nyilvános URL – pl. a compose_ad_image eredménye) vagy reuse_image_from_ad_id (egy meglévő hirdetés képe). Alapból PAUSED állapotban jönnek létre; activate=true csak ha a felhasználó kifejezetten kérte az élesítést.",
    z.object({
      adset_id: z.string(),
      activate: z.boolean().default(false),
      lead_form_id: z.string().optional(),
      link_url: z.string().optional(),
      recipe_id: z.string().optional().describe("ha egy recept alapján készül, annak az azonosítója"),
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
    async ({ adset_id, activate, lead_form_id, link_url, recipe_id, ads }) => {
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
            recipeId: recipe_id,
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
    async ({ limit }) => (await getLeads()).slice(0, limit),
  ),
  tool(
    "set_lead_status",
    "Lead státuszának állítása: new (új), contacted (felhívva), survey (felmérés), won (megnyert), lost (elveszett).",
    z.object({ lead_id: z.string(), status: z.enum(["new", "contacted", "survey", "won", "lost"]) }),
    () => "Lead státusz módosítása",
    async ({ lead_id, status }) => {
      await updateStore((d) => void (d.leadStatus[lead_id] = status), ["leads"]);
      return { ok: true };
    },
  ),
  tool(
    "get_ad_daily",
    "Egy hirdetés napi bontású adatai (költés, megjelenés, kattintás, lead) az elmúlt N napra. Trendek, kiugrások vizsgálatához.",
    z.object({ ad_id: z.string(), days: z.number().int().min(1).max(90).default(14) }),
    () => "Napi adatok lekérése",
    async ({ ad_id, days }) => {
      const ad = (await (await getProvider()).listAds()).find((a) => a.id === ad_id);
      if (!ad) throw new Error(`Nincs ilyen hirdetés: ${ad_id}`);
      return { name: ad.name, daily: ad.daily.slice(-days) };
    },
  ),
  tool(
    "list_recipes",
    "A bevált hirdetés-receptek (kreatívformák) listája: mi nem változhat, mi kötelező, mi szabad, szövegsablon, és a példa-hirdetés eredménye. Új hirdetések készítésekor ezekből indulj ki.",
    z.object({}),
    () => "Receptek lekérése",
    async () => {
      const [store, ads] = await Promise.all([readStore(), getProvider().then((p) => p.listAds())]);
      return store.recipes.map((r) => {
        const used = ads.filter((a) => a.creative.recipeId === r.id || a.id === r.exampleAdId);
        const spend = used.reduce((s, a) => s + a.metrics.spend, 0);
        const leads = used.reduce((s, a) => s + a.metrics.leads, 0);
        return { ...r, ads: used.length, last7d: { spend, leads, cpl: leads ? Math.round(spend / leads) : null } };
      });
    },
  ),
  tool(
    "create_recipe",
    "Új recept mentése egy jól teljesítő hirdetésből, hogy más ajánlatokra/ügyfelekre is át lehessen vinni.",
    z.object({
      name: z.string(),
      description: z.string(),
      fixed: z.array(z.string()).min(1),
      required: z.array(z.string()),
      free: z.array(z.string()),
      text_template: z.string(),
      example_ad_id: z.string().optional(),
    }),
    () => "Recept mentése",
    async (i) => {
      const ads = await (await getProvider()).listAds();
      const example = ads.find((a) => a.id === i.example_ad_id);
      const r: Recipe = {
        id: newId("rcp"),
        name: i.name,
        description: i.description,
        fixed: i.fixed,
        required: i.required,
        free: i.free,
        textTemplate: i.text_template,
        exampleAdId: i.example_ad_id,
        palette: example?.creative.palette ?? ["#334155", "#0f172a"],
        createdAt: new Date().toISOString(),
      };
      await updateStore((d) => void d.recipes.unshift(r), ["recipes"]);
      await logActivity("agent", "create", `Új recept: ${r.name}`);
      return { id: r.id };
    },
  ),
  tool(
    "get_company_profile",
    "Az aktív cég profilja: szolgáltatások és árak, telefonszám, terület, weboldal, miért őket válasszák (usp), márkahang, színek, megjegyzések, Facebook-oldal. Minden szöveg és kép ezen alapuljon.",
    z.object({}),
    () => "Cégprofil betöltése",
    async () => getCompany(),
  ),
  tool(
    "update_company_profile",
    "Cégprofil frissítése (csak a megadott mezők változnak). Akkor használd, ha a felhasználó új infót ad a cégről (ár, szolgáltatás, telefonszám, hangnem…).",
    z.object({
      name: z.string().optional(),
      industry: z.string().optional(),
      services: z.array(z.object({ name: z.string(), price: z.string().optional() })).optional(),
      phone: z.string().optional(),
      area: z.string().optional(),
      website: z.string().optional(),
      usp: z.string().optional(),
      brandVoice: z.string().optional(),
      targetCpl: z.number().positive().optional(),
      notes: z.string().optional(),
    }),
    () => "Cégprofil frissítése",
    async (patch) => {
      const accountId = (await getProvider()).account.id;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const c = await saveCompany({ ...clean, accountId });
      await logActivity("agent", "action", `Cégprofil frissítve: ${Object.keys(clean).join(", ")}`);
      return c;
    },
  ),
  tool(
    "search_knowledge",
    "Keresés a tudásbázisban (a felhasználó saját tapasztalatai + OCP döntési kézikönyv: leállítás, skálázás, tanulási fázis, kreatív fáradás, ajánlatépítés, horgok, űrlapok). Döntés vagy javaslat előtt hívd meg, és a saját (own) bejegyzéseket részesítsd előnyben.",
    z.object({ query: z.string() }),
    (i) => `Tudásbázis: „${i.query}”`,
    async ({ query }) => (await searchKnowledge(query)).map(({ id, title, body, kind, source }) => ({ id, title, body, kind, source })),
  ),
  tool(
    "add_knowledge",
    "Tanulság mentése a tudásbázisba a felhasználó saját tapasztalataként (pl. „ennél az ügyfélnél a zöld dobozos kép mindig nyer”). Akkor használd, ha a felhasználó megoszt egy tapasztalatot, vagy kéri, hogy jegyezd meg.",
    z.object({ title: z.string(), body: z.string(), tags: z.array(z.string()).default([]) }),
    () => "Tanulság mentése",
    async (i) => {
      const entry: KnowledgeEntry = { id: newId("kb"), kind: "own", createdAt: new Date().toISOString(), ...i, source: "Chat" };
      await updateStore((d) => void d.knowledge.unshift(entry), ["knowledge"]);
      await logActivity("agent", "create", `Tudásbázis: ${i.title}`);
      return { id: entry.id };
    },
  ),
  tool(
    "compose_ad_image",
    "Hirdetéskép készítése pontos szöveggel egy fotóra (ingyenes, a szöveg mindig hibátlan). Sablonok: green_box (sötétzöld dobozok: márka, szolgáltatás, ár, felszólítás, alsó sor, telefon – a „Zöld dobozos” recept), headline_band (fotó + alul márkaszínű sáv headline-nal és gombbal), before_after (két fotó: előtte/utána + sáv). Fotó: a felhasználó feltöltött képe, egy meglévő hirdetés képe (list_ads → creative.imageUrl) vagy generate_photo eredménye. Az eredményt megnézheted, és mehet a create_ads / update_ad_creative image_url-jébe.",
    z.object({
      template: z.enum(["green_box", "headline_band", "before_after"]),
      photo_url: z.string().optional(),
      photo2_url: z.string().optional().describe("before_after: az „utána” fotó"),
      brand: z.string().optional(),
      service: z.string().optional(),
      price: z.string().optional().describe("pl. „17 000 Ft / m²”"),
      price_note: z.string().optional().describe("pl. „(anyag + munkadíj)”"),
      headline: z.string().optional(),
      subline: z.string().optional(),
      cta: z.string().optional(),
      bottom_line: z.string().optional(),
      phone: z.string().optional(),
      format: z.enum(["feed", "square", "story"]).default("feed"),
    }),
    (i) => `Hirdetéskép készítése (${i.template})`,
    async (i) => {
      const company = await getCompany();
      const item = await composeAdImage({
        template: i.template,
        photoUrl: i.photo_url,
        photo2Url: i.photo2_url,
        brand: i.brand,
        service: i.service,
        price: i.price,
        priceNote: i.price_note,
        headline: i.headline,
        subline: i.subline,
        cta: i.cta,
        bottomLine: i.bottom_line,
        phone: i.phone,
        format: i.format,
        colors: company.colors,
        accountId: company.accountId,
      });
      await logActivity("agent", "create", `Hirdetéskép elkészült (${i.template}): ${item.url}`);
      return withImage({ image_url: item.url, note: "Mutasd meg a felhasználónak markdown képként: ![](" + item.url + ")" }, item.url);
    },
  ),
  tool(
    "generate_photo",
    "Új fotó generálása AI-jal (OpenAI, képenként fizetős – csak ha a felhasználó kéri, vagy nincs használható fotó). Szöveget NE kérj a képre: a szöveget utána a compose_ad_image teszi rá pontosan. Valósághű, helyi munkafotó-stílust kérj, ne stock-hatást.",
    z.object({ prompt: z.string(), size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1536") }),
    () => "Fotó generálása",
    async ({ prompt, size }) => {
      const item = await generatePhoto(prompt, size, (await getProvider()).account.id);
      await logActivity("agent", "create", `AI fotó generálva: ${item.url}`);
      return withImage({ image_url: item.url }, item.url);
    },
  ),
  tool(
    "list_media",
    "A cég legutóbbi képei a médiatárban (feltöltött, generált, sablonos), URL-lel.",
    z.object({ limit: z.number().int().min(1).max(50).default(12) }),
    () => "Médiatár",
    async ({ limit }) => {
      const id = (await getProvider()).account.id;
      return (await readStore()).media.filter((m) => !m.accountId || m.accountId === id).slice(0, limit);
    },
  ),
  tool(
    "update_ad_creative",
    "Futó hirdetés szövegének és/vagy képének cseréje. A Metán ez új kreatívot jelent: a hirdetés újra ellenőrzésre megy, és a tanulás részben újraindulhat – ezt mondd el a felhasználónak. Tesztelésnél inkább új hirdetést javasolj mellé (create_ads).",
    z.object({ ad_id: z.string(), headline: z.string().max(60).optional(), primary_text: z.string().max(600).optional(), image_url: z.string().optional() }),
    () => "Kreatív cseréje",
    async ({ ad_id, headline, primary_text, image_url }) => {
      await (await getProvider()).updateAdCreative(ad_id, { headline, primaryText: primary_text, imageUrl: image_url });
      await logActivity("agent", "action", `Kreatív frissítve: ${ad_id}${image_url ? " (új kép)" : ""}${headline || primary_text ? " (új szöveg)" : ""}`);
      return { ok: true };
    },
  ),
  tool(
    "get_system_health",
    "Rendszerállapot: Claude, Meta app, Facebook-kapcsolat és engedélyek, hirdetési fiókok, oldalak és azonnali leadek, webhook, képgenerálás. Ha valami nem működik, ezzel kezdd, és a megadott javítási lépéseket mondd el pontosan.",
    z.object({}),
    () => "Rendszerállapot ellenőrzése",
    async () => {
      const { runHealthChecks } = await import("../health");
      return runHealthChecks(process.env.OCP_PUBLIC_URL ?? "http://localhost:3000");
    },
  ),
  tool(
    "get_ads_manager_link",
    "Közvetlen link a Meta Ads Managerhez (a fiókhoz vagy egy konkrét hirdetéshez) – ha a felhasználónak kézzel kell valamit megnéznie vagy beállítania.",
    z.object({ ad_id: z.string().optional() }),
    () => "Ads Manager link",
    async ({ ad_id }) => {
      const { adsManagerUrl } = await import("../meta/graph");
      return { url: adsManagerUrl((await getProvider()).account.id, ad_id) };
    },
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
        accountId: (await getProvider()).account.id,
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

export async function runTool(name: string, input: unknown): Promise<{ ok: boolean; content: string | ToolResultContent }> {
  const t = tools.find((x) => x.definition.name === name);
  if (!t) return { ok: false, content: `Ismeretlen eszköz: ${name}` };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, content: `Érvénytelen bemenet: ${parsed.error.message}` };
  }
  try {
    const result = await t.run(parsed.data as never);
    if (result instanceof Rich) return { ok: true, content: result.blocks };
    return { ok: true, content: JSON.stringify(result ?? { ok: true }) };
  } catch (e) {
    return { ok: false, content: e instanceof Error ? e.message : String(e) };
  }
}
