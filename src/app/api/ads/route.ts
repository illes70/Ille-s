import { getProvider } from "@/lib/meta/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = await getProvider();
  try {
    return Response.json({ mode: provider.mode, ads: await provider.listAds() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
