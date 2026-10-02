import type { Ad, Lead, Settings } from "./types";

// Fictional demo account so OCP is fully usable before a Meta account is connected.

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

function metrics(spend: number, impressions: number, reach: number, clicks: number, leads: number) {
  return {
    spend,
    impressions,
    reach,
    frequency: +(impressions / reach).toFixed(2),
    clicks,
    ctr: +((clicks / impressions) * 100).toFixed(2),
    cpm: +((spend / impressions) * 1000).toFixed(0),
    leads,
    cpl: leads ? Math.round(spend / leads) : null,
  };
}

export const demoSettings: Settings = {
  currency: "HUF",
  targetCpl: 2500,
  brandVoice:
    "Közvetlen, magabiztos, tegeződő. Rövid mondatok, konkrét előny az első sorban, nincs túlzó ígéret.",
  autopilot: {
    autoPause: true,
    autoPauseSpendMultiplier: 3,
    maxBudgetIncreasePct: 25,
    frequencyLimit: 3.5,
  },
};

export const demoAds: Ad[] = [
  {
    id: "ad_1001",
    name: "Fürdőszoba felújítás – előtte/utána",
    status: "ACTIVE",
    campaignId: "cmp_1",
    campaignName: "Lead – Felújítás",
    adsetId: "as_11",
    adsetName: "Budapest 25–55",
    adsetDailyBudget: 12000,
    creative: {
      headline: "Új fürdőszoba 10 nap alatt",
      primaryText:
        "Fix ár, fix határidő. Kérj ingyenes felmérést 30 másodperc alatt – holnap már hívunk.",
      cta: "Ajánlatot kérek",
      palette: ["#0ea5e9", "#1e3a8a"],
    },
    metrics: metrics(68400, 41200, 15800, 1030, 41),
    spendTrend: [8900, 9400, 9800, 10100, 9900, 10300, 10000],
    createdAt: daysAgo(21),
  },
  {
    id: "ad_1002",
    name: "Villanyszerelő – sürgős hiba",
    status: "ACTIVE",
    campaignId: "cmp_1",
    campaignName: "Lead – Felújítás",
    adsetId: "as_12",
    adsetName: "Pest megye – érdeklődés",
    adsetDailyBudget: 9000,
    creative: {
      headline: "Áramszünet? 2 órán belül ott vagyunk",
      primaryText: "Hétvégén is. Ellenőrzött szakemberek, átlátható díjak.",
      cta: "Hívást kérek",
      palette: ["#f59e0b", "#7c2d12"],
    },
    metrics: metrics(52100, 37900, 8300, 610, 12),
    spendTrend: [7100, 7300, 7600, 7400, 7500, 7700, 7500],
    createdAt: daysAgo(34),
  },
  {
    id: "ad_1003",
    name: "Konyha – UGC videó stílus",
    status: "ACTIVE",
    campaignId: "cmp_2",
    campaignName: "Lead – Konyha",
    adsetId: "as_21",
    adsetName: "Broad HU",
    adsetDailyBudget: 7000,
    creative: {
      headline: "Ezt a konyhát 6 nap alatt raktuk össze",
      primaryText:
        "Nézd meg, hogyan lett a 12 éves konyhából modern, világos tér – a te lakásodban is megoldjuk.",
      cta: "Időpontot kérek",
      palette: ["#10b981", "#064e3b"],
    },
    metrics: metrics(31500, 29800, 21400, 920, 24),
    spendTrend: [3600, 4100, 4400, 4600, 4700, 5000, 5100],
    createdAt: daysAgo(9),
  },
  {
    id: "ad_1004",
    name: "Klíma – akciós telepítés",
    status: "ACTIVE",
    campaignId: "cmp_3",
    campaignName: "Lead – Klíma",
    adsetId: "as_31",
    adsetName: "Budapest + agglomeráció",
    adsetDailyBudget: 6000,
    creative: {
      headline: "Klíma telepítéssel együtt, fix áron",
      primaryText: "Ősszel a legjobb az ár. Kérd most a felmérést, a telepítés 1 hét.",
      cta: "Érdekel",
      palette: ["#6366f1", "#1e1b4b"],
    },
    metrics: metrics(14800, 18900, 12100, 140, 0),
    spendTrend: [2000, 2100, 2200, 2100, 2200, 2100, 2100],
    createdAt: daysAgo(6),
  },
  {
    id: "ad_1005",
    name: "Festés – vélemények carousel",
    status: "PAUSED",
    campaignId: "cmp_2",
    campaignName: "Lead – Konyha",
    adsetId: "as_22",
    adsetName: "Retarget 30 nap",
    adsetDailyBudget: 3000,
    creative: {
      headline: "4.9★ – 312 elégedett ügyfél",
      primaryText: "Szobafestés tisztán, takarítással együtt. Nézd meg, mit mondanak rólunk.",
      cta: "Ajánlatot kérek",
      palette: ["#ec4899", "#500724"],
    },
    metrics: metrics(9800, 12500, 6900, 230, 5),
    spendTrend: [1400, 1400, 1500, 1400, 1400, 1300, 1400],
    createdAt: daysAgo(40),
  },
];

export const demoLeads: Lead[] = [
  { id: "ld_1", createdAt: daysAgo(0.1), adId: "ad_1001", formName: "Felmérés – fürdő", name: "Kovács Anna", phone: "+36 30 123 4567", city: "Budapest XI.", note: "Kb. 6 m², kádról zuhanyra" },
  { id: "ld_2", createdAt: daysAgo(0.3), adId: "ad_1003", formName: "Konyha időpont", name: "Szabó Gergő", phone: "+36 20 555 0101", city: "Érd", note: "Hétvégén ráér" },
  { id: "ld_3", createdAt: daysAgo(0.7), adId: "ad_1002", formName: "Sürgős hívás", name: "Tóth Eszter", phone: "+36 70 222 3344", city: "Budaörs", note: "Biztosíték lecsap" },
  { id: "ld_4", createdAt: daysAgo(1.2), adId: "ad_1001", formName: "Felmérés – fürdő", name: "Nagy Péter", email: "peter@example.com", city: "Budapest III." },
];
