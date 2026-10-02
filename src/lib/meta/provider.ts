import "server-only";
import type { Ad, AdStatus, Lead } from "../types";

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
  listAds(): Promise<Ad[]>;
  setAdStatus(adId: string, status: AdStatus): Promise<void>;
  setAdsetBudget(adsetId: string, dailyBudget: number): Promise<void>;
  createAd(input: NewAdInput): Promise<{ id: string }>;
  createLeadForm(input: LeadFormInput): Promise<{ id: string }>;
  listLeads(): Promise<Lead[]>;
}

export async function getProvider(): Promise<AdsProvider> {
  if (process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID) {
    const { MetaGraphProvider } = await import("./graph");
    return new MetaGraphProvider();
  }
  const { DemoProvider } = await import("./demo");
  return new DemoProvider();
}
