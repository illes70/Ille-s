import "server-only";
import type { Ad, AdStatus } from "../types";
import { newId, readStore, updateStore } from "../store";
import type { AdsProvider, LeadFormInput, NewAdInput } from "./provider";

const PALETTES: [string, string][] = [
  ["#0ea5e9", "#1e3a8a"],
  ["#f43f5e", "#4c0519"],
  ["#22c55e", "#14532d"],
  ["#a855f7", "#3b0764"],
  ["#f97316", "#431407"],
];

export class DemoProvider implements AdsProvider {
  readonly mode = "demo" as const;

  async listAds() {
    return (await readStore()).ads;
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
      const ad: Ad = {
        id: newId("ad"),
        name: input.name,
        status: input.activate ? "ACTIVE" : "PAUSED",
        campaignId: sibling.campaignId,
        campaignName: sibling.campaignName,
        adsetId: sibling.adsetId,
        adsetName: sibling.adsetName,
        adsetDailyBudget: sibling.adsetDailyBudget,
        creative: {
          headline: input.headline,
          primaryText: input.primaryText,
          cta: input.cta,
          imageUrl: input.imageUrl ?? source?.creative.imageUrl,
          palette:
            source?.creative.palette ?? PALETTES[d.ads.length % PALETTES.length],
        },
        metrics: { spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpm: 0, leads: 0, cpl: null },
        spendTrend: [0, 0, 0, 0, 0, 0, 0],
        createdAt: new Date().toISOString(),
      };
      d.ads.unshift(ad);
      return { id: ad.id };
    });
  }

  async createLeadForm(_input: LeadFormInput) {
    return { id: newId("form") };
  }

  async listLeads() {
    return (await readStore()).leads;
  }
}
