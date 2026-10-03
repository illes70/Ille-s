import "server-only";
import { createHash } from "crypto";
import { GRAPH_VERSION, MetaApiError, all, graph, metaPages, metaToken } from "./graph";
import { loadImage } from "../creative/media";
import { readStore } from "../store";

// Everything beyond single ads that Ads Manager can do: account health, the full
// campaign → ad set structure, breakdowns, targeting search and reach, creating and
// editing campaigns / ad sets, copies, audiences, video, previews, Ad Library.

const OFFSET = Number(process.env.META_CURRENCY_OFFSET ?? 100);
const ROOT = process.env.META_GRAPH_BASE ?? "https://graph.facebook.com";
const money = (minor?: string | number | null) => (minor === undefined || minor === null || minor === "" ? undefined : Number(minor) / OFFSET);
const minor = (amount?: number) => (amount === undefined ? undefined : String(Math.round(amount * OFFSET)));
const LEAD_ACTIONS = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);
const leadsOf = (actions?: { action_type: string; value: string }[]) =>
  (actions ?? []).filter((a) => LEAD_ACTIONS.has(a.action_type)).reduce((m, a) => Math.max(m, Number(a.value)), 0);

// ---------------------------------------------------------------- account health

const ACCOUNT_STATUS: Record<number, string> = {
  1: "aktív",
  2: "letiltva",
  3: "rendezetlen tartozás",
  7: "kockázati ellenőrzés alatt",
  8: "elszámolásra vár",
  9: "türelmi időszak (fizetés)",
  100: "lezárás folyamatban",
  101: "lezárva",
};

export async function accountHealth(accountId: string) {
  const acc = await graph<{
    name: string;
    account_status: number;
    disable_reason?: number;
    amount_spent?: string;
    spend_cap?: string;
    balance?: string;
    currency: string;
    timezone_name?: string;
    business?: { name: string };
  }>(accountId, { params: { fields: "name,account_status,disable_reason,amount_spent,spend_cap,balance,currency,timezone_name,business{name}" } });
  const [issues, pixels] = await Promise.all([
    all<{ id: string; name: string; effective_status: string; issues_info?: { error_summary?: string; error_message?: string }[]; ad_review_feedback?: { global?: Record<string, string> } }>(
      `${accountId}/ads`,
      { fields: "id,name,effective_status,issues_info,ad_review_feedback", effective_status: ["DISAPPROVED", "WITH_ISSUES", "PENDING_REVIEW"], limit: "100" },
      200,
    ).catch(() => []),
    all<{ id: string; name: string; last_fired_time?: string; is_unavailable?: boolean }>(`${accountId}/adspixels`, { fields: "id,name,last_fired_time,is_unavailable" }, 20).catch(() => []),
  ]);
  const spent = money(acc.amount_spent) ?? 0;
  const cap = money(acc.spend_cap);
  return {
    name: acc.name,
    status: ACCOUNT_STATUS[acc.account_status] ?? `ismeretlen (${acc.account_status})`,
    healthy: acc.account_status === 1,
    business: acc.business?.name,
    currency: acc.currency,
    timezone: acc.timezone_name,
    amountSpent: spent,
    spendCap: cap || null,
    spendCapRemaining: cap ? cap - spent : null,
    balanceDue: money(acc.balance) ?? 0,
    adsWithIssues: issues.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.effective_status,
      reasons: [
        ...(a.issues_info ?? []).map((i) => i.error_message ?? i.error_summary ?? ""),
        ...Object.values(a.ad_review_feedback?.global ?? {}),
      ].filter(Boolean),
    })),
    pixels: pixels.map((p) => ({
      id: p.id,
      name: p.name,
      lastFired: p.last_fired_time ?? null,
      silentHours: p.last_fired_time ? Math.round((Date.now() - new Date(p.last_fired_time).getTime()) / 3_600_000) : null,
    })),
  };
}

// ---------------------------------------------------------------- structure

interface GTargeting {
  geo_locations?: {
    countries?: string[];
    regions?: { key: string; name?: string }[];
    cities?: { key: string; name?: string; radius?: number; distance_unit?: string }[];
    custom_locations?: { latitude: number; longitude: number; radius: number; distance_unit?: string; name?: string }[];
    location_types?: string[];
  };
  age_min?: number;
  age_max?: number;
  genders?: number[];
  flexible_spec?: Record<string, { id: string; name: string }[]>[];
  custom_audiences?: { id: string; name?: string }[];
  excluded_custom_audiences?: { id: string; name?: string }[];
  targeting_automation?: { advantage_audience?: number };
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  messenger_positions?: string[];
  audience_network_positions?: string[];
  locales?: number[];
}

export function describeTargeting(t: GTargeting = {}) {
  const g = t.geo_locations ?? {};
  const geo = [
    ...(g.countries ?? []),
    ...(g.regions ?? []).map((r) => r.name ?? r.key),
    ...(g.cities ?? []).map((c) => `${c.name ?? c.key}${c.radius ? ` +${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"}` : ""}`),
    ...(g.custom_locations ?? []).map((c) => `${c.name ?? `${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}`} +${c.radius} km`),
  ];
  const detailed = (t.flexible_spec ?? []).flatMap((f) => Object.values(f).flat().map((x) => x.name));
  const manual = !!t.publisher_platforms?.length;
  return {
    locations: geo,
    age: `${t.age_min ?? 18}–${t.age_max ?? 65}+`,
    genders: !t.genders?.length ? "mindenki" : t.genders.includes(1) && t.genders.includes(2) ? "mindenki" : t.genders.includes(1) ? "férfiak" : "nők",
    advantageAudience: t.targeting_automation?.advantage_audience === 1,
    detailedTargeting: detailed,
    customAudiences: (t.custom_audiences ?? []).map((a) => a.name ?? a.id),
    excludedAudiences: (t.excluded_custom_audiences ?? []).map((a) => a.name ?? a.id),
    placements: manual
      ? [...(t.facebook_positions ?? []).map((p) => `facebook:${p}`), ...(t.instagram_positions ?? []).map((p) => `instagram:${p}`), ...(t.publisher_platforms ?? []).filter((p) => !["facebook", "instagram"].includes(p))]
      : ["Advantage+ elhelyezések (mind)"],
  };
}

export async function accountStructure(accountId: string) {
  const [campaigns, adsets] = await Promise.all([
    all<{
      id: string;
      name: string;
      objective: string;
      effective_status: string;
      special_ad_categories?: string[];
      daily_budget?: string;
      lifetime_budget?: string;
      bid_strategy?: string;
      spend_cap?: string;
    }>(`${accountId}/campaigns`, {
      fields: "id,name,objective,effective_status,special_ad_categories,daily_budget,lifetime_budget,bid_strategy,spend_cap",
      effective_status: ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"],
      limit: "100",
    }),
    all<{
      id: string;
      name: string;
      campaign_id: string;
      effective_status: string;
      optimization_goal?: string;
      destination_type?: string;
      billing_event?: string;
      daily_budget?: string;
      lifetime_budget?: string;
      bid_strategy?: string;
      bid_amount?: number;
      targeting?: GTargeting;
      promoted_object?: Record<string, string>;
      start_time?: string;
      end_time?: string;
      learning_stage_info?: { status?: string };
      attribution_spec?: { event_type: string; window_days: number }[];
      dsa_beneficiary?: string;
      dsa_payor?: string;
    }>(`${accountId}/adsets`, {
      fields:
        "id,name,campaign_id,effective_status,optimization_goal,destination_type,billing_event,daily_budget,lifetime_budget,bid_strategy,bid_amount,targeting,promoted_object,start_time,end_time,learning_stage_info,attribution_spec,dsa_beneficiary,dsa_payor",
      effective_status: ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED"],
      limit: "200",
    }),
  ]);
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    objective: c.objective,
    status: c.effective_status,
    specialAdCategories: c.special_ad_categories ?? [],
    budget: c.daily_budget || c.lifetime_budget ? { mode: "CBO (Advantage kampánybüdzsé)", daily: money(c.daily_budget), lifetime: money(c.lifetime_budget) } : { mode: "ABO (hirdetéscsoport-büdzsé)" },
    bidStrategy: c.bid_strategy ?? null,
    spendCap: money(c.spend_cap) ?? null,
    adSets: adsets
      .filter((a) => a.campaign_id === c.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        status: a.effective_status,
        learning: a.learning_stage_info?.status ?? null,
        optimizationGoal: a.optimization_goal,
        destination: a.destination_type ?? null,
        dailyBudget: money(a.daily_budget) ?? null,
        lifetimeBudget: money(a.lifetime_budget) ?? null,
        bidStrategy: a.bid_strategy ?? null,
        bidAmount: money(a.bid_amount) ?? null,
        promotedObject: a.promoted_object ?? null,
        schedule: { start: a.start_time ?? null, end: a.end_time ?? null },
        attribution: (a.attribution_spec ?? []).map((x) => `${x.window_days} napos ${x.event_type === "CLICK_THROUGH" ? "kattintás" : x.event_type === "VIEW_THROUGH" ? "megtekintés" : x.event_type}`),
        dsa: { beneficiary: a.dsa_beneficiary ?? null, payor: a.dsa_payor ?? null },
        targeting: describeTargeting(a.targeting),
      })),
  }));
}

// ---------------------------------------------------------------- insights

export const BREAKDOWNS = {
  age: "age",
  gender: "gender",
  age_gender: "age,gender",
  placement: "publisher_platform,platform_position",
  platform: "publisher_platform",
  region: "region",
  device: "device_platform",
  hour: "hourly_stats_aggregated_by_advertiser_time_zone",
} as const;

export async function insightsBreakdown(p: {
  accountId: string;
  level: "account" | "campaign" | "adset" | "ad";
  breakdown?: keyof typeof BREAKDOWNS;
  datePreset?: string;
  since?: string;
  until?: string;
  ids?: string[];
}) {
  const rows = await all<Record<string, string> & { actions?: { action_type: string; value: string }[] }>(
    `${p.accountId}/insights`,
    {
      level: p.level,
      fields: "campaign_name,adset_name,ad_name,spend,impressions,reach,frequency,clicks,ctr,cpm,actions",
      breakdowns: p.breakdown ? BREAKDOWNS[p.breakdown] : undefined,
      ...(p.since && p.until ? { time_range: { since: p.since, until: p.until } } : { date_preset: p.datePreset ?? "last_7d" }),
      filtering: p.ids?.length && p.level !== "account" ? [{ field: `${p.level}.id`, operator: "IN", value: p.ids }] : undefined,
      limit: "500",
    },
    2000,
  );
  const dims = p.breakdown ? BREAKDOWNS[p.breakdown].split(",") : [];
  return rows.map((r) => {
    const spend = Number(r.spend ?? 0);
    const leads = leadsOf(r.actions);
    return {
      ...(p.level !== "account" ? { name: r.ad_name ?? r.adset_name ?? r.campaign_name } : {}),
      ...Object.fromEntries(dims.map((d) => [d, r[d]])),
      spend,
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      ctr: Number(Number(r.ctr ?? 0).toFixed(2)),
      cpm: Math.round(Number(r.cpm ?? 0)),
      frequency: r.frequency ? Number(Number(r.frequency).toFixed(2)) : undefined,
      leads,
      cpl: leads ? Math.round(spend / leads) : null,
    };
  });
}

// ---------------------------------------------------------------- targeting

export async function searchTargeting(accountId: string, kind: "detailed" | "location", q: string, country = "HU") {
  if (kind === "location") {
    const res = await graph<{ data: { key: string; name: string; type: string; region?: string; country_code?: string }[] }>("search", {
      params: { type: "adgeolocation", q, location_types: ["city", "region", "country", "zip"], country_code: country, limit: "15" },
    });
    return res.data.map((x) => ({ key: x.key, name: x.name, type: x.type, region: x.region, country: x.country_code }));
  }
  const res = await graph<{ data: { id: string; name: string; type?: string; path?: string[]; audience_size_lower_bound?: number; audience_size_upper_bound?: number }[] }>(
    `${accountId}/targetingsearch`,
    { params: { q, limit: "20" } },
  );
  return res.data.map((x) => ({
    id: x.id,
    name: x.name,
    type: x.type ?? "interests",
    path: x.path?.join(" › "),
    audience: x.audience_size_lower_bound ? `${x.audience_size_lower_bound.toLocaleString("hu-HU")}–${(x.audience_size_upper_bound ?? 0).toLocaleString("hu-HU")}` : undefined,
  }));
}

export interface TargetingInput {
  countries?: string[];
  regions?: { key: string; name?: string }[];
  cities?: { key: string; name?: string; radius_km?: number }[];
  points?: { latitude: number; longitude: number; radius_km: number; name?: string }[];
  location_types?: ("home" | "recent" | "travel_in")[];
  age_min?: number;
  age_max?: number;
  genders?: ("male" | "female")[];
  interests?: { id: string; name: string }[];
  behaviors?: { id: string; name: string }[];
  custom_audiences?: string[];
  excluded_custom_audiences?: string[];
  advantage_audience?: boolean;
  /** omit for Advantage+ placements */
  placements?: { facebook?: string[]; instagram?: string[]; messenger?: string[]; audience_network?: string[] };
  locales?: number[];
}

export function buildTargeting(t: TargetingInput): GTargeting & Record<string, unknown> {
  const geo: GTargeting["geo_locations"] = {};
  if (t.countries?.length) geo.countries = t.countries;
  if (t.regions?.length) geo.regions = t.regions.map((r) => ({ key: r.key }));
  if (t.cities?.length) geo.cities = t.cities.map((c) => ({ key: c.key, ...(c.radius_km ? { radius: c.radius_km, distance_unit: "kilometer" } : {}) }));
  if (t.points?.length) geo.custom_locations = t.points.map((p) => ({ latitude: p.latitude, longitude: p.longitude, radius: p.radius_km, distance_unit: "kilometer", name: p.name }));
  if (!geo.countries && !geo.regions && !geo.cities && !geo.custom_locations) geo.countries = ["HU"];
  if (t.location_types) geo.location_types = t.location_types;
  const flexible: Record<string, { id: string; name: string }[]> = {};
  if (t.interests?.length) flexible.interests = t.interests;
  if (t.behaviors?.length) flexible.behaviors = t.behaviors;
  const out: GTargeting & Record<string, unknown> = {
    geo_locations: geo,
    age_min: t.age_min ?? 18,
    age_max: t.age_max ?? 65,
    targeting_automation: { advantage_audience: t.advantage_audience === false ? 0 : 1 },
  };
  if (t.genders?.length === 1) out.genders = [t.genders[0] === "male" ? 1 : 2];
  if (Object.keys(flexible).length) out.flexible_spec = [flexible];
  if (t.custom_audiences?.length) out.custom_audiences = t.custom_audiences.map((id) => ({ id }));
  if (t.excluded_custom_audiences?.length) out.excluded_custom_audiences = t.excluded_custom_audiences.map((id) => ({ id }));
  if (t.locales?.length) out.locales = t.locales;
  if (t.placements) {
    const pl = t.placements;
    out.publisher_platforms = [
      ...(pl.facebook?.length ? ["facebook"] : []),
      ...(pl.instagram?.length ? ["instagram"] : []),
      ...(pl.messenger?.length ? ["messenger"] : []),
      ...(pl.audience_network?.length ? ["audience_network"] : []),
    ];
    if (pl.facebook?.length) out.facebook_positions = pl.facebook;
    if (pl.instagram?.length) out.instagram_positions = pl.instagram;
    if (pl.messenger?.length) out.messenger_positions = pl.messenger;
    if (pl.audience_network?.length) out.audience_network_positions = pl.audience_network;
  }
  return out;
}

export async function estimateAudience(accountId: string, targeting: Record<string, unknown>, optimizationGoal = "LEAD_GENERATION") {
  const res = await graph<{ data: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number; estimate_ready?: boolean }[] }>(`${accountId}/delivery_estimate`, {
    params: { targeting_spec: targeting, optimization_goal: optimizationGoal },
  });
  const d = res.data[0] ?? {};
  return { monthlyActiveLow: d.estimate_mau_lower_bound ?? null, monthlyActiveHigh: d.estimate_mau_upper_bound ?? null, ready: d.estimate_ready ?? true };
}

// ---------------------------------------------------------------- create / edit

export async function createCampaign(accountId: string, p: {
  name: string;
  objective: string;
  specialAdCategories: string[];
  cboDailyBudget?: number;
  cboLifetimeBudget?: number;
  bidStrategy?: string;
  spendCap?: number;
}) {
  const cbo = p.cboDailyBudget !== undefined || p.cboLifetimeBudget !== undefined;
  return graph<{ id: string }>(`${accountId}/campaigns`, {
    method: "POST",
    params: {
      name: p.name,
      objective: p.objective,
      status: "PAUSED",
      buying_type: "AUCTION",
      special_ad_categories: p.specialAdCategories.filter((c) => c !== "NONE"),
      special_ad_category_country: p.specialAdCategories.some((c) => c !== "NONE") ? ["HU"] : undefined,
      daily_budget: minor(p.cboDailyBudget),
      lifetime_budget: minor(p.cboLifetimeBudget),
      bid_strategy: cbo ? (p.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP") : undefined,
      spend_cap: minor(p.spendCap),
      // required by newer API versions when the budget sits on the ad sets
      is_adset_budget_sharing_enabled: cbo ? undefined : "false",
    },
  });
}

export async function createAdSet(accountId: string, p: {
  campaignId: string;
  name: string;
  optimizationGoal: string;
  destinationType?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  bidStrategy?: string;
  bidAmount?: number;
  targeting: Record<string, unknown>;
  pageId?: string;
  pixelId?: string;
  customEventType?: string;
  startTime?: string;
  endTime?: string;
  attribution?: { clickDays: 1 | 7; viewDays: 0 | 1 };
  dsaBeneficiary: string;
  dsaPayor: string;
}) {
  const promoted: Record<string, string> = {};
  if (p.pixelId) {
    promoted.pixel_id = p.pixelId;
    promoted.custom_event_type = p.customEventType ?? "LEAD";
  } else if (p.pageId) promoted.page_id = p.pageId;
  return graph<{ id: string }>(`${accountId}/adsets`, {
    method: "POST",
    params: {
      name: p.name,
      campaign_id: p.campaignId,
      status: "PAUSED",
      optimization_goal: p.optimizationGoal,
      billing_event: "IMPRESSIONS",
      destination_type: p.destinationType,
      daily_budget: minor(p.dailyBudget),
      lifetime_budget: minor(p.lifetimeBudget),
      bid_strategy: p.bidStrategy,
      bid_amount: minor(p.bidAmount),
      promoted_object: Object.keys(promoted).length ? promoted : undefined,
      targeting: p.targeting,
      start_time: p.startTime,
      end_time: p.endTime,
      attribution_spec: p.attribution
        ? [{ event_type: "CLICK_THROUGH", window_days: p.attribution.clickDays }, ...(p.attribution.viewDays ? [{ event_type: "VIEW_THROUGH", window_days: 1 }] : [])]
        : undefined,
      // EU Digital Services Act: who benefits from / pays for the ad
      dsa_beneficiary: p.dsaBeneficiary,
      dsa_payor: p.dsaPayor,
    },
  });
}

export async function getAdSetTargeting(adsetId: string) {
  return graph<{ targeting: Record<string, unknown>; learning_stage_info?: { status?: string }; name: string }>(adsetId, {
    params: { fields: "name,targeting,learning_stage_info" },
  });
}

export async function updateObject(id: string, params: Record<string, unknown>) {
  return graph<{ success?: boolean }>(id, { method: "POST", params });
}

export const toMinor = minor;

export async function copyObject(kind: "campaign" | "adset" | "ad", id: string, p: { targetId?: string; deep: boolean; suffix: string }) {
  const params: Record<string, unknown> = {
    status_option: "PAUSED",
    rename_options: { rename_suffix: p.suffix },
  };
  if (kind !== "ad") params.deep_copy = p.deep ? "true" : "false";
  if (kind === "adset" && p.targetId) params.campaign_id = p.targetId;
  if (kind === "ad" && p.targetId) params.adset_id = p.targetId;
  const res = await graph<Record<string, string>>(`${id}/copies`, { method: "POST", params });
  return { id: res.copied_campaign_id ?? res.copied_adset_id ?? res.copied_ad_id ?? res.id, raw: res };
}

// ---------------------------------------------------------------- video

export async function uploadVideo(accountId: string, url: string, name: string) {
  let res: { id: string };
  if (/^https?:\/\//.test(url)) {
    res = await graph<{ id: string }>(`${accountId}/advideos`, { method: "POST", params: { file_url: url, name } });
  } else {
    // OCP media (behind login) → send the bytes
    const { bytes, mime } = await loadImage(url);
    const form = new FormData();
    form.set("access_token", (await metaToken())!);
    form.set("name", name);
    form.set("source", new Blob([new Uint8Array(bytes)], { type: mime }), url.split("/").pop() ?? "video.mp4");
    const r = await fetch(`${ROOT}/${GRAPH_VERSION}/${accountId}/advideos`, { method: "POST", body: form });
    const json = (await r.json()) as { id?: string; error?: { message: string; code?: number } };
    if (!r.ok || !json.id) throw new MetaApiError(`Videó feltöltési hiba: ${json.error?.message ?? r.statusText}`, json.error?.code, "Ellenőrizd a videó formátumát (MP4/MOV) és méretét, majd próbáld újra.");
    res = { id: json.id };
  }
  return res;
}

export async function videoStatus(videoId: string) {
  const v = await graph<{ status?: { video_status?: string; processing_progress?: number } }>(videoId, { params: { fields: "status" } });
  return { status: v.status?.video_status ?? "unknown", progress: v.status?.processing_progress ?? null };
}

// ---------------------------------------------------------------- audiences

export async function listAudiences(accountId: string) {
  const rows = await all<{
    id: string;
    name: string;
    subtype: string;
    approximate_count_lower_bound?: number;
    approximate_count_upper_bound?: number;
    delivery_status?: { code: number; description?: string };
    time_updated?: number;
  }>(`${accountId}/customaudiences`, { fields: "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,time_updated", limit: "200" }, 500);
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.subtype,
    size: a.approximate_count_lower_bound !== undefined && a.approximate_count_lower_bound >= 0 ? `${a.approximate_count_lower_bound}–${a.approximate_count_upper_bound}` : "még számolódik / túl kicsi",
    usable: !a.delivery_status || a.delivery_status.code === 200,
    note: a.delivery_status?.description,
  }));
}

const DAY = 86_400;

export async function createEngagementAudience(accountId: string, p: {
  name: string;
  kind: "website" | "lead_form_opened" | "lead_form_submitted" | "page_engaged" | "instagram_engaged";
  days: number;
  pixelId?: string;
  urlContains?: string;
  pageId?: string;
  instagramUserId?: string;
}) {
  const retention_seconds = Math.min(p.days, p.kind === "website" ? 180 : 365) * DAY;
  let rule: Record<string, unknown>;
  let subtype: string;
  if (p.kind === "website") {
    if (!p.pixelId) throw new Error("Weboldal-látogató közönséghez Pixel kell (get_account_health → pixels).");
    subtype = "WEBSITE";
    rule = {
      inclusions: {
        operator: "or",
        rules: [
          {
            event_sources: [{ id: p.pixelId, type: "pixel" }],
            retention_seconds,
            filter: { operator: "and", filters: [{ field: "url", operator: "i_contains", value: p.urlContains ?? "" }] },
          },
        ],
      },
    };
  } else {
    subtype = "ENGAGEMENT";
    const source =
      p.kind === "instagram_engaged"
        ? { id: p.instagramUserId, type: "ig_business" }
        : { id: p.pageId, type: p.kind.startsWith("lead_form") ? "lead" : "page" };
    if (!source.id) throw new Error("Hiányzik a Facebook-oldal vagy az Instagram-fiók azonosítója (Cégprofil).");
    const event = { lead_form_opened: "lead_generation_opened", lead_form_submitted: "lead_generation_submitted", page_engaged: "page_engaged", instagram_engaged: "ig_business_profile_all" }[p.kind];
    rule = {
      inclusions: {
        operator: "or",
        rules: [{ event_sources: [source], retention_seconds, filter: { operator: "and", filters: [{ field: "event", operator: "eq", value: event }] } }],
      },
    };
  }
  return graph<{ id: string }>(`${accountId}/customaudiences`, { method: "POST", params: { name: p.name, subtype, rule, prefill: "true" } });
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** Meta's normalisation: e-mail lowercase/trim, phone digits with country code, no leading zeros. */
export function normalizePhone(phone: string, country = "36") {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("06")) d = country + d.slice(2);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (!d.startsWith(country) && d.length <= 9) d = country + d;
  return d;
}

/** Customer list from contacts; Meta only ever receives SHA-256 hashes. */
export async function createCustomerListAudience(accountId: string, name: string, contacts: { email?: string; phone?: string }[]) {
  const usable = contacts.filter((c) => c.email || c.phone);
  if (!usable.length) throw new Error("Nincs e-mail vagy telefonszám a listában.");
  const aud = await graph<{ id: string }>(`${accountId}/customaudiences`, {
    method: "POST",
    params: { name, subtype: "CUSTOM", customer_file_source: "USER_PROVIDED_ONLY", description: "OCP – ügyféllista" },
  });
  for (let i = 0; i < usable.length; i += 10_000) {
    const data = usable.slice(i, i + 10_000).map((c) => [c.email ? sha(c.email.trim().toLowerCase()) : "", c.phone ? sha(normalizePhone(c.phone)) : ""]);
    await graph(`${aud.id}/users`, { method: "POST", params: { payload: { schema: ["EMAIL", "PHONE"], data } } });
  }
  return { id: aud.id, uploaded: usable.length };
}

export async function createLookalike(accountId: string, p: { name: string; originAudienceId: string; country: string; ratio: number }) {
  return graph<{ id: string }>(`${accountId}/customaudiences`, {
    method: "POST",
    params: {
      name: p.name,
      subtype: "LOOKALIKE",
      origin_audience_id: p.originAudienceId,
      lookalike_spec: { type: "similarity", ratio: p.ratio, country: p.country },
    },
  });
}

// ---------------------------------------------------------------- pages, forms, previews, library

export async function listLeadForms(pageId: string) {
  const token = (await metaPages()).find((p) => p.id === pageId)?.token;
  const rows = await all<{ id: string; name: string; status: string; leads_count?: number; created_time: string; locale?: string; questions?: { type: string; label?: string }[] }>(
    `${pageId}/leadgen_forms`,
    { fields: "id,name,status,leads_count,created_time,locale,questions", limit: "50" },
    200,
    token,
  );
  return rows.map((f) => ({ id: f.id, name: f.name, status: f.status, leads: f.leads_count ?? null, created: f.created_time, questions: (f.questions ?? []).map((q) => q.label ?? q.type) }));
}

export async function instagramForPage(pageId: string) {
  const token = (await metaPages()).find((p) => p.id === pageId)?.token;
  const r = await graph<{ instagram_business_account?: { id: string; username?: string } }>(pageId, {
    params: { fields: "instagram_business_account{id,username}" },
    token,
  });
  return r.instagram_business_account ?? null;
}

export const PREVIEW_FORMATS = {
  feed: "MOBILE_FEED_STANDARD",
  instagram: "INSTAGRAM_STANDARD",
  story: "INSTAGRAM_STORY",
  reels: "INSTAGRAM_REELS",
  facebook_story: "FACEBOOK_STORY_MOBILE",
  desktop: "DESKTOP_FEED_STANDARD",
} as const;

/** Meta's own rendering of an ad (iframe URL). */
export async function adPreviewSrc(adId: string, format: keyof typeof PREVIEW_FORMATS) {
  const r = await graph<{ data: { body: string }[] }>(`${adId}/previews`, { params: { ad_format: PREVIEW_FORMATS[format] } });
  const body = r.data[0]?.body ?? "";
  const src = body.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  if (!src) throw new Error("A Meta nem adott előnézetet ehhez a formátumhoz.");
  return src;
}

/** Meta Ad Library (in the EU every running ad is listed). Needs Ad Library API access. */
export async function searchAdLibrary(q: string, country = "HU") {
  const r = await graph<{
    data: { id: string; page_name?: string; ad_creative_bodies?: string[]; ad_creative_link_titles?: string[]; ad_delivery_start_time?: string; publisher_platforms?: string[] }[];
  }>("ads_archive", {
    params: {
      search_terms: q,
      ad_reached_countries: [country],
      ad_active_status: "ACTIVE",
      ad_type: "ALL",
      fields: "id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,publisher_platforms",
      limit: "25",
    },
  }).catch((err) => {
    throw new MetaApiError(
      `A Hirdetéstár nem érhető el: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`,
      undefined,
      "A Hirdetéstár API-hoz a Meta személyazonosság-ellenőrzést kér (facebook.com/ID). Addig nézd közvetlenül: facebook.com/ads/library",
    );
  });
  return r.data.map((a) => {
    const days = a.ad_delivery_start_time ? Math.round((Date.now() - new Date(a.ad_delivery_start_time).getTime()) / 86_400_000) : null;
    return {
      page: a.page_name,
      text: a.ad_creative_bodies?.[0]?.slice(0, 300),
      headline: a.ad_creative_link_titles?.[0],
      runningDays: days,
      likelyWinner: days !== null && days >= 30,
      platforms: a.publisher_platforms,
      // the API's snapshot URL carries our access token – link the public Ad Library page instead
      link: `https://www.facebook.com/ads/library/?id=${a.id}`,
    };
  });
}

export async function companyName(accountId: string) {
  const store = await readStore();
  return store.companies[accountId]?.name;
}
