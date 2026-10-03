import { getProvider } from "@/lib/meta/provider";

export const dynamic = "force-dynamic";

const FORMATS = ["feed", "instagram", "story", "reels", "facebook_story", "desktop"] as const;

/** Meta's own rendering of the ad in a placement (iframe src). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") ?? "feed";
  if (!FORMATS.includes(format as (typeof FORMATS)[number])) return Response.json({ error: "ismeretlen formátum" }, { status: 400 });
  const provider = await getProvider();
  if (provider.mode === "demo") return Response.json({ demo: true });
  try {
    const { adPreviewSrc } = await import("@/lib/meta/manage");
    return Response.json({ src: await adPreviewSrc(id, format as (typeof FORMATS)[number]) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message.split("\n")[0] : String(err) }, { status: 502 });
  }
}
