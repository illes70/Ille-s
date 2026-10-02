import "server-only";
import type { Ad, AdAccount, AdStatus, Lead } from "../types";
import { readStore } from "../store";

export interface NewAdInput {
  adsetId: string;
  name: string;
  headline: string;
  primaryText: string;
  cta: string;
  /** public image URL; if omitted, `reuseImageFromAdId` is used */
  imageUrl?: string;
  reuseImageFromAdId?: string;
  linkUrl?: string;
  leadFormId?: string;
  recipeId?: string;
  activate: boolean;
}

export interface LeadFormInput {
  name: string;
  intro: string;
  questions: ("FULL_NAME" | "PHONE" | "EMAIL" | "CITY")[];
  customQuestion?: string;
  privacyUrl: string;
  thankYou: string;
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
  createLeadForm(input: LeadFormInput): Promise<{ id: string }>;
  /** raw leads from the platform; statuses are applied from the store by `getLeads` */
  listLeads(): Promise<Lead[]>;
}

export const metaConfigured = () => !!process.env.META_ACCESS_TOKEN;

export async function listAccounts(): Promise<AdAccount[]> {
  if (metaConfigured()) {
    const { listMetaAccounts } = await import("./graph");
    return listMetaAccounts();
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
  if (metaConfigured()) {
    const { MetaGraphProvider } = await import("./graph");
    return new MetaGraphProvider(account, accounts);
  }
  const { DemoProvider } = await import("./demo");
  return new DemoProvider(account, accounts);
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
