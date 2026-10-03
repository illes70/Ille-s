import { z } from "zod";
import { connectAllLeads, leadAccessOverview, revokeLeadConsent } from "@/lib/meta/lead-access";
import { metaConfigured } from "@/lib/meta/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await metaConfigured())) return Response.json({ mode: "demo", consent: null, pages: [] });
  return Response.json({ mode: "meta", ...(await leadAccessOverview()) });
}

const Body = z.object({ pageIds: z.array(z.string()).optional() });

/** "Igen, kösd be az összes leadet" */
export async function POST(req: Request) {
  if (!(await metaConfigured())) return Response.json({ error: "Előbb csatlakoztasd a Facebookot." }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Hibás kérés" }, { status: 400 });
  try {
    return Response.json({ pages: await connectAllLeads(parsed.data.pageIds) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function DELETE() {
  await revokeLeadConsent();
  return Response.json({ ok: true });
}
