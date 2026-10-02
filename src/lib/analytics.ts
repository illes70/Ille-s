import type { Ad, DailyPoint, Lead } from "./types";

export type RangeId = "today" | "7" | "30" | "90";
export type Grain = "day" | "week" | "month";
export type SeriesMetric = "spend" | "leads" | "cpl" | "clicks";

export const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: "today", label: "Ma", days: 1 },
  { id: "7", label: "7 nap", days: 7 },
  { id: "30", label: "30 nap", days: 30 },
  { id: "90", label: "90 nap", days: 90 },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function rangeStart(range: RangeId): string {
  const days = RANGES.find((r) => r.id === range)!.days;
  return isoDay(new Date(Date.now() - (days - 1) * 86_400_000));
}

export interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
  ctr: number;
  cpm: number;
}

export function sumDaily(points: DailyPoint[]): Totals {
  const spend = points.reduce((s, p) => s + p.spend, 0);
  const impressions = points.reduce((s, p) => s + p.impressions, 0);
  const clicks = points.reduce((s, p) => s + p.clicks, 0);
  const leads = points.reduce((s, p) => s + p.leads, 0);
  return {
    spend,
    impressions,
    clicks,
    leads,
    cpl: leads ? spend / leads : null,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
  };
}

export const inRange = (ad: Ad, from: string) => ad.daily.filter((d) => d.date >= from);

export function adTotals(ad: Ad, from: string): Totals {
  return sumDaily(inRange(ad, from));
}

export function totals(ads: Ad[], from: string): Totals {
  return sumDaily(ads.flatMap((a) => inRange(a, from)));
}

function bucketKey(date: string, grain: Grain): string {
  if (grain === "day") return date;
  if (grain === "month") return date.slice(0, 7);
  const d = new Date(`${date}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return isoDay(monday);
}

export function bucketLabel(key: string, grain: Grain): string {
  const months = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
  const [, m, d] = key.split("-").map(Number);
  if (grain === "month") return months[m - 1];
  return `${months[m - 1]} ${d}.`;
}

/** Time series of one metric over the filtered ads, every bucket present (zeros included). */
export function series(ads: Ad[], from: string, grain: Grain, metric: SeriesMetric) {
  const buckets = new Map<string, DailyPoint[]>();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= Date.now(); t += 86_400_000) {
    const key = bucketKey(isoDay(new Date(t)), grain);
    if (!buckets.has(key)) buckets.set(key, []);
  }
  for (const p of ads.flatMap((a) => inRange(a, from))) {
    buckets.get(bucketKey(p.date, grain))?.push(p);
  }
  return [...buckets.entries()].map(([key, points]) => {
    const t = sumDaily(points);
    const value = metric === "cpl" ? t.cpl : t[metric];
    return { key, label: bucketLabel(key, grain), value };
  });
}

export interface AdsetGroup {
  adsetId: string;
  adsetName: string;
  campaignName: string;
  dailyBudget: number;
  learning?: Ad["adsetLearning"];
  active: boolean;
  ads: Ad[];
  totals: Totals;
}

export function groupByAdset(ads: Ad[], from: string): AdsetGroup[] {
  const map = new Map<string, AdsetGroup>();
  for (const ad of ads) {
    const g = map.get(ad.adsetId) ?? {
      adsetId: ad.adsetId,
      adsetName: ad.adsetName,
      campaignName: ad.campaignName,
      dailyBudget: ad.adsetDailyBudget,
      learning: ad.adsetLearning,
      active: false,
      ads: [],
      totals: sumDaily([]),
    };
    g.ads.push(ad);
    g.active ||= ad.status === "ACTIVE";
    map.set(ad.adsetId, g);
  }
  for (const g of map.values()) g.totals = totals(g.ads, from);
  return [...map.values()].sort((a, b) => b.totals.spend - a.totals.spend);
}

export const FUNNEL = [
  { id: "lead", label: "Lead", statuses: ["new", "contacted", "survey", "won", "lost"] },
  { id: "contacted", label: "Felhívva", statuses: ["contacted", "survey", "won"] },
  { id: "survey", label: "Felmérés", statuses: ["survey", "won"] },
  { id: "won", label: "Megnyert", statuses: ["won"] },
] as const;

export function funnel(leads: Lead[]) {
  return FUNNEL.map((stage) => ({
    ...stage,
    count: leads.filter((l) => (stage.statuses as readonly string[]).includes(l.status)).length,
  }));
}
