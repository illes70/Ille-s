import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { MediaItem } from "../types";
import { DATA_DIR, newId, updateStore } from "../store";

export const MEDIA_DIR = path.join(DATA_DIR, "media");

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
export const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

export async function saveMedia(
  bytes: Buffer,
  mime: string,
  meta: Pick<MediaItem, "kind"> & Partial<Pick<MediaItem, "prompt" | "accountId">>,
): Promise<MediaItem> {
  const ext = EXT[mime];
  if (!ext) throw new Error(`Nem támogatott képformátum: ${mime}`);
  const id = newId("img");
  const file = `${id}.${ext}`;
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  await fs.writeFile(path.join(MEDIA_DIR, file), bytes);
  const item: MediaItem = { id, file, url: `/api/media/${file}`, createdAt: new Date().toISOString(), ...meta };
  await updateStore((d) => {
    d.media.unshift(item);
    d.media = d.media.slice(0, 2000);
  });
  return item;
}

/** Bytes of an OCP media URL (/api/media/…) or any public image URL. */
export async function loadImage(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const local = url.match(/^\/api\/media\/([\w.-]+)$/);
  if (local) {
    const ext = local[1].split(".").pop()!.toLowerCase();
    return { bytes: await fs.readFile(path.join(MEDIA_DIR, local[1])), mime: MIME[ext] ?? "image/png" };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`A kép nem tölthető le (${res.status}): ${url}`);
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg" };
}

export async function toDataUrl(url: string) {
  const { bytes, mime } = await loadImage(url);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
