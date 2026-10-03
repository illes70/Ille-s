import { saveMedia } from "@/lib/creative/media";
import { getProvider } from "@/lib/meta/provider";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

export async function GET() {
  const account = (await getProvider()).account.id;
  return Response.json((await readStore()).media.filter((m) => !m.accountId || m.accountId === account).slice(0, 200));
}

/** Upload one image (multipart field "file"). */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Nincs fájl" }, { status: 400 });
  const video = file.type.startsWith("video/");
  if (file.size > (video ? MAX_VIDEO : MAX_IMAGE)) {
    return Response.json({ error: video ? "A videó legfeljebb 200 MB lehet" : "A kép legfeljebb 8 MB lehet" }, { status: 413 });
  }
  try {
    const account = (await getProvider()).account.id;
    const item = await saveMedia(Buffer.from(await file.arrayBuffer()), file.type, { kind: "upload", accountId: account });
    return Response.json(item);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
