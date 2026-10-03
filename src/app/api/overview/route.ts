import { getOverview } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.has("fresh");
  try {
    const { signature: _s, ...ov } = await getOverview(fresh ? 0 : 30_000);
    return Response.json(ov);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
