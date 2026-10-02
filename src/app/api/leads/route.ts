import { getLeads } from "@/lib/meta/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getLeads());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
