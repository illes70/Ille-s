import "server-only";
import type { Ad, AdStatus, Lead } from "../types";
import type { AdsProvider, LeadFormInput, NewAdInput } from "./provider";

// Meta Marketing API (Graph) implementation.
// Budgets are sent in the currency's minor unit (Meta uses offset 100 for HUF, EUR, USD...).

const VERSION = process.env.META_GRAPH_VERSION ?? "v24.0";
const BASE = `https://graph.facebook.com/${VERSION}`;
const OFFSET = Number(process.env.META_CURRENCY_OFFSET ?? 100);

const LEAD_ACTIONS = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);

interface GraphAction {
  action_type: string;
  value: string;
}

interface GraphAd {
  id: string;
  name: string;
  effective_status: string;
  created_time: string;
  adset?: { id: string; name: string; daily_budget?: string };
  campaign?: { id: string; name: string };
  creative?: {
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    call_to_action_type?: string;
  };
  insights?: {
    data: {
      spend?: string;
      impressions?: string;
      reach?: string;
      frequency?: string;
      clicks?: string;
      ctr?: string;
      cpm?: string;
      actions?: GraphAction[];
    }[];
  };
}

export class MetaGraphProvider implements AdsProvider {
  readonly mode = "meta" as const;
  private token = process.env.META_ACCESS_TOKEN!;
  private account = process.env.META_AD_ACCOUNT_ID!;
  private pageId = process.env.META_PAGE_ID;

  private async call<T>(path: string, init?: { method?: "GET" | "POST"; params?: Record<string, unknown> }): Promise<T> {
    const method = init?.method ?? "GET";
    const params = new URLSearchParams({ access_token: this.token });
    for (const [k, v] of Object.entries(init?.params ?? {})) {
      params.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    const res =
      method === "GET"
        ? await fetch(`${BASE}/${path}?${params}`, { cache: "no-store" })
        : await fetch(`${BASE}/${path}`, { method: "POST", body: params });
    const json = (await res.json()) as T & { error?: { message: string } };
    if (!res.ok || json.error) {
      throw new Error(`Meta API hiba (${path}): ${json.error?.message ?? res.statusText}`);
    }
    return json;
  }

  async listAds(): Promise<Ad[]> {
    const fields = [
      "id",
      "name",
      "effective_status",
      "created_time",
      "adset{id,name,daily_budget}",
      "campaign{id,name}",
      "creative{title,body,image_url,thumbnail_url,call_to_action_type}",
      "insights.date_preset(last_7d){spend,impressions,reach,frequency,clicks,ctr,cpm,actions}",
    ].join(",");
    const { data } = await this.call<{ data: GraphAd[] }>(`${this.account}/ads`, {
      params: {
        fields,
        limit: "200",
        effective_status: ["ACTIVE", "PAUSED", "ADSET_PAUSED", "CAMPAIGN_PAUSED"],
      },
    });
    return data.map((a) => this.toAd(a));
  }

  private toAd(a: GraphAd): Ad {
    const i = a.insights?.data[0] ?? {};
    const leads = (i.actions ?? [])
      .filter((x) => LEAD_ACTIONS.has(x.action_type))
      .reduce((s, x) => Math.max(s, Number(x.value)), 0);
    const spend = Number(i.spend ?? 0);
    return {
      id: a.id,
      name: a.name,
      status: a.effective_status === "ACTIVE" ? "ACTIVE" : "PAUSED",
      campaignId: a.campaign?.id ?? "",
      campaignName: a.campaign?.name ?? "",
      adsetId: a.adset?.id ?? "",
      adsetName: a.adset?.name ?? "",
      adsetDailyBudget: Number(a.adset?.daily_budget ?? 0) / OFFSET,
      creative: {
        headline: a.creative?.title ?? a.name,
        primaryText: a.creative?.body ?? "",
        cta: a.creative?.call_to_action_type ?? "LEARN_MORE",
        imageUrl: a.creative?.image_url ?? a.creative?.thumbnail_url,
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
      // Daily breakdown needs a separate insights call (time_increment=1); kept flat for now.
      spendTrend: Array(7).fill(spend / 7),
      createdAt: a.created_time,
    };
  }

  async setAdStatus(adId: string, status: AdStatus) {
    await this.call(adId, { method: "POST", params: { status } });
  }

  async setAdsetBudget(adsetId: string, dailyBudget: number) {
    await this.call(adsetId, {
      method: "POST",
      params: { daily_budget: String(Math.round(dailyBudget * OFFSET)) },
    });
  }

  private async imageHash(input: NewAdInput): Promise<string> {
    if (input.imageUrl) {
      const img = await fetch(input.imageUrl);
      if (!img.ok) throw new Error(`A kép nem tölthető le: ${input.imageUrl}`);
      const bytes = Buffer.from(await img.arrayBuffer()).toString("base64");
      const res = await this.call<{ images: Record<string, { hash: string }> }>(
        `${this.account}/adimages`,
        { method: "POST", params: { bytes } },
      );
      return Object.values(res.images)[0].hash;
    }
    if (input.reuseImageFromAdId) {
      const ad = await this.call<{ creative: { image_hash?: string } }>(input.reuseImageFromAdId, {
        params: { fields: "creative{image_hash}" },
      });
      if (ad.creative.image_hash) return ad.creative.image_hash;
    }
    throw new Error("Új hirdetéshez kép kell (imageUrl vagy reuseImageFromAdId).");
  }

  async createAd(input: NewAdInput) {
    if (!this.pageId) throw new Error("META_PAGE_ID nincs beállítva.");
    const image_hash = await this.imageHash(input);
    const callToAction = input.leadFormId
      ? { type: input.cta, value: { lead_gen_form_id: input.leadFormId } }
      : { type: input.cta, value: { link: input.linkUrl } };
    const creative = await this.call<{ id: string }>(`${this.account}/adcreatives`, {
      method: "POST",
      params: {
        name: `OCP – ${input.name}`,
        object_story_spec: {
          page_id: this.pageId,
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
    return this.call<{ id: string }>(`${this.account}/ads`, {
      method: "POST",
      params: {
        name: input.name,
        adset_id: input.adsetId,
        creative: { creative_id: creative.id },
        status: input.activate ? "ACTIVE" : "PAUSED",
      },
    });
  }

  async createLeadForm(input: LeadFormInput) {
    if (!this.pageId) throw new Error("META_PAGE_ID nincs beállítva.");
    const questions: Record<string, string>[] = input.questions.map((type) => ({ type }));
    if (input.customQuestion) {
      questions.push({ type: "CUSTOM", key: "note", label: input.customQuestion });
    }
    // Lead forms are created on the Page and need a Page access token with leads_retrieval.
    return this.call<{ id: string }>(`${this.pageId}/leadgen_forms`, {
      method: "POST",
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
    if (!this.pageId) return [];
    const forms = await this.call<{ data: { id: string; name: string }[] }>(
      `${this.pageId}/leadgen_forms`,
      { params: { fields: "id,name", limit: "25" } },
    );
    const leads: Lead[] = [];
    for (const form of forms.data) {
      const res = await this.call<{
        data: { id: string; created_time: string; ad_id?: string; field_data: { name: string; values: string[] }[] }[];
      }>(`${form.id}/leads`, { params: { fields: "id,created_time,ad_id,field_data", limit: "50" } });
      for (const l of res.data) {
        const f = (k: string) => l.field_data.find((x) => x.name === k)?.values[0];
        leads.push({
          id: l.id,
          createdAt: l.created_time,
          adId: l.ad_id,
          formName: form.name,
          name: f("full_name") ?? "Ismeretlen",
          phone: f("phone_number"),
          email: f("email"),
          city: f("city"),
          note: f("note"),
        });
      }
    }
    return leads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
