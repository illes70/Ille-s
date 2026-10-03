import "server-only";
import type { Ad, AdAccount, AdStatus, Lead } from "../types";
import { readStore } from "../store";
import { adsChanged } from "../live-bus";

export interface NewAdInput {
  adsetId: string;
  name: string;
  headline: string;
  primaryText: string;
  cta: string;
  /** image (default), carousel (2–10 cards) or video */
  format?: "image" | "carousel" | "video";
  description?: string;
  /** public or OCP image URL; if omitted, `reuseImageFromAdId` is used */
  imageUrl?: string;
  reuseImageFromAdId?: string;
  cards?: { imageUrl?: string; reuseImageFromAdId?: string; headline: string; description?: string; link?: string }[];
  /** Meta video id (upload_video) */
  videoId?: string;
  linkUrl?: string;
  leadFormId?: string;
  /** UTM parameters, e.g. utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}} */
  urlTags?: string;
  /** Advantage+ creative features: { text_optimizations: "OPT_OUT", ... } */
  creativeFeatures?: Record<string, "OPT_IN" | "OPT_OUT">;
  recipeId?: string;
  activate: boolean;
}

export interface CreativeUpdate {
  headline?: string;
  primaryText?: string;
  /** OCP media URL (/api/media/…) or public URL */
  imageUrl?: string;
}

export type PrefillField = "FULL_NAME" | "FIRST_NAME" | "LAST_NAME" | "EMAIL" | "PHONE" | "CITY" | "ZIP" | "STREET_ADDRESS" | "COMPANY_NAME" | "JOB_TITLE";

export interface LeadFormInput {
  name: string;
  /** context card: one paragraph or bullet points */
  intro: string[];
  introTitle?: string;
  introStyle?: "PARAGRAPH_STYLE" | "LIST_STYLE";
  questions: (PrefillField | { label: string; options?: string[] })[];
  /** "higher intent": review step before submit – fewer, better leads */
  higherIntent?: boolean;
  privacyUrl: string;
  thankYouTitle?: string;
  thankYou: string;
  thankYouButton?: { type: "VIEW_WEBSITE" | "CALL_BUSINESS"; text: string; url?: string; phone?: string };
  locale?: string;
}

/** Everything OCP can do on an ad platform. Demo and Meta Graph both implement this. */
export interface AdsProvider {
  readonly mode: "demo" | "meta";
  /** the ad account every other call works on */
  readonly account: AdAccount;
  listAccounts(): Promise<AdAccount[]>;
  listAds(): Promise<Ad[]>;
  setAdStatus(adId: string, status: AdStatus): Promise<void>;
  setAdsetBudget(adsetId: string, dailyBudget: number): Promise<void>;
  createAd(input: NewAdInput): Promise<{ id: string }>;
  /** change text and/or image of a running ad (Meta: new creative + re-review) */
  updateAdCreative(adId: string, change: CreativeUpdate): Promise<void>;
  createLeadForm(input: LeadFormInput): Promise<{ id: string }>;
  /** raw leads from the platform; statuses are applied from the store by `getLeads` */
  listLeads(): Promise<Lead[]>;
}

/** Meta mode when there is a token from Facebook Login or from .env. */
export async function metaConfigured(): Promise<boolean> {
  return !!(process.env.META_ACCESS_TOKEN || (await readStore()).metaAuth?.token);
}

// every request needs the account list: keep it for a minute instead of asking Meta each time
const g = globalThis as unknown as { __ocpAccounts?: { at: number; list: AdAccount[]; job?: Promise<AdAccount[]> } };

export function invalidateAccounts() {
  g.__ocpAccounts = undefined;
}

export async function listAccounts(): Promise<AdAccount[]> {
  if (await metaConfigured()) {
    const c = g.__ocpAccounts;
    if (c && Date.now() - c.at < 60_000) return c.list;
    if (c?.job) return c.job;
    const { listMetaAccounts } = await import("./graph");
    const job = listMetaAccounts();
    g.__ocpAccounts = { at: c?.at ?? 0, list: c?.list ?? [], job };
    try {
      const list = await job;
      g.__ocpAccounts = { at: Date.now(), list };
      return list;
    } catch (err) {
      g.__ocpAccounts = c ? { ...c, job: undefined } : undefined;
      // keep serving the last good list rather than breaking every page
      if (c?.list.length) return c.list;
      throw err;
    }
  }
  const { demoAccounts } = await import("../demo-data");
  return demoAccounts;
}

/** Provider bound to an account: the given one, else the active one, else the first. */
export async function getProvider(accountId?: string): Promise<AdsProvider> {
  const accounts = await listAccounts();
  if (!accounts.length) throw new Error("Nincs elérhető hirdetési fiók.");
  const wanted = accountId ?? (await readStore()).activeAccountId ?? process.env.META_AD_ACCOUNT_ID;
  const account = accounts.find((a) => a.id === wanted) ?? accounts[0];
  let provider: AdsProvider;
  if (await metaConfigured()) {
    const { MetaGraphProvider } = await import("./graph");
    provider = new MetaGraphProvider(account, accounts);
  } else {
    const { DemoProvider } = await import("./demo");
    provider = new DemoProvider(account, accounts);
  }
  return withLiveUpdates(provider);
}

/** Every successful change refreshes the ads cache and all open pages immediately. */
function withLiveUpdates(p: AdsProvider): AdsProvider {
  const after = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) =>
    async (...args: A) => {
      const r = await fn.apply(p, args);
      adsChanged(p.account.id);
      return r;
    };
  return Object.assign(Object.create(p) as AdsProvider, {
    setAdStatus: after(p.setAdStatus),
    setAdsetBudget: after(p.setAdsetBudget),
    createAd: after(p.createAd),
    updateAdCreative: after(p.updateAdCreative),
  });
}

/** Leads of the active account with the statuses OCP keeps locally. */
export async function getLeads(provider?: AdsProvider): Promise<Lead[]> {
  const p = provider ?? (await getProvider());
  const [fromPlatform, store] = await Promise.all([p.listLeads(), readStore()]);
  // Leads pushed by the webhook land in the store first; merge them in without duplicates.
  const seen = new Set(fromPlatform.map((l) => l.id));
  const pushed = store.leads.filter((l) => l.accountId === p.account.id && !seen.has(l.id));
  return [...pushed, ...fromPlatform]
    .map((l) => ({ ...l, status: store.leadStatus?.[l.id] ?? l.status ?? "new" }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
