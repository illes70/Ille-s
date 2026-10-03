import "server-only";
import type { Ad, Company } from "../types";
import { newId, readStore, updateStore } from "../store";
import { BREAKDOWNS } from "./manage";

// Demo-mode answers for the Meta management tools: realistic, clearly marked as demo,
// so the whole assistant can be tried without a connected account.

export const DEMO_NOTE = "Demó mód: nincs valódi Meta-fiók csatlakoztatva, ez szimulált adat / szimulált végrehajtás.";

export async function demoHealth(accountId: string, ads: Ad[]) {
  return {
    demo: DEMO_NOTE,
    name: accountId,
    status: "aktív",
    healthy: true,
    amountSpent: ads.reduce((s, a) => s + a.daily.reduce((x, d) => x + d.spend, 0), 0),
    spendCap: null,
    balanceDue: 0,
    adsWithIssues: [],
    pixels: [{ id: "px_demo", name: "Demó Pixel", lastFired: new Date(Date.now() - 2 * 3_600_000).toISOString(), silentHours: 2 }],
  };
}

export async function demoStructure(ads: Ad[], company: Company) {
  const store = await readStore();
  const campaigns = new Map<string, { id: string; name: string; adsets: Map<string, Ad[]> }>();
  for (const ad of ads) {
    const c = campaigns.get(ad.campaignId) ?? { id: ad.campaignId, name: ad.campaignName, adsets: new Map() };
    c.adsets.set(ad.adsetId, [...(c.adsets.get(ad.adsetId) ?? []), ad]);
    campaigns.set(ad.campaignId, c);
  }
  const fromAds = [...campaigns.values()].map((c) => ({
    id: c.id,
    name: c.name,
    objective: "OUTCOME_LEADS",
    status: [...c.adsets.values()].flat().some((a) => a.status === "ACTIVE") ? "ACTIVE" : "PAUSED",
    specialAdCategories: [],
    budget: { mode: "ABO (hirdetéscsoport-büdzsé)" },
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    adSets: [...c.adsets.entries()].map(([id, list]) => ({
      id,
      name: list[0].adsetName,
      status: list.some((a) => a.status === "ACTIVE") ? "ACTIVE" : "PAUSED",
      learning: list[0].adsetLearning ?? null,
      optimizationGoal: "LEAD_GENERATION",
      destination: "ON_AD",
      dailyBudget: list[0].adsetDailyBudget,
      ads: list.length,
      attribution: ["7 napos kattintás", "1 napos megtekintés"],
      dsa: { beneficiary: company.name, payor: company.name },
      targeting: {
        locations: [company.area || "Magyarország"],
        age: list[0].adsetName.includes("25–55") ? "25–55" : "25–65+",
        genders: "mindenki",
        advantageAudience: !list[0].adsetName.toLowerCase().includes("retarget"),
        detailedTargeting: [],
        customAudiences: list[0].adsetName.toLowerCase().includes("retarget") ? ["Űrlapot megnyitók – 30 nap"] : [],
        placements: ["Advantage+ elhelyezések (mind)"],
      },
    })),
  }));
  const created = (store.demoCreated?.campaigns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    objective: c.objective,
    status: "PAUSED",
    specialAdCategories: c.specialAdCategories,
    budget: c.dailyBudget ? { mode: "CBO (Advantage kampánybüdzsé)", daily: c.dailyBudget } : { mode: "ABO (hirdetéscsoport-büdzsé)" },
    adSets: (store.demoCreated?.adsets ?? []).filter((a) => a.campaignId === c.id).map((a) => ({ id: a.id, name: a.name, status: "PAUSED", optimizationGoal: a.optimizationGoal, dailyBudget: a.dailyBudget ?? null, targeting: a.targeting })),
  }));
  return { demo: DEMO_NOTE, campaigns: [...created, ...fromAds] };
}

const SPLITS: Record<keyof typeof BREAKDOWNS, { key: Record<string, string>; share: number; cplX: number }[]> = {
  age: [
    { key: { age: "18-24" }, share: 0.05, cplX: 1.8 },
    { key: { age: "25-34" }, share: 0.22, cplX: 1.1 },
    { key: { age: "35-44" }, share: 0.3, cplX: 0.85 },
    { key: { age: "45-54" }, share: 0.25, cplX: 0.9 },
    { key: { age: "55-64" }, share: 0.13, cplX: 1.05 },
    { key: { age: "65+" }, share: 0.05, cplX: 1.4 },
  ],
  gender: [
    { key: { gender: "female" }, share: 0.56, cplX: 0.9 },
    { key: { gender: "male" }, share: 0.44, cplX: 1.15 },
  ],
  age_gender: [
    { key: { age: "35-44", gender: "female" }, share: 0.17, cplX: 0.8 },
    { key: { age: "35-44", gender: "male" }, share: 0.13, cplX: 0.95 },
    { key: { age: "45-54", gender: "female" }, share: 0.14, cplX: 0.85 },
    { key: { age: "45-54", gender: "male" }, share: 0.11, cplX: 1 },
    { key: { age: "25-34", gender: "female" }, share: 0.12, cplX: 1.05 },
    { key: { age: "25-34", gender: "male" }, share: 0.1, cplX: 1.2 },
    { key: { age: "egyéb", gender: "mindkettő" }, share: 0.23, cplX: 1.3 },
  ],
  placement: [
    { key: { publisher_platform: "facebook", platform_position: "feed" }, share: 0.42, cplX: 0.85 },
    { key: { publisher_platform: "instagram", platform_position: "stream" }, share: 0.18, cplX: 1.05 },
    { key: { publisher_platform: "instagram", platform_position: "reels" }, share: 0.14, cplX: 1.1 },
    { key: { publisher_platform: "facebook", platform_position: "facebook_reels" }, share: 0.09, cplX: 1.2 },
    { key: { publisher_platform: "instagram", platform_position: "story" }, share: 0.08, cplX: 1.15 },
    { key: { publisher_platform: "audience_network", platform_position: "classic" }, share: 0.06, cplX: 2.4 },
    { key: { publisher_platform: "facebook", platform_position: "marketplace" }, share: 0.03, cplX: 0.95 },
  ],
  platform: [
    { key: { publisher_platform: "facebook" }, share: 0.56, cplX: 0.9 },
    { key: { publisher_platform: "instagram" }, share: 0.38, cplX: 1.08 },
    { key: { publisher_platform: "audience_network" }, share: 0.06, cplX: 2.4 },
  ],
  region: [
    { key: { region: "Budapest" }, share: 0.58, cplX: 1.05 },
    { key: { region: "Pest" }, share: 0.34, cplX: 0.85 },
    { key: { region: "Fejér" }, share: 0.05, cplX: 1.3 },
    { key: { region: "egyéb" }, share: 0.03, cplX: 1.8 },
  ],
  device: [
    { key: { device_platform: "mobile_app" }, share: 0.9, cplX: 0.97 },
    { key: { device_platform: "desktop" }, share: 0.1, cplX: 1.3 },
  ],
  hour: Array.from({ length: 24 }, (_, h) => {
    const curve = [0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.4, 0.8, 1, 1.1, 1.1, 1.2, 1.3, 1.2, 1.1, 1.1, 1.2, 1.4, 1.6, 1.8, 1.9, 1.6, 1.1, 0.5];
    const total = curve.reduce((a, b) => a + b, 0);
    return { key: { hourly_stats_aggregated_by_advertiser_time_zone: `${String(h).padStart(2, "0")}:00:00 - ${String(h).padStart(2, "0")}:59:59` }, share: curve[h] / total, cplX: h < 6 ? 1.6 : h >= 18 && h <= 21 ? 0.85 : 1 };
  }),
};

export function demoBreakdown(ads: Ad[], days: number, breakdown?: keyof typeof BREAKDOWNS) {
  const pts = ads.flatMap((a) => a.daily.slice(-days));
  const spend = pts.reduce((s, d) => s + d.spend, 0);
  const leads = pts.reduce((s, d) => s + d.leads, 0);
  const impressions = pts.reduce((s, d) => s + d.impressions, 0);
  const clicks = pts.reduce((s, d) => s + d.clicks, 0);
  const cpl = leads ? spend / leads : null;
  if (!breakdown) return { demo: DEMO_NOTE, rows: [{ spend, impressions, clicks, leads, cpl: cpl && Math.round(cpl) }] };
  return {
    demo: DEMO_NOTE,
    rows: SPLITS[breakdown].map((x) => {
      const s = Math.round(spend * x.share);
      const l = cpl ? Math.round(s / (cpl * x.cplX)) : 0;
      return { ...x.key, spend: s, impressions: Math.round(impressions * x.share), clicks: Math.round(clicks * x.share), leads: l, cpl: l ? Math.round(s / l) : null };
    }),
  };
}

const PLACES = [
  { key: "hu_bp", name: "Budapest", type: "city", region: "Budapest" },
  { key: "hu_erd", name: "Érd", type: "city", region: "Pest" },
  { key: "hu_budaors", name: "Budaörs", type: "city", region: "Pest" },
  { key: "hu_szentendre", name: "Szentendre", type: "city", region: "Pest" },
  { key: "hu_godollo", name: "Gödöllő", type: "city", region: "Pest" },
  { key: "hu_vac", name: "Vác", type: "city", region: "Pest" },
  { key: "hu_debrecen", name: "Debrecen", type: "city", region: "Hajdú-Bihar" },
  { key: "hu_szeged", name: "Szeged", type: "city", region: "Csongrád-Csanád" },
  { key: "hu_gyor", name: "Győr", type: "city", region: "Győr-Moson-Sopron" },
  { key: "hu_pecs", name: "Pécs", type: "city", region: "Baranya" },
  { key: "hu_bekescsaba", name: "Békéscsaba", type: "city", region: "Békés" },
  { key: "hu_gyula", name: "Gyula", type: "city", region: "Békés" },
  { key: "hu_r_pest", name: "Pest megye", type: "region" },
  { key: "hu_r_bekes", name: "Békés megye", type: "region" },
];
const INTERESTS = [
  { id: "6003107902433", name: "Lakásfelújítás", path: "Érdeklődési körök › Otthon és kert", size: [800000, 950000] },
  { id: "6003385609165", name: "Lakberendezés", path: "Érdeklődési körök › Otthon és kert", size: [1500000, 1800000] },
  { id: "6003227590653", name: "Barkácsolás (DIY)", path: "Érdeklődési körök › Hobbik", size: [900000, 1100000] },
  { id: "6003435096731", name: "Kertészkedés", path: "Érdeklődési körök › Otthon és kert", size: [1200000, 1400000] },
  { id: "6002997799844", name: "Ingatlan", path: "Érdeklődési körök › Üzlet", size: [1100000, 1300000] },
  { id: "6003348604581", name: "Energiahatékonyság", path: "Érdeklődési körök › Tudomány", size: [300000, 360000] },
  { id: "6004037107009", name: "Új lakástulajdonosok", path: "Viselkedés › Élesemények", size: [90000, 120000] },
];

export function demoSearchTargeting(kind: "detailed" | "location", q: string) {
  const low = q.toLowerCase();
  if (kind === "location") return PLACES.filter((p) => p.name.toLowerCase().includes(low)).map((p) => ({ ...p, country: "HU" }));
  const hits = INTERESTS.filter((i) => i.name.toLowerCase().includes(low) || i.path.toLowerCase().includes(low));
  return (hits.length ? hits : INTERESTS).map((i) => ({ id: i.id, name: i.name, type: "interests", path: i.path, audience: `${i.size[0].toLocaleString("hu-HU")}–${i.size[1].toLocaleString("hu-HU")}` }));
}

/** Rough Hungarian reach model for the demo. */
export function demoEstimate(t: { countries?: string[]; regions?: unknown[]; cities?: { radius_km?: number }[]; points?: { radius_km: number }[]; age_min?: number; age_max?: number; interests?: unknown[]; genders?: string[] }) {
  let base = 6_900_000; // Hungarian adults on Meta, roughly
  if (t.cities?.length || t.points?.length) {
    const areas = [...(t.cities ?? []).map((c) => c.radius_km ?? 10), ...(t.points ?? []).map((p) => p.radius_km)];
    base = Math.min(base, areas.reduce((s, r) => s + Math.min(2_400_000, 8_000 * r * r), 0));
  } else if (t.regions?.length) base = Math.min(base, (t.regions.length as number) * 600_000);
  const ageShare = Math.max(0.05, ((t.age_max ?? 65) - (t.age_min ?? 18)) / 47);
  let n = base * Math.min(1, ageShare);
  if (t.genders?.length === 1) n *= 0.5;
  if (t.interests?.length) n *= Math.min(0.6, 0.12 * t.interests.length);
  return { demo: DEMO_NOTE, monthlyActiveLow: Math.round(n * 0.85), monthlyActiveHigh: Math.round(n * 1.15), ready: true };
}

export async function demoCreate<T extends "campaigns" | "adsets" | "audiences">(kind: T, item: Record<string, unknown>) {
  const id = newId(kind === "campaigns" ? "demo_cmp" : kind === "adsets" ? "demo_as" : "demo_aud");
  await updateStore((d) => {
    d.demoCreated ??= { campaigns: [], adsets: [], audiences: [] };
    (d.demoCreated[kind] as unknown[]).unshift({ id, ...item });
  });
  return id;
}

export async function demoAudiences() {
  const store = await readStore();
  return [
    { id: "demo_aud_1", name: "Űrlapot megnyitók – 30 nap", type: "ENGAGEMENT", size: "3200–3800", usable: true },
    { id: "demo_aud_2", name: "Weboldal-látogatók – 30 nap", type: "WEBSITE", size: "5100–6000", usable: true },
    { id: "demo_aud_3", name: "Megnyert ügyfelek (ügyféllista)", type: "CUSTOM", size: "1000 alatt", usable: true },
    ...(store.demoCreated?.audiences ?? []).map((a) => ({ ...a, usable: true })),
  ];
}
