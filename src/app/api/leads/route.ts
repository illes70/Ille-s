import { getProvider } from "@/lib/meta/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await (await getProvider()).listLeads());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
