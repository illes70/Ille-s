import { promises as fs } from "fs";
import path from "path";
import { mediaDir, MIME } from "@/lib/creative/media";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[\w-]+\.(png|jpe?g|webp|gif|mp4|mov)$/.test(file)) return new Response("not found", { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(await mediaDir(), file));
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": MIME[file.split(".").pop()!.toLowerCase()], "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
