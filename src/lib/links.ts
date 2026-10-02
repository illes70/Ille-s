/** Ads Manager deep link for an account / ad (safe to use in the browser). */
export function adsManagerUrl(accountId: string, adId?: string) {
  const act = accountId.replace(/^act_/, "");
  return adId
    ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act}&selected_ad_ids=${adId}`
    : `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}`;
}
