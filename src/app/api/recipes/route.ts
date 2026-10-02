import { getProvider } from "@/lib/meta/provider";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [store, ads] = await Promise.all([readStore(), getProvider().then((p) => p.listAds())]);
  return Response.json(
    store.recipes.map((r) => {
      const used = ads.filter((a) => a.creative.recipeId === r.id || a.id === r.exampleAdId);
      const spend = used.reduce((s, a) => s + a.metrics.spend, 0);
      const leads = used.reduce((s, a) => s + a.metrics.leads, 0);
      return { ...r, example: ads.find((a) => a.id === r.exampleAdId) ?? null, adCount: used.length, spend, leads };
    }),
  );
}
