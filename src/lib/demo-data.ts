import type { Ad, AdAccount, Company, DailyPoint, Lead, Recipe, Settings } from "./types";

// Fictional demo accounts so OCP is fully usable before a Meta account is connected.

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();

export const demoAccounts: AdAccount[] = [
  { id: "act_demo_1", name: "Felújítás Pro (demó)", currency: "HUF" },
  { id: "act_demo_2", name: "Klíma & Hőszivattyú (demó)", currency: "HUF" },
];

export const demoSettings: Settings = {
  currency: "HUF",
  targetCpl: 2500,
  autopilot: {
    level: "bounded",
    autoPauseSpendMultiplier: 3,
    maxBudgetIncreasePct: 25,
    frequencyLimit: 3.5,
  },
};

export const demoCompanies: Record<string, Company> = {
  act_demo_1: {
    accountId: "act_demo_1",
    name: "Felújítás Pro Kft.",
    industry: "Lakásfelújítás (fürdőszoba, konyha, villany, festés)",
    services: [
      { name: "Fürdőszoba felújítás", price: "89 000 Ft/m²-től, anyaggal" },
      { name: "Konyha felújítás", price: "egyedi árajánlat" },
      { name: "Villanyszerelés – hibaelhárítás", price: "kiszállás 15 000 Ft" },
      { name: "Szobafestés", price: "2 900 Ft/m²-től" },
    ],
    phone: "+36 30 555 1234",
    area: "Budapest és Pest megye",
    website: "https://felujitaspro.example.hu",
    usp: "Fix ár, fix határidő. 312 elégedett ügyfél (4.9★). Takarítás a munka után.",
    brandVoice: "Közvetlen, magabiztos, tegeződő. Rövid mondatok, konkrét előny az első sorban, nincs túlzó ígéret.",
    colors: ["#16a34a", "#052e16"],
    notes: "50 m² alatti burkolást nem vállalnak. Hétvégén csak sürgős villanyos hibát.",
    updatedAt: daysAgo(3),
  },
  act_demo_2: {
    accountId: "act_demo_2",
    name: "Klíma & Hőszivattyú Bt.",
    industry: "Klíma és hőszivattyú telepítés",
    services: [
      { name: "Klíma telepítéssel", price: "329 000 Ft-tól" },
      { name: "Hőszivattyú", price: "támogatással akár 50% kedvezmény" },
    ],
    phone: "+36 20 777 4321",
    area: "Budapest + 30 km",
    website: "https://klimahoszivattyu.example.hu",
    usp: "Telepítés 1 héten belül, 5 év garancia, ingyenes felmérés.",
    brandVoice: "Szakértő, de barátságos. Számokkal érvel (megtakarítás, garancia).",
    colors: ["#0891b2", "#083344"],
    notes: "",
    updatedAt: daysAgo(10),
  },
};

/** Deterministic pseudo-random so the demo looks the same on every start. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

interface Spec {
  id: string;
  accountId: string;
  name: string;
  status: Ad["status"];
  campaign: [string, string];
  adset: [string, string, number, Ad["adsetLearning"]];
  creative: Ad["creative"];
  /** days the ad has been running */
  age: number;
  /** average daily spend, cost per click, click→lead rate */
  spend: number;
  cpc: number;
  cvr: number;
  /** last 7d frequency */
  frequency: number;
  /** spend growth per day (ramp) */
  ramp?: number;
  /** days since paused (if paused) */
  pausedFor?: number;
}

function series(spec: Spec, seed: number): DailyPoint[] {
  const rand = rng(seed);
  const days = Math.min(90, spec.age);
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    const paused = spec.pausedFor !== undefined && i < spec.pausedFor;
    const ramp = 1 + (spec.ramp ?? 0) * (days - i);
    const spend = paused ? 0 : Math.round(spec.spend * ramp * (0.75 + rand() * 0.5));
    const clicks = Math.round(spend / spec.cpc);
    const impressions = Math.round(clicks / (0.012 + rand() * 0.012));
    const exp = clicks * spec.cvr;
    const leads = Math.floor(exp) + (rand() < exp % 1 ? 1 : 0);
    out.push({ date, spend, impressions, clicks, leads });
  }
  return out;
}

function build(spec: Spec, seed: number): Ad {
  const daily = series(spec, seed);
  const last7 = daily.slice(-7);
  const sum = (k: keyof Omit<DailyPoint, "date">) => last7.reduce((s, d) => s + d[k], 0);
  const spend = sum("spend");
  const impressions = sum("impressions");
  const clicks = sum("clicks");
  const leads = sum("leads");
  return {
    id: spec.id,
    accountId: spec.accountId,
    name: spec.name,
    status: spec.status,
    campaignId: spec.campaign[0],
    campaignName: spec.campaign[1],
    adsetId: spec.adset[0],
    adsetName: spec.adset[1],
    adsetDailyBudget: spec.adset[2],
    adsetLearning: spec.adset[3],
    creative: spec.creative,
    metrics: {
      spend,
      impressions,
      reach: Math.round(impressions / spec.frequency),
      frequency: spec.frequency,
      clicks,
      ctr: impressions ? +((clicks / impressions) * 100).toFixed(2) : 0,
      cpm: impressions ? Math.round((spend / impressions) * 1000) : 0,
      leads,
      cpl: leads ? Math.round(spend / leads) : null,
    },
    daily,
    createdAt: daysAgo(spec.age),
  };
}

const SPECS: Spec[] = [
  {
    id: "ad_1001", accountId: "act_demo_1", name: "Fürdőszoba – előtte/utána", status: "ACTIVE",
    campaign: ["cmp_1", "Lead – Felújítás"], adset: ["as_11", "Budapest 25–55", 12000, "SUCCESS"],
    creative: { headline: "Új fürdőszoba 10 nap alatt", primaryText: "Fix ár, fix határidő. Kérj ingyenes felmérést 30 másodperc alatt – holnap már hívunk.", cta: "Ajánlatot kérek", palette: ["#0ea5e9", "#1e3a8a"] },
    age: 75, spend: 9800, cpc: 66, cvr: 0.042, frequency: 2.6,
  },
  {
    id: "ad_1006", accountId: "act_demo_1", name: "Fürdőszoba – zöld dobozos ár", status: "ACTIVE",
    campaign: ["cmp_1", "Lead – Felújítás"], adset: ["as_11", "Budapest 25–55", 12000, "SUCCESS"],
    creative: { headline: "Fürdőszoba felújítás 89 000 Ft/m²-től", primaryText: "Anyaggal, munkadíjjal. Kattints a lenti linkre, és 24 órán belül visszahívunk.", cta: "Ajánlatot kérek", palette: ["#16a34a", "#052e16"], recipeId: "rcp_green_box" },
    age: 18, spend: 4200, cpc: 52, cvr: 0.055, frequency: 1.8, ramp: 0.02,
  },
  {
    id: "ad_1002", accountId: "act_demo_1", name: "Villanyszerelő – sürgős hiba", status: "ACTIVE",
    campaign: ["cmp_1", "Lead – Felújítás"], adset: ["as_12", "Pest megye – érdeklődés", 9000, "SUCCESS"],
    creative: { headline: "Áramszünet? 2 órán belül ott vagyunk", primaryText: "Hétvégén is. Ellenőrzött szakemberek, átlátható díjak.", cta: "Hívást kérek", palette: ["#f59e0b", "#7c2d12"] },
    age: 60, spend: 7400, cpc: 85, cvr: 0.019, frequency: 4.6,
  },
  {
    id: "ad_1003", accountId: "act_demo_1", name: "Konyha – UGC videó stílus", status: "ACTIVE",
    campaign: ["cmp_2", "Lead – Konyha"], adset: ["as_21", "Broad HU", 7000, "LEARNING"],
    creative: { headline: "Ezt a konyhát 6 nap alatt raktuk össze", primaryText: "Nézd meg, hogyan lett a 12 éves konyhából modern, világos tér – a te lakásodban is megoldjuk.", cta: "Időpontot kérek", palette: ["#10b981", "#064e3b"] },
    age: 12, spend: 4300, cpc: 34, cvr: 0.026, frequency: 1.4, ramp: 0.04,
  },
  {
    id: "ad_1005", accountId: "act_demo_1", name: "Festés – vélemények carousel", status: "PAUSED",
    campaign: ["cmp_2", "Lead – Konyha"], adset: ["as_22", "Retarget 30 nap", 3000, "SUCCESS"],
    creative: { headline: "4.9★ – 312 elégedett ügyfél", primaryText: "Szobafestés tisztán, takarítással együtt. Nézd meg, mit mondanak rólunk.", cta: "Ajánlatot kérek", palette: ["#ec4899", "#500724"] },
    age: 80, spend: 1400, cpc: 42, cvr: 0.022, frequency: 1.8, pausedFor: 4,
  },
  {
    id: "ad_2001", accountId: "act_demo_2", name: "Klíma – akciós telepítés", status: "ACTIVE",
    campaign: ["cmp_3", "Lead – Klíma"], adset: ["as_31", "Budapest + agglomeráció", 6000, "FAIL"],
    creative: { headline: "Klíma telepítéssel együtt, fix áron", primaryText: "Ősszel a legjobb az ár. Kérd most a felmérést, a telepítés 1 hét.", cta: "Érdekel", palette: ["#6366f1", "#1e1b4b"] },
    age: 8, spend: 2100, cpc: 105, cvr: 0, frequency: 1.6,
  },
  {
    id: "ad_2002", accountId: "act_demo_2", name: "Hőszivattyú – támogatás", status: "ACTIVE",
    campaign: ["cmp_4", "Lead – Hőszivattyú"], adset: ["as_41", "Családi házak 35–65", 8000, "SUCCESS"],
    creative: { headline: "Hőszivattyú akár 50% támogatással", primaryText: "Megnézzük, mennyit spórolhatsz a fűtésen – ingyenes felmérés, kötelezettség nélkül.", cta: "Kalkulációt kérek", palette: ["#0891b2", "#083344"] },
    age: 45, spend: 7600, cpc: 58, cvr: 0.03, frequency: 2.2,
  },
];

export const demoAds: Ad[] = SPECS.map((s, i) => build(s, 7 + i * 31));

export const demoRecipes: Recipe[] = [
  {
    id: "rcp_green_box",
    name: "Zöld dobozos: szolgáltatás, ár, telefon",
    description:
      "Valódi munkafotó, rajta sötétzöld dobozokban a szolgáltatás neve, egy konkrét ár, egy felszólítás és a telefonszám. A legolcsóbb leadeket hozta.",
    fixed: [
      "Teljes képes fotó, rajta sötétzöld, enyhén lekerekített dobozok, fehér talp nélküli betűvel, középre igazítva",
      "Sorrend felülről: név/logó, szolgáltatás, ár, „Kattints a lenti linkre!”, alsó sor, telefonszám",
      "Az ár külön dobozban, a szolgáltatás alatt – ez a legnagyobb szám a képen",
      "Egyetlen felszólítás a képen",
    ],
    required: [
      "Telefonszám: a cél vállalkozás saját száma",
      "Ár: egy konkrét szám egységgel (pl. „7 000 Ft / m²-től”), nem sáv",
      "Szolgáltatás neve nagy, félkövér betűvel",
      "Felül a cél vállalkozás neve vagy logója",
    ],
    free: ["Az alsó sor: további munkák, szűrő (pl. „Csak 50 m² feletti munkát vállalunk”) vagy terület", "A fotó: eredeti vagy a vállalkozás saját munkafotója"],
    textTemplate: "Minőségi {szolgáltatás}\n{Szolgáltatás}? Kérj ajánlatot még ma, és hamarosan hívunk!",
    exampleAdId: "ad_1006",
    palette: ["#16a34a", "#052e16"],
    createdAt: daysAgo(20),
  },
  {
    id: "rcp_before_after",
    name: "Előtte / utána + határidő",
    description: "Osztott kép (előtte–utána), a headline a határidőt ígéri. Bizalomépítő, jó CTR-rel.",
    fixed: ["Kettéosztott kép: bal oldalt előtte, jobb oldalt utána", "Headline: eredmény + határidő (pl. „… 10 nap alatt”)"],
    required: ["Valódi előtte/utána fotópár", "Konkrét határidő napban"],
    free: ["Első mondat", "CTA szövege"],
    textTemplate: "Új {szolgáltatás} {N} nap alatt\nFix ár, fix határidő. Kérj ingyenes felmérést 30 másodperc alatt.",
    exampleAdId: "ad_1001",
    palette: ["#0ea5e9", "#1e3a8a"],
    createdAt: daysAgo(60),
  },
];

const L = (id: string, ago: number, adId: string, accountId: string, formName: string, name: string, extra: Partial<Lead>): Lead => ({
  id, createdAt: daysAgo(ago), adId, accountId, formName, name, status: "new", ...extra,
});

export const demoLeads: Lead[] = [
  L("ld_1", 0.05, "ad_1006", "act_demo_1", "Felmérés – fürdő", "Kovács Anna", { phone: "+36 30 123 4567", city: "Budapest XI.", note: "Kb. 6 m², kádról zuhanyra" }),
  L("ld_2", 0.3, "ad_1003", "act_demo_1", "Konyha időpont", "Szabó Gergő", { phone: "+36 20 555 0101", city: "Érd", note: "Hétvégén ráér", status: "contacted" }),
  L("ld_3", 0.7, "ad_1002", "act_demo_1", "Sürgős hívás", "Tóth Eszter", { phone: "+36 70 222 3344", city: "Budaörs", note: "Biztosíték lecsap", status: "survey" }),
  L("ld_4", 1.2, "ad_1001", "act_demo_1", "Felmérés – fürdő", "Nagy Péter", { email: "peter@example.com", city: "Budapest III.", status: "won" }),
  L("ld_5", 2.4, "ad_1001", "act_demo_1", "Felmérés – fürdő", "Varga Júlia", { phone: "+36 30 987 6543", city: "Budapest XIV.", status: "contacted" }),
  L("ld_6", 3.1, "ad_1006", "act_demo_1", "Felmérés – fürdő", "Molnár Dávid", { phone: "+36 20 444 1212", city: "Göd", status: "lost" }),
  L("ld_7", 0.2, "ad_2002", "act_demo_2", "Hőszivattyú kalkuláció", "Horváth Zsófia", { phone: "+36 70 111 2233", city: "Szentendre", note: "150 m² ház, gázkazán" }),
];
