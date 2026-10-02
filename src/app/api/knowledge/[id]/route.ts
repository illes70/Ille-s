import { updateStore } from "@/lib/store";
import { KnowledgeInput } from "@/lib/schemas";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = KnowledgeInput.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const ok = await updateStore((d) => {
    const e = d.knowledge.find((x) => x.id === id);
    if (!e) return false;
    Object.assign(e, parsed.data);
    return true;
  }, ["knowledge"]);
  return ok ? Response.json({ ok }) : Response.json({ error: "nincs ilyen" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await updateStore((d) => void (d.knowledge = d.knowledge.filter((x) => x.id !== id)), ["knowledge"]);
  return Response.json({ ok: true });
}
