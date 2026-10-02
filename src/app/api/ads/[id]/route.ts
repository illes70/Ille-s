import { z } from "zod";
import { getProvider } from "@/lib/meta/provider";
import { logActivity } from "@/lib/store";

const Body = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    const provider = await getProvider();
    await provider.setAdStatus(id, parsed.data.status);
    const name = (await provider.listAds()).find((a) => a.id === id)?.name ?? id;
    await logActivity("user", "action", `${parsed.data.status === "PAUSED" ? "Leállítva" : "Elindítva"}: ${name}`);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
