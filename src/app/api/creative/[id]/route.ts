import { getCreativeImage } from "@/lib/creative/creative-images";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return new Response("not found", { status: 404 });
  try {
    const img = await getCreativeImage(id);
    return new Response(new Uint8Array(img.bytes), {
      headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "error", { status: 502 });
  }
}
