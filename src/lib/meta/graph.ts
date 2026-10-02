import "server-only";
import type { Ad, AdAccount, AdStatus, DailyPoint, LearningStatus, Lead, MetaPage } from "../types";
import { readStore } from "../store";
import { loadImage } from "../creative/media";
import type { AdsProvider, CreativeUpdate, LeadFormInput, NewAdInput } from "./provider";

// Meta Marketing API (Graph) implementation.
// Budgets are sent in the currency's minor unit (Meta uses offset 100 for HUF, EUR, USD...).

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v24.0";
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OFFSET = Number(process.env.META_CURRENCY_OFFSET ?? 100);
/** creative previews are requested at this size so they look sharp at full width */
const THUMB = 1080;

const LEAD_ACTIONS = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);

/** Graph error with a Hungarian, actionable fix. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly hint: string,
  ) {
    super(`${message}\n→ Teendő: ${hint}`);
  }
}

function hintFor(code?: number, subcode?: number): string {
  if (code === 190) return "A Facebook-kapcsolat lejárt vagy visszavonták. Beállítások → Rendszerállapot → „Csatlakozás Facebookkal” újra.";
  if (code === 10 || (code !== undefined && code >= 200 && code < 300))
    return "Hiányzik egy jogosultság. Csatlakozz újra Facebookkal, és minden kért engedélyt hagyj bejelölve. Ha a hirdetési fiók egy Business Managerben van: business.facebook.com/settings → Fiókok → Hirdetési fiókok → add hozzá magad „Kampányok kezelése” joggal.";
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80004)
    return "A Meta átmenetileg korlátozza a lekérdezéseket. Az OCP pár perc múlva automatikusan újrapróbálja, nincs teendő.";
  if (code === 100 && subcode === 33) return "Ez az objektum nem létezik, vagy nincs hozzá hozzáférésed (lehet, hogy másik fiókhoz tartozik).";
  if (code === 368) return "A Meta ideiglenesen blokkolta a műveletet. Nézd meg a Fiókminőség oldalt: facebook.com/business-support-home";
  return "Nézd meg a Rendszerállapot oldalt; ha ott minden zöld, írd meg a hibát az asszisztensnek.";
}

interface GraphError {
  message: string;
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
}

export async function metaToken(): Promise<string | undefined> {
  return process.env.META_ACCESS_TOKEN || (await readStore()).metaAuth?.token;
}

interface CallInit {
  method?: "GET" | "POST" | "DELETE";
  params?: Record<string, unknown>;
  /** absolute URL (paging.next) */
  url?: string;
  /** override token (page tokens) */
  token?: string;
  /** OAuth code/token exchange: send no access_token */
  noAuth?: boolean;
}

export async function graph<T>(p: string, init: CallInit = {}, attempt = 0): Promise<T> {
  const token = init.noAuth ? undefined : (init.token ?? (await metaToken()));
  if (!token && !init.noAuth) throw new MetaApiError("Nincs Meta-kapcsolat.", 190, hintFor(190));
  const method = init.method ?? "GET";
  const params = new URLSearchParams(token ? { access_token: token } : {});
  for (const [k, v] of Object.entries(init.params ?? {})) {
    if (v !== undefined) params.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = init.url
    ? await fetch(init.url, { cache: "no-store" })
    : method === "GET"
      ? await fetch(`${BASE}/${p}?${params}`, { cache: "no-store" })
      : await fetch(`${BASE}/${p}`, { method, body: params });
  const json = (await res.json()) as T & { error?: GraphError };
  if (!res.ok || json.error) {
    const e = json.error;
    const transient = res.status >= 500 || [4, 17, 32, 613, 80004].includes(e?.code ?? -1);
    if (transient && method === "GET" && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      return graph<T>(p, init, attempt + 1);
    }
    throw new MetaApiError(
      `Meta API hiba: ${e?.error_user_msg ?? e?.message ?? res.statusText}`,
      e?.code,
      hintFor(e?.code, e?.error_subcode),
    );
  }
  return json;
}

interface Paged<T> {
  data: T[];
  paging?: { next?: string };
}

/** Follows `paging.next` until `max` rows. */
export async function all<T>(p: string, params: Record<string, unknown>, max = 5000, token?: string): Promise<T[]> {
  const out: T[] = [];
  let page = await graph<Paged<T>>(p, { params, token });
  out.push(...page.data);
  while (page.paging?.next && out.length < max) {
    page = await graph<Paged<T>>(p, { url: page.paging.next });
    out.push(...page.data);
  }
  return out;
}

interface GraphAction {
  action_type: string;
  value: string;
}

interface StorySpec {
  page_id?: string;
  link_data?: { message?: string; name?: string; picture?: string; image_hash?: string; link?: string; call_to_action?: { type?: string; value?: Record<string, string> } };
  video_data?: { message?: string; title?: string; image_url?: string; video_id?: string; call_to_action?: { type?: string } };
}

interface GraphCreative {
  id?: string;
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  call_to_action_type?: string;
  object_type?: string;
  object_story_spec?: StorySpec;
  asset_feed_spec?: { bodies?: { text: string }[]; titles?: { text: string }[]; images?: { url?: string }[] };
}

interface GraphAd {
  id: string;
  name: string;
  effective_status: string;
  created_time: string;
  adset?: { id: string; name: string; daily_budget?: string; learning_stage_info?: { status?: string } };
  campaign?: { id: string; name: string; daily_budget?: string };
  creative?: GraphCreative;
  insights?: {
    data: { spend?: string; impressions?: string; reach?: string; frequency?: string; clicks?: string; ctr?: string; cpm?: string; actions?: GraphAction[] }[];
  };
}

interface GraphDaily {
  ad_id: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: GraphAction[];
}

const leadCount = (actions?: GraphAction[]) =>
  (actions ?? []).filter((x) => LEAD_ACTIONS.has(x.action_type)).reduce((s, x) => Math.max(s, Number(x.value)), 0);

export async function listMetaAccounts(): Promise<AdAccount[]> {
  const rows = await all<{ id: string; name: string; currency: string; account_status: number }>("me/adaccounts", {
    fields: "id,name,currency,account_status",
    limit: "200",
  });
  // 1 = active, 3 = unsettled (still shows data); disabled/closed accounts are hidden
  return rows.filter((r) => r.account_status === 1 || r.account_status === 3).map((r) => ({ id: r.id, name: r.name, currency: r.currency }));
}

/** Page tokens: from the Facebook Login connection, else from /me/accounts with the env token. */
export async function metaPages(): Promise<MetaPage[]> {
  const auth = (await readStore()).metaAuth;
  if (auth?.pages.length && !process.env.META_ACCESS_TOKEN) return auth.pages;
  const rows = await all<{ id: string; name: string; access_token: string }>("me/accounts", { fields: "id,name,access_token", limit: "100" });
  return rows.map((r) => ({ id: r.id, name: r.name, token: r.access_token }));
}

export class MetaGraphProvider implements AdsProvider {
  readonly mode = "meta" as const;

  constructor(
    readonly account: AdAccount,
    private accounts: AdAccount[],
  ) {}

  async listAccounts() {
    return this.accounts;
  }

  /** The Facebook Page this account advertises with: company profile → env → the account's promote pages. */
  private async page(): Promise<MetaPage> {
    const store = await readStore();
    const pages = await metaPages();
    let id = store.companies[this.account.id]?.pageId ?? process.env.META_PAGE_ID;
    if (!id) {
      const promote = await graph<Paged<{ id: string }>>(`${this.account.id}/promote_pages`, { params: { fields: "id", limit: "5" } }).catch(() => null);
      id = promote?.data[0]?.id;
    }
    const page = pages.find((p) => p.id === id) ?? (id ? undefined : pages[0]);
    if (!page) {
      throw new MetaApiError(
        "Nem találom a hirdetési fiókhoz tartozó Facebook-oldalt.",
        undefined,
        "Cégprofil → Facebook-oldal: válaszd ki az oldalt. Ha nincs a listában, csatlakozz újra Facebookkal, és jelöld be az oldalt is.",
      );
    }
    return page;
  }

  async listAds(): Promise<Ad[]> {
    const fields = [
      "id",
      "name",
      "effective_status",
      "created_time",
      "adset{id,name,daily_budget,learning_stage_info}",
      "campaign{id,name,daily_budget}",
      `creative.thumbnail_width(${THUMB}).thumbnail_height(${THUMB}){id,title,body,image_url,thumbnail_url,call_to_action_type,object_type,object_story_spec,asset_feed_spec}`,
      "insights.date_preset(last_7d){spend,impressions,reach,frequency,clicks,ctr,cpm,actions}",
    ].join(",");
    const [ads, daily] = await Promise.all([
      all<GraphAd>(`${this.account.id}/ads`, {
        fields,
        limit: "100",
        effective_status: ["ACTIVE", "PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED", "PENDING_REVIEW", "WITH_ISSUES"],
      }),
      all<GraphDaily>(`${this.account.id}/insights`, {
        level: "ad",
        fields: "ad_id,spend,impressions,clicks,actions",
        time_increment: "1",
        date_preset: "last_90d",
        limit: "1000",
      }),
    ]);
    const byAd = new Map<string, DailyPoint[]>();
    for (const d of daily) {
      const list = byAd.get(d.ad_id) ?? [];
      list.push({
        date: d.date_start,
        spend: Number(d.spend ?? 0),
        impressions: Number(d.impressions ?? 0),
        clicks: Number(d.clicks ?? 0),
        leads: leadCount(d.actions),
      });
      byAd.set(d.ad_id, list);
    }
    return ads.map((a) => this.toAd(a, (byAd.get(a.id) ?? []).sort((x, y) => x.date.localeCompare(y.date))));
  }

  private toAd(a: GraphAd, daily: DailyPoint[]): Ad {
    const i = a.insights?.data[0] ?? {};
    const leads = leadCount(i.actions);
    const spend = Number(i.spend ?? 0);
    const learning = a.adset?.learning_stage_info?.status;
    const c = a.creative ?? {};
    const story = c.object_story_spec;
    const isVideo = c.object_type === "VIDEO" || !!story?.video_data;
    return {
      id: a.id,
      accountId: this.account.id,
      name: a.name,
      status: a.effective_status === "ACTIVE" ? "ACTIVE" : "PAUSED",
      campaignId: a.campaign?.id ?? "",
      campaignName: a.campaign?.name ?? "",
      adsetId: a.adset?.id ?? "",
      adsetName: a.adset?.name ?? "",
      // campaign budget optimisation keeps the budget on the campaign
      adsetDailyBudget: Number(a.adset?.daily_budget ?? a.campaign?.daily_budget ?? 0) / OFFSET,
      adsetLearning: learning === "LEARNING" || learning === "SUCCESS" || learning === "FAIL" ? (learning as LearningStatus) : undefined,
      creative: {
        headline: c.title ?? story?.link_data?.name ?? story?.video_data?.title ?? c.asset_feed_spec?.titles?.[0]?.text ?? a.name,
        primaryText: c.body ?? story?.link_data?.message ?? story?.video_data?.message ?? c.asset_feed_spec?.bodies?.[0]?.text ?? "",
        cta: c.call_to_action_type ?? story?.link_data?.call_to_action?.type ?? "LEARN_MORE",
        // full-size image when Meta has it, otherwise the 1080px rendering of the ad
        imageUrl: (isVideo ? story?.video_data?.image_url : c.image_url) ?? c.thumbnail_url ?? c.asset_feed_spec?.images?.[0]?.url,
        isVideo,
      },
      metrics: {
        spend,
        impressions: Number(i.impressions ?? 0),
        reach: Number(i.reach ?? 0),
        frequency: Number(i.frequency ?? 0),
        clicks: Number(i.clicks ?? 0),
        ctr: Number(i.ctr ?? 0),
        cpm: Number(i.cpm ?? 0),
        leads,
        cpl: leads ? Math.round(spend / leads) : null,
      },
      daily,
      createdAt: a.created_time,
    };
  }

  async setAdStatus(adId: string, status: AdStatus) {
    await graph(adId, { method: "POST", params: { status } });
  }

  async setAdsetBudget(adsetId: string, dailyBudget: number) {
    await graph(adsetId, { method: "POST", params: { daily_budget: String(Math.round(dailyBudget * OFFSET)) } });
  }

  /** Uploads an image to the ad account and returns its hash. Accepts OCP media URLs and public URLs. */
  private async uploadImage(url: string): Promise<string> {
    const bytes = (await loadImage(url)).bytes.toString("base64");
    const res = await graph<{ images: Record<string, { hash: string }> }>(`${this.account.id}/adimages`, {
      method: "POST",
      params: { bytes },
    });
    return Object.values(res.images)[0].hash;
  }

  private async imageHash(input: { imageUrl?: string; reuseImageFromAdId?: string }): Promise<string> {
    if (input.imageUrl) return this.uploadImage(input.imageUrl);
    if (input.reuseImageFromAdId) {
      const ad = await graph<{ creative: { image_hash?: string; object_story_spec?: StorySpec } }>(input.reuseImageFromAdId, {
        params: { fields: "creative{image_hash,object_story_spec}" },
      });
      const hash = ad.creative.image_hash ?? ad.creative.object_story_spec?.link_data?.image_hash;
      if (hash) return hash;
    }
    throw new Error("Új hirdetéshez kép kell (image_url vagy reuse_image_from_ad_id).");
  }

  async createAd(input: NewAdInput) {
    const page = await this.page();
    const image_hash = await this.imageHash(input);
    const callToAction = input.leadFormId
      ? { type: input.cta, value: { lead_gen_form_id: input.leadFormId } }
      : { type: input.cta, value: { link: input.linkUrl } };
    const creative = await graph<{ id: string }>(`${this.account.id}/adcreatives`, {
      method: "POST",
      params: {
        name: `OCP – ${input.name}`,
        object_story_spec: {
          page_id: page.id,
          link_data: {
            image_hash,
            link: input.linkUrl ?? "https://fb.me/",
            message: input.primaryText,
            name: input.headline,
            call_to_action: callToAction,
          },
        },
      },
    });
    return graph<{ id: string }>(`${this.account.id}/ads`, {
      method: "POST",
      params: {
        name: input.name,
        adset_id: input.adsetId,
        creative: { creative_id: creative.id },
        status: input.activate ? "ACTIVE" : "PAUSED",
      },
    });
  }

  /**
   * Meta creatives are immutable: build a new creative from the current one with the
   * requested changes and point the ad at it (the ad goes through review again).
   */
  async updateAdCreative(adId: string, change: CreativeUpdate) {
    const ad = await graph<{ name: string; creative: { id: string; object_story_spec?: StorySpec } }>(adId, {
      params: { fields: "name,creative{id,object_story_spec}" },
    });
    const spec = ad.creative.object_story_spec;
    if (!spec?.link_data) {
      throw new MetaApiError(
        "Ennek a hirdetésnek a kreatívja nem egyszerű képes hirdetés (pl. videó, katalógus vagy dinamikus kreatív).",
        undefined,
        "Ilyenkor új hirdetést érdemes létrehozni a módosított szöveggel/képpel, a régit pedig leállítani – kérd az asszisztenstől.",
      );
    }
    const link_data = { ...spec.link_data };
    if (change.headline !== undefined) link_data.name = change.headline;
    if (change.primaryText !== undefined) link_data.message = change.primaryText;
    if (change.imageUrl) {
      link_data.image_hash = await this.uploadImage(change.imageUrl);
      delete link_data.picture;
    }
    const creative = await graph<{ id: string }>(`${this.account.id}/adcreatives`, {
      method: "POST",
      params: { name: `OCP – ${ad.name} (${new Date().toISOString().slice(0, 10)})`, object_story_spec: { ...spec, link_data } },
    });
    await graph(adId, { method: "POST", params: { creative: { creative_id: creative.id } } });
  }

  async createLeadForm(input: LeadFormInput) {
    const page = await this.page();
    const questions: Record<string, string>[] = input.questions.map((type) => ({ type }));
    if (input.customQuestion) questions.push({ type: "CUSTOM", key: "note", label: input.customQuestion });
    return graph<{ id: string }>(`${page.id}/leadgen_forms`, {
      method: "POST",
      token: page.token,
      params: {
        name: input.name,
        questions,
        privacy_policy: { url: input.privacyUrl },
        context_card: { title: input.name, style: "PARAGRAPH_STYLE", content: [input.intro] },
        thank_you_page: { title: "Köszönjük!", body: input.thankYou },
      },
    });
  }

  async listLeads(): Promise<Lead[]> {
    const page = await this.page().catch(() => null);
    if (!page) return [];
    const forms = await all<{ id: string; name: string }>(`${page.id}/leadgen_forms`, { fields: "id,name", limit: "50" }, 100, page.token);
    const since = Math.floor((Date.now() - 90 * 86_400_000) / 1000);
    const perForm = await Promise.all(
      forms.map(async (form) => {
        const rows = await all<RawLead>(
          `${form.id}/leads`,
          { fields: "id,created_time,ad_id,field_data", limit: "100", filtering: [{ field: "time_created", operator: "GREATER_THAN", value: since }] },
          500,
          page.token,
        ).catch(() => []);
        return rows.map((l) => toLead(l, form.name, this.account.id));
      }),
    );
    return perForm.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

type RawLead = { id: string; created_time: string; ad_id?: string; field_data: { name: string; values: string[] }[] };

const FIELD_ALIASES: Record<keyof Pick<Lead, "name" | "phone" | "email" | "city">, string[]> = {
  name: ["full_name", "first_name", "név", "teljes_név"],
  phone: ["phone_number", "telefonszám", "phone"],
  email: ["email", "e-mail"],
  city: ["city", "város", "település"],
};

export function toLead(l: RawLead, formName: string, accountId?: string): Lead {
  const get = (keys: string[]) => l.field_data.find((x) => keys.includes(x.name.toLowerCase()))?.values[0];
  const known = new Set(Object.values(FIELD_ALIASES).flat());
  // every other answer (custom questions like size or timing) goes into the note
  const extra = l.field_data
    .filter((x) => !known.has(x.name.toLowerCase()))
    .map((x) => `${x.name.replace(/_/g, " ")}: ${x.values.join(", ")}`)
    .join(" · ");
  return {
    id: l.id,
    accountId,
    createdAt: l.created_time,
    adId: l.ad_id,
    formName,
    name: get(FIELD_ALIASES.name) ?? "Ismeretlen",
    phone: get(FIELD_ALIASES.phone),
    email: get(FIELD_ALIASES.email),
    city: get(FIELD_ALIASES.city),
    note: extra || undefined,
    status: "new",
  };
}

/** One lead by id (leadgen webhook). Uses the page token of the page that received it. */
export async function fetchLead(leadId: string, pageId?: string): Promise<Lead> {
  const pages = await metaPages().catch(() => []);
  const token = pages.find((p) => p.id === pageId)?.token;
  const l = await graph<RawLead & { form_id?: string }>(leadId, { params: { fields: "id,created_time,ad_id,form_id,field_data" }, token });
  const [form, ad] = await Promise.all([
    l.form_id ? graph<{ name: string }>(l.form_id, { params: { fields: "name" }, token }).catch(() => null) : null,
    l.ad_id ? graph<{ account_id: string }>(l.ad_id, { params: { fields: "account_id" } }).catch(() => null) : null,
  ]);
  return toLead(l, form?.name ?? "Instant form", ad ? `act_${ad.account_id}` : undefined);
}

/** Facebook Page details used to prefill a company profile. */
export async function pageDetails(pageId: string) {
  const pages = await metaPages();
  const token = pages.find((p) => p.id === pageId)?.token;
  return graph<{ name: string; phone?: string; website?: string; about?: string; category?: string; single_line_address?: string; picture?: { data: { url: string } } }>(
    pageId,
    { params: { fields: "name,phone,website,about,category,single_line_address,picture.width(400){url}" }, token },
  );
}

export { adsManagerUrl } from "../links";
