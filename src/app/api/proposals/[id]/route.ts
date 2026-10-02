import { resolveProposal } from "@/lib/engine/monitor";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { decision } = (await req.json()) as { decision?: string };
  if (decision !== "approved" && decision !== "rejected") {
    return Response.json({ error: "decision: approved | rejected" }, { status: 400 });
  }
  try {
    return Response.json(await resolveProposal(id, decision, "user"));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
