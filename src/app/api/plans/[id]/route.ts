import { z } from "zod";
import { appendToChat, cancelPlan, executePlan, planOutcomeText } from "@/lib/agent/plans";
import { readStore } from "@/lib/store";

const Body = z.object({
  decision: z.enum(["approve", "cancel"]),
  /** step numbers the user unticked */
  skip: z.array(z.number().int()).default([]),
  note: z.string().max(500).optional(),
});

/** The "Mehet" / "Mégse" buttons of a plan card. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Hibás kérés" }, { status: 400 });
  const plan = (await readStore()).plans?.find((p) => p.id === id);
  if (!plan) return Response.json({ error: "Nincs ilyen terv." }, { status: 404 });
  try {
    if (parsed.data.decision === "cancel") {
      await cancelPlan(id);
      await appendToChat(plan.accountId, planOutcomeText(plan, "cancelled", parsed.data.note));
      return Response.json({ ok: true, status: "cancelled" });
    }
    const done = await executePlan(id, { skip: parsed.data.skip, by: "button" });
    await appendToChat(plan.accountId, planOutcomeText(done, "executed"));
    return Response.json(done);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
