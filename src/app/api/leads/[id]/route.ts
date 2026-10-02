import { z } from "zod";
import { updateStore } from "@/lib/store";

const Body = z.object({ status: z.enum(["new", "contacted", "survey", "won", "lost"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  await updateStore((d) => void (d.leadStatus[id] = parsed.data.status), ["leads"]);
  return Response.json({ ok: true });
}
