import { getProvider } from "@/lib/meta/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = await getProvider();
    return Response.json({
      mode: provider.mode,
      account: provider.account,
      ads: await provider.listAds(),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
