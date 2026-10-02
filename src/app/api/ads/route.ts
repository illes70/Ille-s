import { getAdsLive } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const { mode, account, ads, fetchedAt } = await getAdsLive(undefined, fresh ? 0 : 30_000);
    return Response.json({ mode, account, ads, fetchedAt });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
