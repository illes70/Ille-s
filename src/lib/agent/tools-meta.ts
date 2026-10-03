import "server-only";
import { z } from "zod";
import type { Ad } from "../types";
import { getLeads, getProvider } from "../meta/provider";
import { getCompany, saveCompany } from "../company";
import { logActivity, newId, readStore, updateStore } from "../store";
import { adsChanged } from "../live-bus";
import {
  assessLearningEdit,
  assessNewAdSet,
  checkSpecialCategory,
  emptyVerdict,
  gate,
  lintAdCopy,
  merge,
  type SpecialCategory,
  type Verdict,
} from "../meta/advisor";
import { confirmedFlag, tool, type ToolDef } from "./tool-kit";
import { DEMO_NOTE, demoAudiences, demoBreakdown, demoCreate, demoEstimate, demoHealth, demoSearchTargeting, demoStructure } from "../meta/demo-manage";

// Ads Manager-level tools: audit, analyse, build and change campaigns, ad sets,
// audiences – everything the Meta UI can do for a lead-gen advertiser.
// Risky writes go through the advisor gate (needs_confirmation / refused).

const ctx = async () => {
  const provider = await getProvider();
  const [ads, company, store] = await Promise.all([provider.listAds(), getCompany(), readStore()]);
  return { provider, meta: provider.mode === "meta", accountId: provider.account.id, ads, company, store, targetCpl: company.targetCpl ?? store.settings.targetCpl };
};
const manage = () => import("../meta/manage");

const DATE_PRESETS = ["today", "yesterday", "last_3d", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "last_90d"] as const;
const PRESET_DAYS: Record<(typeof DATE_PRESETS)[number], number> = { today: 1, yesterday: 1, last_3d: 3, last_7d: 7, last_14d: 14, last_30d: 30, this_month: 30, last_month: 30, last_90d: 90 };

const Targeting = z.object({
  countries: z.array(z.string().length(2)).optional().describe("pl. [\"HU\"]"),
  regions: z.array(z.object({ key: z.string(), name: z.string().optional() })).optional().describe("search_targeting(location) kulcsok"),
  cities: z.array(z.object({ key: z.string(), name: z.string().optional(), radius_km: z.number().min(1).max(80).optional() })).optional(),
  points: z.array(z.object({ latitude: z.number(), longitude: z.number(), radius_km: z.number().min(1).max(80), name: z.string().optional() })).optional(),
  location_types: z.array(z.enum(["home", "recent", "travel_in"])).optional().describe("alap: ott élők + nemrég ott jártak"),
  age_min: z.number().int().min(18).max(65).optional(),
  age_max: z.number().int().min(18).max(65).optional(),
  genders: z.array(z.enum(["male", "female"])).optional().describe("üresen = mindenki (ajánlott)"),
  interests: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  behaviors: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  custom_audiences: z.array(z.string()).optional(),
  excluded_custom_audiences: z.array(z.string()).optional(),
  advantage_audience: z.boolean().default(true).describe("Advantage+ közönség: a jelek csak javaslatok (ajánlott)"),
  placements: z
    .object({
      facebook: z.array(z.string()).optional().describe("feed, marketplace, video_feeds, story, facebook_reels, search, right_hand_column, instream_video, profile_feed"),
      instagram: z.array(z.string()).optional().describe("stream, story, reels, explore, explore_home, profile_feed, ig_search"),
      messenger: z.array(z.string()).optional().describe("story"),
      audience_network: z.array(z.string()).optional().describe("classic, rewarded_video"),
    })
    .optional()
    .describe("ÜRESEN = Advantage+ elhelyezések (ajánlott). Csak indokolt esetben add meg."),
});
type TargetingIn = z.infer<typeof Targeting>;

const OBJECTIVES = ["OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS", "OUTCOME_APP_PROMOTION"] as const;
const EXPECTED_OBJECTIVE: Record<string, (typeof OBJECTIVES)[number][]> = {
  leads: ["OUTCOME_LEADS"],
  messages: ["OUTCOME_LEADS", "OUTCOME_ENGAGEMENT"],
  calls: ["OUTCOME_LEADS"],
  sales: ["OUTCOME_SALES"],
  traffic: ["OUTCOME_TRAFFIC"],
  awareness: ["OUTCOME_AWARENESS"],
  app: ["OUTCOME_APP_PROMOTION"],
};
const DESTINATION: Record<string, string | undefined> = {
  instant_form: "ON_AD",
  website: "WEBSITE",
  messenger: "MESSENGER",
  whatsapp: "WHATSAPP",
  instagram_direct: "INSTAGRAM_DIRECT",
  phone_call: "PHONE_CALL",
  none: undefined,
};

async function pageIdFor(accountId: string, companyPageId?: string) {
  if (companyPageId) return companyPageId;
  const { graph, metaPages } = await import("../meta/graph");
  const promote = await graph<{ data: { id: string }[] }>(`${accountId}/promote_pages`, { params: { fields: "id", limit: "1" } }).catch(() => null);
  return promote?.data[0]?.id ?? (await metaPages())[0]?.id;
}

const minRadius = (t: TargetingIn) => {
  const r = [...(t.cities ?? []).map((c) => c.radius_km).filter((x): x is number => !!x), ...(t.points ?? []).map((p) => p.radius_km)];
  return r.length ? Math.min(...r) : undefined;
};

/** Special ad categories forbid narrowing by age, gender and small radius. */
function specialCategoryTargeting(cats: string[], t: TargetingIn): Verdict {
  const v = emptyVerdict();
  const active = cats.filter((c) => c && c !== "NONE");
  if (!active.length) return v;
  if (t.genders?.length === 1) v.refuse.push("Speciális kategóriás kampányban nem lehet nem szerint célozni.");
  if ((t.age_min ?? 18) > 18 || (t.age_max ?? 65) < 65) v.refuse.push("Speciális kategóriás kampányban a korosztály 18–65+ kell legyen.");
  const r = minRadius(t);
  if (r !== undefined && r < 25) v.refuse.push("Speciális kategóriás kampányban a sugár legalább ~25 km (15 mérföld).");
  if (v.refuse.length) v.alternatives.push("Célozz teljes korosztályra, nemtől függetlenül, legalább 25 km-es sugárral vagy megyére/országra.");
  return v;
}

export const metaTools: ToolDef[] = [
  tool(
    "get_account_health",
    "A hirdetési fiók egészsége: státusz (aktív/letiltva/fizetési gond), elköltött összeg és költési korlát, tartozás, elutasított/hibás hirdetések az okokkal, Pixelek utolsó jelzése. Hibakeresésnél és napi átnézésnél ezzel kezdj.",
    z.object({}),
    () => "Fiók állapotának ellenőrzése",
    async () => {
      const c = await ctx();
      return c.meta ? (await manage()).accountHealth(c.accountId) : demoHealth(c.accountId, c.ads);
    },
  ),
  tool(
    "get_account_structure",
    "A teljes fiókstruktúra: kampányok (cél, speciális kategória, CBO/ABO büdzsé, licitstratégia, költési korlát) → hirdetéscsoportok (optimalizálás, konverziós hely, büdzsé, tanulási fázis, ütemezés, attribúció, DSA, célzás: helyszín, kor, nem, Advantage+ közönség, érdeklődések, egyéni közönségek, elhelyezések). Auditnál, javaslat előtt és új kampány tervezésekor használd.",
    z.object({}),
    () => "Kampánystruktúra áttekintése",
    async () => {
      const c = await ctx();
      return c.meta ? { campaigns: await (await manage()).accountStructure(c.accountId) } : demoStructure(c.ads, c.company);
    },
  ),
  tool(
    "get_breakdown",
    "Teljesítmény bontásban: kor, nem, kor+nem, elhelyezés, platform, régió, eszköz, napszak (óra). Szintek: account/campaign/adset/ad (ids-szel szűrhető). Erre alapozz célzási, elhelyezési és ütemezési javaslatot – de kis számoknál (pár lead) ne vonj le erős következtetést.",
    z.object({
      level: z.enum(["account", "campaign", "adset", "ad"]).default("account"),
      breakdown: z.enum(["age", "gender", "age_gender", "placement", "platform", "region", "device", "hour"]).optional(),
      date_preset: z.enum(DATE_PRESETS).default("last_30d"),
      ids: z.array(z.string()).optional(),
    }),
    (i) => `Bontás: ${i.breakdown ?? "összesítés"} (${i.date_preset})`,
    async (i) => {
      const c = await ctx();
      if (!c.meta) {
        const ads = i.ids?.length ? c.ads.filter((a) => i.ids!.includes(a[i.level === "ad" ? "id" : i.level === "adset" ? "adsetId" : "campaignId"])) : c.ads;
        return demoBreakdown(ads, PRESET_DAYS[i.date_preset], i.breakdown);
      }
      return { rows: await (await manage()).insightsBreakdown({ accountId: c.accountId, level: i.level, breakdown: i.breakdown, datePreset: i.date_preset, ids: i.ids }) };
    },
  ),
  tool(
    "search_targeting",
    "Célzási elemek keresése: kind=location (város, megye, irányítószám → key, sugárral használható) vagy kind=detailed (érdeklődés/viselkedés → id, közönségméret). Az eredmény mehet a create_ad_set / estimate_audience célzásába.",
    z.object({ kind: z.enum(["location", "detailed"]), query: z.string(), country: z.string().length(2).default("HU") }),
    (i) => `Célzás keresése: „${i.query}”`,
    async (i) => {
      const c = await ctx();
      return c.meta ? (await manage()).searchTargeting(c.accountId, i.kind, i.query, i.country) : { demo: DEMO_NOTE, results: demoSearchTargeting(i.kind, i.query) };
    },
  ),
  tool(
    "estimate_audience",
    "Becsült közönségméret (havi aktív) egy célzáshoz. Új hirdetéscsoport előtt nézd meg: helyi leadgenerálásnál ~50 000 alatt drága és lassú lehet, több százezer fölött kényelmes.",
    z.object({ targeting: Targeting, optimization_goal: z.string().default("LEAD_GENERATION") }),
    () => "Közönségméret becslése",
    async (i) => {
      const c = await ctx();
      if (!c.meta) return demoEstimate(i.targeting);
      const m = await manage();
      return m.estimateAudience(c.accountId, m.buildTargeting(i.targeting), i.optimization_goal);
    },
  ),
  tool(
    "create_campaign",
    "Új kampány létrehozása (mindig PAUSED). Cél (objective) a valódi célhoz igazodjon: leadhez OUTCOME_LEADS. Speciális kategória (lakhatás/foglalkoztatás/pénzügy) kötelező, ha a téma ilyen. Büdzsé: cbo = a kampányon (Advantage kampánybüdzsé, ajánlott 2+ csoportnál), abo = a hirdetéscsoportokon. Licit: új kampánynál LOWEST_COST_WITHOUT_CAP. Kockázatnál needs_confirmation / refused.",
    z.object({
      name: z.string(),
      intended_result: z.enum(["leads", "messages", "calls", "sales", "traffic", "awareness", "app"]).describe("mit akar valójában a felhasználó"),
      objective: z.enum(OBJECTIVES),
      special_ad_categories: z.array(z.enum(["NONE", "HOUSING", "EMPLOYMENT", "FINANCIAL_PRODUCTS_SERVICES"])).default(["NONE"]),
      budget_mode: z.enum(["cbo", "abo"]).default("abo"),
      daily_budget: z.number().int().positive().optional().describe("csak CBO-nál: a kampány napi büdzséje"),
      bid_strategy: z.enum(["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "LOWEST_COST_WITH_BID_CAP", "LOWEST_COST_WITH_MIN_ROAS"]).default("LOWEST_COST_WITHOUT_CAP"),
      spend_cap: z.number().int().positive().optional().describe("kampány teljes költési korlátja"),
      confirmed_after_warning: confirmedFlag,
    }),
    (i) => `Kampány létrehozása: ${i.name}`,
    async (i) => {
      const c = await ctx();
      const v = merge(checkSpecialCategory(`${c.company.industry}\n${i.name}`, i.special_ad_categories as SpecialCategory[]));
      if (!EXPECTED_OBJECTIVE[i.intended_result].includes(i.objective)) {
        v.warn.push(`A cél „${i.intended_result}”, de a kampánycél ${i.objective} – a Meta nem azokat keresi, akik a kívánt eredményt hozzák.`);
        v.alternatives.push(`Kampánycél: ${EXPECTED_OBJECTIVE[i.intended_result][0]}.`);
      }
      if (i.budget_mode === "cbo" && !i.daily_budget) v.refuse.push("CBO kampányhoz napi büdzsé kell (daily_budget).");
      if (i.budget_mode === "cbo" && i.daily_budget && i.daily_budget < c.targetCpl * 2) {
        v.warn.push(`Napi ${i.daily_budget} kevesebb a cél CPL (${c.targetCpl}) kétszeresénél – a kampány nehezen jön ki a tanulásból.`);
      }
      if (i.bid_strategy !== "LOWEST_COST_WITHOUT_CAP" && !c.ads.some((a) => a.metrics.leads > 0)) {
        v.warn.push("Költségcél/licitplafon olyan fióknál, ahol még nincs mért lead – könnyen alig költ.");
        v.alternatives.push("Kezdd Legnagyobb volumen (LOWEST_COST_WITHOUT_CAP) licittel.");
      }
      const stop = gate(v, i.confirmed_after_warning);
      if (stop) return stop;
      const cats = i.special_ad_categories.filter((x) => x !== "NONE");
      let id: string;
      if (c.meta) {
        id = (await (await manage()).createCampaign(c.accountId, {
          name: i.name,
          objective: i.objective,
          specialAdCategories: cats,
          cboDailyBudget: i.budget_mode === "cbo" ? i.daily_budget : undefined,
          bidStrategy: i.bid_strategy,
          spendCap: i.spend_cap,
        })).id;
      } else {
        id = await demoCreate("campaigns", { name: i.name, objective: i.objective, specialAdCategories: cats, dailyBudget: i.budget_mode === "cbo" ? i.daily_budget : undefined });
      }
      await logActivity("agent", "create", `Kampány létrehozva (szüneteltetve): ${i.name} – ${i.objective}${cats.length ? `, kategória: ${cats.join(", ")}` : ""}`);
      return { ok: true, campaign_id: id, status: "PAUSED", ...(c.meta ? {} : { demo: DEMO_NOTE }) };
    },
  ),
  tool(
    "create_ad_set",
    "Új hirdetéscsoport (mindig PAUSED). Instant űrlapos leadhez: optimization_goal LEAD_GENERATION + destination instant_form. Weboldali leadhez: OFFSITE_CONVERSIONS + destination website + pixel_id (custom_event LEAD). Üzenethez: CONVERSATIONS + messenger/whatsapp. Hívás: QUALITY_CALL + phone_call. Célzás: ajánlott Advantage+ közönség és elhelyezések, a helyszín a kiszállási terület. Az EU-s DSA mezőket a cég nevével töltöm. ABO kampánynál kell daily_budget, CBO-nál nem adható. Kockázatnál needs_confirmation / refused.",
    z.object({
      campaign_id: z.string(),
      name: z.string(),
      optimization_goal: z.enum(["LEAD_GENERATION", "QUALITY_LEAD", "OFFSITE_CONVERSIONS", "LANDING_PAGE_VIEWS", "LINK_CLICKS", "CONVERSATIONS", "QUALITY_CALL", "REACH", "IMPRESSIONS", "THRUPLAY", "POST_ENGAGEMENT"]),
      destination: z.enum(["instant_form", "website", "messenger", "whatsapp", "instagram_direct", "phone_call", "none"]).default("instant_form"),
      daily_budget: z.number().int().positive().optional(),
      bid_strategy: z.enum(["LOWEST_COST_WITHOUT_CAP", "COST_CAP", "LOWEST_COST_WITH_BID_CAP"]).optional(),
      bid_amount: z.number().int().positive().optional().describe("cost cap / bid cap összege (fiók pénznemében)"),
      targeting: Targeting,
      pixel_id: z.string().optional(),
      custom_event: z.enum(["LEAD", "COMPLETE_REGISTRATION", "CONTACT", "SCHEDULE", "SUBMIT_APPLICATION", "PURCHASE"]).optional(),
      start_time: z.string().optional().describe("ISO dátum, üresen azonnal"),
      end_time: z.string().optional(),
      attribution: z.object({ click_days: z.union([z.literal(1), z.literal(7)]), view_days: z.union([z.literal(0), z.literal(1)]) }).optional().describe("alap: 7 nap kattintás + 1 nap megtekintés"),
      confirmed_after_warning: confirmedFlag,
    }),
    (i) => `Hirdetéscsoport létrehozása: ${i.name}`,
    async (i) => {
      const c = await ctx();
      // the campaign decides: objective, special categories, CBO or ABO
      let campaign: { objective?: string; special_ad_categories?: string[]; daily_budget?: string | number; lifetime_budget?: string | number } = {};
      let siblingsWithBudget = 0;
      if (c.meta) {
        const { graph } = await import("../meta/graph");
        campaign = await graph(i.campaign_id, { params: { fields: "objective,special_ad_categories,daily_budget,lifetime_budget" } });
        const sib = await graph<{ data: { daily_budget?: string }[] }>(`${i.campaign_id}/adsets`, { params: { fields: "daily_budget", limit: "50" } }).catch(() => ({ data: [] }));
        siblingsWithBudget = sib.data.filter((x) => x.daily_budget).length;
      } else {
        const dc = c.store.demoCreated?.campaigns.find((x) => x.id === i.campaign_id);
        campaign = dc ? { objective: dc.objective, special_ad_categories: dc.specialAdCategories, daily_budget: dc.dailyBudget } : { objective: "OUTCOME_LEADS", special_ad_categories: [] };
        siblingsWithBudget = (c.store.demoCreated?.adsets ?? []).filter((x) => x.campaignId === i.campaign_id && x.dailyBudget).length;
      }
      const cbo = !!(campaign.daily_budget || campaign.lifetime_budget);
      const v = merge(
        specialCategoryTargeting(campaign.special_ad_categories ?? [], i.targeting),
        assessNewAdSet({
          objective: campaign.objective,
          optimizationGoal: i.optimization_goal,
          dailyBudget: i.daily_budget,
          targetCpl: c.targetCpl,
          ageMin: i.targeting.age_min,
          ageMax: i.targeting.age_max,
          radiusKm: minRadius(i.targeting),
          interestCount: (i.targeting.interests?.length ?? 0) + (i.targeting.behaviors?.length ?? 0),
          advantageAudience: i.targeting.advantage_audience,
          manualPositions: i.targeting.placements ? Object.values(i.targeting.placements).reduce((s, l) => s + (l?.length ?? 0), 0) : 0,
          siblingsWithOwnBudget: siblingsWithBudget,
          bidStrategy: i.bid_strategy,
          hasHistory: c.ads.some((a) => a.metrics.leads > 0),
        }),
      );
      if (cbo && i.daily_budget) v.refuse.push("A kampány CBO (a kampány osztja a büdzsét) – a hirdetéscsoportnak nem adható saját napi büdzsé.");
      if (!cbo && !i.daily_budget) v.refuse.push("ABO kampánynál a hirdetéscsoportnak kell napi büdzsé (daily_budget).");
      if (i.destination === "website" && i.optimization_goal === "OFFSITE_CONVERSIONS" && !i.pixel_id) v.refuse.push("Weboldali konverzióhoz Pixel kell (pixel_id – lásd get_account_health → pixels).");
      if ((i.bid_strategy === "COST_CAP" || i.bid_strategy === "LOWEST_COST_WITH_BID_CAP") && !i.bid_amount) v.refuse.push("Költségcélhoz/licitplafonhoz meg kell adni a bid_amount összegét.");
      const stop = gate(v, i.confirmed_after_warning);
      if (stop) return stop;

      let id: string;
      if (c.meta) {
        const m = await manage();
        const pageId = ["instant_form", "messenger", "whatsapp", "instagram_direct", "phone_call"].includes(i.destination) ? await pageIdFor(c.accountId, c.company.pageId) : undefined;
        id = (
          await m.createAdSet(c.accountId, {
            campaignId: i.campaign_id,
            name: i.name,
            optimizationGoal: i.optimization_goal,
            destinationType: DESTINATION[i.destination],
            dailyBudget: i.daily_budget,
            bidStrategy: i.bid_strategy,
            bidAmount: i.bid_amount,
            targeting: m.buildTargeting(i.targeting),
            pageId,
            pixelId: i.pixel_id,
            customEventType: i.custom_event,
            startTime: i.start_time,
            endTime: i.end_time,
            attribution: i.attribution ? { clickDays: i.attribution.click_days, viewDays: i.attribution.view_days } : undefined,
            dsaBeneficiary: c.company.name,
            dsaPayor: c.company.name,
          })
        ).id;
      } else {
        id = await demoCreate("adsets", { campaignId: i.campaign_id, name: i.name, dailyBudget: i.daily_budget, optimizationGoal: i.optimization_goal, targeting: i.targeting });
      }
      await logActivity("agent", "create", `Hirdetéscsoport létrehozva (szüneteltetve): ${i.name}`);
      return { ok: true, adset_id: id, status: "PAUSED", next: "Tölts fel bele hirdetéseket (create_ads), majd élesítsd (set_status) – a kampányt és a csoportot is.", ...(c.meta ? {} : { demo: DEMO_NOTE }) };
    },
  ),
  tool(
    "update_ad_set",
    "Hirdetéscsoport módosítása: név, célzás (a TELJES új célzást add meg – előtte nézd meg a jelenlegit a get_account_structure-rel), befejezés ideje, licit összeg. Büdzséhez a set_budget, státuszhoz a set_status való. Tanulási fázisban needs_confirmation.",
    z.object({
      adset_id: z.string(),
      name: z.string().optional(),
      targeting: Targeting.optional(),
      end_time: z.string().optional(),
      bid_amount: z.number().int().positive().optional(),
      confirmed_after_warning: confirmedFlag,
    }),
    () => "Hirdetéscsoport módosítása",
    async (i) => {
      const c = await ctx();
      const learning = c.ads.find((a) => a.adsetId === i.adset_id)?.adsetLearning;
      const v = i.targeting || i.bid_amount ? assessLearningEdit(learning, i.targeting ? "a célzás módosítása" : "a licit módosítása") : emptyVerdict();
      const stop = gate(v, i.confirmed_after_warning);
      if (stop) return stop;
      if (!c.meta) {
        if (i.name) await updateStore((d) => d.ads.filter((a) => a.adsetId === i.adset_id).forEach((a) => (a.adsetName = i.name!)), ["ads"]);
        return { ok: true, demo: DEMO_NOTE };
      }
      const m = await manage();
      await m.updateObject(i.adset_id, {
        name: i.name,
        targeting: i.targeting ? m.buildTargeting(i.targeting) : undefined,
        end_time: i.end_time,
        bid_amount: m.toMinor(i.bid_amount),
      });
      await adsChanged(c.accountId);
      await logActivity("agent", "action", `Hirdetéscsoport módosítva: ${i.adset_id}${i.targeting ? " (célzás)" : ""}${i.name ? " (név)" : ""}`);
      return { ok: true };
    },
  ),
  tool(
    "duplicate",
    "Kampány, hirdetéscsoport vagy hirdetés másolása (mindig PAUSED). Hirdetéscsoport másolható másik kampányba (target_id = campaign_id), hirdetés másik csoportba (target_id = adset_id). Skálázáshoz és teszteléshez: a nyerő csoport másolata új közönségre, az eredeti érintetlen marad.",
    z.object({
      level: z.enum(["campaign", "adset", "ad"]),
      id: z.string(),
      target_id: z.string().optional(),
      deep: z.boolean().default(true).describe("a tartalmával együtt (csoportok/hirdetések)"),
      rename_suffix: z.string().default(" – másolat"),
    }),
    (i) => `${i.level === "ad" ? "Hirdetés" : i.level === "adset" ? "Hirdetéscsoport" : "Kampány"} másolása`,
    async (i) => {
      const c = await ctx();
      if (c.meta) {
        const res = await (await manage()).copyObject(i.level, i.id, { targetId: i.target_id, deep: i.deep, suffix: i.rename_suffix });
        await adsChanged(c.accountId);
        await logActivity("agent", "create", `Másolat (${i.level}): ${i.id} → ${res.id}`);
        return { ok: true, new_id: res.id, status: "PAUSED" };
      }
      const field = i.level === "ad" ? "id" : i.level === "adset" ? "adsetId" : "campaignId";
      const source = c.ads.filter((a) => a[field] === i.id);
      if (!source.length) throw new Error(`Nincs ilyen ${i.level}: ${i.id}`);
      const newGroup = newId(i.level === "campaign" ? "cmp" : "as");
      const copies: Ad[] = source.map((a) => ({
        ...structuredClone(a),
        id: newId("ad"),
        name: i.level === "ad" ? a.name + i.rename_suffix : a.name,
        status: "PAUSED",
        ...(i.level === "adset" ? { adsetId: newGroup, adsetName: a.adsetName + i.rename_suffix, adsetLearning: "LEARNING" as const } : {}),
        ...(i.level === "campaign" ? { campaignId: newGroup, campaignName: a.campaignName + i.rename_suffix, adsetId: `${a.adsetId}_${newGroup}`, adsetLearning: "LEARNING" as const } : {}),
        metrics: { spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpm: 0, leads: 0, cpl: null },
        daily: [],
        createdAt: new Date().toISOString(),
      }));
      await updateStore((d) => void d.ads.unshift(...copies), ["ads"]);
      await adsChanged(c.accountId);
      await logActivity("agent", "create", `Másolat (${i.level}, demó): ${source.length} hirdetés`);
      return { ok: true, new_id: i.level === "ad" ? copies[0].id : newGroup, status: "PAUSED", demo: DEMO_NOTE };
    },
  ),
  tool(
    "upload_video",
    "Videó feltöltése a hirdetési fiókba (OCP médiatár /api/media/… vagy nyilvános URL). A visszakapott video_id-vel készíthető videós hirdetés (create_ads format: video). A Meta feldolgozása pár percig tarthat – nézd meg a get_video_status-szal.",
    z.object({ url: z.string(), name: z.string() }),
    () => "Videó feltöltése",
    async (i) => {
      const c = await ctx();
      if (!c.meta) return { demo: DEMO_NOTE, video_id: newId("demo_vid"), status: "ready" };
      const res = await (await manage()).uploadVideo(c.accountId, i.url, i.name);
      await logActivity("agent", "create", `Videó feltöltve: ${i.name}`);
      return { video_id: res.id, next: "get_video_status, amíg ready nem lesz" };
    },
  ),
  tool(
    "get_video_status",
    "Feltöltött videó feldolgozási állapota (processing / ready / error).",
    z.object({ video_id: z.string() }),
    () => "Videó állapota",
    async (i) => ((await ctx()).meta ? (await manage()).videoStatus(i.video_id) : { demo: DEMO_NOTE, status: "ready" }),
  ),
  tool(
    "list_audiences",
    "Egyéni és hasonmás közönségek a fiókban (méret, típus, használható-e).",
    z.object({}),
    () => "Közönségek lekérése",
    async () => {
      const c = await ctx();
      return c.meta ? (await manage()).listAudiences(c.accountId) : { demo: DEMO_NOTE, audiences: await demoAudiences() };
    },
  ),
  tool(
    "create_audience",
    "Egyéni közönség létrehozása: website (Pixel, X nap, opcionális URL-szűrő), lead_form_opened / lead_form_submitted (instant űrlap), page_engaged (Facebook-oldal), instagram_engaged, customer_list (az OCP leadjeiből, státusz szerint – pl. won = megnyert ügyfelek; a Meta csak hash-elt adatot kap). Retargetinghez és hasonmás közönség forrásának.",
    z.object({
      kind: z.enum(["website", "lead_form_opened", "lead_form_submitted", "page_engaged", "instagram_engaged", "customer_list"]),
      name: z.string(),
      days: z.number().int().min(1).max(365).default(30),
      url_contains: z.string().optional(),
      pixel_id: z.string().optional(),
      lead_statuses: z.array(z.enum(["new", "contacted", "survey", "won", "lost"])).default(["won"]).describe("customer_list: mely státuszú leadek kerüljenek bele"),
    }),
    (i) => `Közönség létrehozása: ${i.name}`,
    async (i) => {
      const c = await ctx();
      if (i.kind === "customer_list") {
        const leads = (await getLeads()).filter((l) => i.lead_statuses.includes(l.status));
        const contacts = leads.map((l) => ({ email: l.email, phone: l.phone })).filter((x) => x.email || x.phone);
        const note = contacts.length < 100 ? `Csak ${contacts.length} kontakt – hasonmás közönséghez legalább ~100 ajánlott; retargetinghez is nagyon kicsi lehet.` : undefined;
        if (!c.meta) return { demo: DEMO_NOTE, audience_id: await demoCreate("audiences", { name: i.name, type: "CUSTOM", size: `${contacts.length} kontakt` }), uploaded: contacts.length, note };
        const res = await (await manage()).createCustomerListAudience(c.accountId, i.name, contacts);
        await logActivity("agent", "create", `Ügyféllista-közönség: ${i.name} (${res.uploaded} kontakt, hash-elve)`);
        return { audience_id: res.id, uploaded: res.uploaded, note };
      }
      if (!c.meta) return { demo: DEMO_NOTE, audience_id: await demoCreate("audiences", { name: i.name, type: i.kind === "website" ? "WEBSITE" : "ENGAGEMENT", size: "számolódik" }) };
      const pageId = await pageIdFor(c.accountId, c.company.pageId);
      const res = await (await manage()).createEngagementAudience(c.accountId, {
        name: i.name,
        kind: i.kind,
        days: i.days,
        pixelId: i.pixel_id,
        urlContains: i.url_contains,
        pageId,
        instagramUserId: c.company.instagramUserId,
      });
      await logActivity("agent", "create", `Közönség létrehozva: ${i.name}`);
      return { audience_id: res.id, note: "A Meta pár óra alatt tölti fel; addig a mérete „számolódik”." };
    },
  ),
  tool(
    "create_lookalike",
    "Hasonmás (lookalike) közönség egy forrásközönségből. Legjobb forrás: megnyert ügyfelek listája. ratio_percent: 1 = leghasonlóbb (Magyarországon ~70 ezer fő), 1–3% jó kezdés.",
    z.object({
      origin_audience_id: z.string(),
      ratio_percent: z.number().int().min(1).max(10).default(1),
      country: z.string().length(2).default("HU"),
      name: z.string().optional(),
    }),
    (i) => `Hasonmás közönség (${i.ratio_percent}%)`,
    async (i) => {
      const c = await ctx();
      const name = i.name ?? `Hasonmás ${i.ratio_percent}% – ${i.country}`;
      if (!c.meta) return { demo: DEMO_NOTE, audience_id: await demoCreate("audiences", { name, type: "LOOKALIKE", size: `${Math.round(70000 * i.ratio_percent).toLocaleString("hu-HU")} körül` }) };
      const res = await (await manage()).createLookalike(c.accountId, { name, originAudienceId: i.origin_audience_id, country: i.country, ratio: i.ratio_percent / 100 });
      await logActivity("agent", "create", `Hasonmás közönség: ${name}`);
      return { audience_id: res.id };
    },
  ),
  tool(
    "list_lead_forms",
    "A cég Facebook-oldalán lévő instant űrlapok (név, állapot, kérdések, leadek száma) – új hirdetésnél ebből választhatsz lead_form_id-t.",
    z.object({}),
    () => "Instant űrlapok lekérése",
    async () => {
      const c = await ctx();
      if (!c.meta) return { demo: DEMO_NOTE, forms: [{ id: "demo_form_1", name: "Felmérés – fürdő (v2)", status: "ACTIVE", leads: 214, questions: ["Teljes név", "Telefonszám", "Mekkora a fürdőszoba?"] }] };
      const pageId = await pageIdFor(c.accountId, c.company.pageId);
      if (!pageId) throw new Error("Nincs Facebook-oldal kiválasztva (Cégprofil → Facebook-oldal).");
      return (await manage()).listLeadForms(pageId);
    },
  ),
  tool(
    "link_instagram",
    "A cég Facebook-oldalához kapcsolt Instagram üzleti fiók megkeresése és mentése a cégprofilba – utána a hirdetések az Instagramon a cég saját profiljával futnak.",
    z.object({}),
    () => "Instagram-fiók összekapcsolása",
    async () => {
      const c = await ctx();
      if (!c.meta) return { demo: DEMO_NOTE, instagram: "@felujitaspro" };
      const pageId = await pageIdFor(c.accountId, c.company.pageId);
      if (!pageId) throw new Error("Nincs Facebook-oldal kiválasztva (Cégprofil → Facebook-oldal).");
      const ig = await (await manage()).instagramForPage(pageId);
      if (!ig) return { linked: false, hint: "Az oldalhoz nincs Instagram üzleti fiók kapcsolva. Instagram app → Beállítások → Fióktípus: üzleti, majd kapcsold a Facebook-oldalhoz." };
      await saveCompany({ accountId: c.accountId, instagramUserId: ig.id, instagramUsername: ig.username });
      return { linked: true, instagram: ig.username ? `@${ig.username}` : ig.id };
    },
  ),
  tool(
    "search_ad_library",
    "Keresés a Meta Hirdetéstárban (versenytársak, trendek): ki mit hirdet most, mióta fut (30+ napja futó hirdetés szinte biztosan nyerő), milyen szöveggel. A mintát vedd át, ne a konkrét hirdetést.",
    z.object({ query: z.string(), country: z.string().length(2).default("HU") }),
    (i) => `Hirdetéstár: „${i.query}”`,
    async (i) => {
      const c = await ctx();
      if (!c.meta) {
        return {
          demo: DEMO_NOTE,
          results: [
            { page: "Minta Burkoló Kft.", headline: "Fürdőszoba 12 nap alatt, fix áron", text: "Előtte–utána képek, 4.8★ értékelés…", runningDays: 74, likelyWinner: true },
            { page: "Példa Felújítás", headline: "Ingyenes felmérés 48 órán belül", text: "Kérj ajánlatot 30 mp alatt…", runningDays: 12, likelyWinner: false },
          ],
        };
      }
      return (await manage()).searchAdLibrary(i.query, i.country);
    },
  ),
  tool(
    "check_ad_copy",
    "Hirdetésszöveg ellenőrzése feltöltés előtt: Meta irányelvek (személyes tulajdonság, túlzó ígéret, kattintásvadászat, nagybetű, emoji, címsorhossz) és speciális kategória. Visszaadja a tiltó okokat, a figyelmeztetéseket és az alternatívákat.",
    z.object({ headline: z.string().optional(), primary_text: z.string().optional(), description: z.string().optional() }),
    () => "Szöveg ellenőrzése",
    async (i) => {
      const company = await getCompany();
      const v = merge(lintAdCopy([{ headline: i.headline, primaryText: i.primary_text, description: i.description }]), checkSpecialCategory(`${company.industry}\n${i.headline ?? ""} ${i.primary_text ?? ""}`, []));
      return { ok: !v.refuse.length && !v.warn.length, blocking: v.refuse, warnings: v.warn, alternatives: v.alternatives };
    },
  ),
];
