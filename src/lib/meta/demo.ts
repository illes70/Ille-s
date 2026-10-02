import "server-only";
import type { Ad, AdAccount, AdStatus } from "../types";
import { newId, readStore, updateStore } from "../store";
import type { AdsProvider, CreativeUpdate, LeadFormInput, NewAdInput } from "./provider";

const PALETTES: [string, string][] = [
  ["#0ea5e9", "#1e3a8a"],
  ["#f43f5e", "#4c0519"],
  ["#22c55e", "#14532d"],
  ["#a855f7", "#3b0764"],
  ["#f97316", "#431407"],
];

export class DemoProvider implements AdsProvider {
  readonly mode = "demo" as const;
  constructor(
    readonly account: AdAccount,
    private accounts: AdAccount[],
  ) {}

  async listAccounts() {
    return this.accounts;
  }

  async listAds() {
    return (await readStore()).ads.filter((a) => a.accountId === this.account.id);
  }

  async setAdStatus(adId: string, status: AdStatus) {
    await updateStore((d) => {
      const ad = d.ads.find((a) => a.id === adId);
      if (!ad) throw new Error(`Nincs ilyen hirdetés: ${adId}`);
      ad.status = status;
    });
  }

  async setAdsetBudget(adsetId: string, dailyBudget: number) {
    await updateStore((d) => {
      const ads = d.ads.filter((a) => a.adsetId === adsetId);
      if (!ads.length) throw new Error(`Nincs ilyen hirdetéscsoport: ${adsetId}`);
      ads.forEach((a) => (a.adsetDailyBudget = dailyBudget));
    });
  }

  async createAd(input: NewAdInput) {
    return updateStore((d) => {
      const sibling = d.ads.find((a) => a.adsetId === input.adsetId);
      if (!sibling) throw new Error(`Nincs ilyen hirdetéscsoport: ${input.adsetId}`);
      const source = input.reuseImageFromAdId
        ? d.ads.find((a) => a.id === input.reuseImageFromAdId)
        : undefined;
      const recipe = input.recipeId ? d.recipes.find((r) => r.id === input.recipeId) : undefined;
      const ad: Ad = {
        id: newId("ad"),
        accountId: sibling.accountId,
        name: input.name,
        status: input.activate ? "ACTIVE" : "PAUSED",
        campaignId: sibling.campaignId,
        campaignName: sibling.campaignName,
        adsetId: sibling.adsetId,
        adsetName: sibling.adsetName,
        adsetDailyBudget: sibling.adsetDailyBudget,
        adsetLearning: sibling.adsetLearning,
        creative: {
          headline: input.headline,
          primaryText: input.primaryText,
          cta: input.cta,
          imageUrl: input.imageUrl ?? source?.creative.imageUrl,
          palette: recipe?.palette ?? source?.creative.palette ?? PALETTES[d.ads.length % PALETTES.length],
          recipeId: input.recipeId,
        },
        metrics: { spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpm: 0, leads: 0, cpl: null },
        daily: [],
        createdAt: new Date().toISOString(),
      };
      d.ads.unshift(ad);
      return { id: ad.id };
    });
  }

  async updateAdCreative(adId: string, change: CreativeUpdate) {
    await updateStore((d) => {
      const ad = d.ads.find((a) => a.id === adId);
      if (!ad) throw new Error(`Nincs ilyen hirdetés: ${adId}`);
      if (change.headline !== undefined) ad.creative.headline = change.headline;
      if (change.primaryText !== undefined) ad.creative.primaryText = change.primaryText;
      if (change.imageUrl) ad.creative.imageUrl = change.imageUrl;
    });
  }

  async createLeadForm(_input: LeadFormInput) {
    return { id: newId("form") };
  }

  async listLeads() {
    return (await readStore()).leads.filter((l) => l.accountId === this.account.id);
  }
}
