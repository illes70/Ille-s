import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "../store";
import { currentTenant } from "../tenant";

// Ad creative images, cached on our side. Meta's image links (fbcdn) are signed and
// expire, so a dashboard that hotlinks them goes blank after a while. Every creative
// gets a stable OCP URL instead; the first request downloads the original
// full-resolution image once, after that it's served from disk forever
// (Meta creatives are immutable, so the cache never goes stale).

/** Per workspace: a creative is only served to the workspace whose token could read it. */
const creativeDir = async () => path.join(await dataDir(), "creatives");

interface Source {
  accountId: string;
  /** image hash → original upload via /adimages (best quality) */
  hash?: string;
  /** direct URL: video cover, 1080px rendering, or asset feed image */
  url?: string;
}

const g = globalThis as unknown as { __ocpCreativeSrc?: Map<string, Source>; __ocpCreativeJobs?: Map<string, Promise<CachedImage>> };
const sources = (g.__ocpCreativeSrc ??= new Map());
const jobs = (g.__ocpCreativeJobs ??= new Map());

export function registerCreativeSource(tenant: string, creativeId: string, src: Source) {
  sources.set(`${tenant}:${creativeId}`, src);
}

export const creativeImageUrl = (creativeId: string) => `/api/creative/${creativeId}`;

export interface CachedImage {
  bytes: Buffer;
  mime: string;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

async function fromDisk(id: string): Promise<CachedImage | null> {
  const dir = await creativeDir();
  for (const ext of Object.keys(MIME)) {
    try {
      return { bytes: await fs.readFile(path.join(dir, `${id}.${ext}`)), mime: MIME[ext] };
    } catch {}
  }
  return null;
}

/** Cached creative image, downloading it on first use (deduplicated across requests). */
export async function getCreativeImage(id: string): Promise<CachedImage> {
  const key = `${await currentTenant()}:${id}`;
  const running = jobs.get(key);
  if (running) return running;
  const job = (async () => {
    const cached = await fromDisk(id);
    if (cached) return cached;
    const url = await resolveOriginal(id);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Kép letöltése sikertelen (${res.status})`);
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
    const bytes = Buffer.from(await res.arrayBuffer());
    const dir = await creativeDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.${EXT[mime] ?? "jpg"}`), bytes);
    return { bytes, mime };
  })().finally(() => jobs.delete(key));
  jobs.set(key, job);
  return job;
}

async function resolveOriginal(id: string): Promise<string> {
  const { graph } = await import("../meta/graph");
  let src = sources.get(`${await currentTenant()}:${id}`);
  if (!src) {
    // not seen since the server started: ask Meta directly
    const c = await graph<{ account_id?: string; image_hash?: string; image_url?: string; thumbnail_url?: string }>(
      id,
      { params: { fields: "account_id,image_hash,image_url,thumbnail_url", thumbnail_width: "1080", thumbnail_height: "1080" } },
    );
    src = { accountId: c.account_id ? `act_${c.account_id}` : "", hash: c.image_hash, url: c.image_url ?? c.thumbnail_url };
  }
  if (src.hash && src.accountId) {
    const res = await graph<{ data: { url?: string }[] }>(`${src.accountId}/adimages`, {
      params: { hashes: [src.hash], fields: "url" },
    }).catch(() => null);
    const original = res?.data[0]?.url;
    if (original) return original;
  }
  if (src.url) return src.url;
  throw new Error("Ennek a kreatívnak nincs képe.");
}

/** Download the images of many ads in the background (a few at a time). */
export async function warmCreativeImages(creativeIds: string[], concurrency = 6) {
  const queue = [...new Set(creativeIds)];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await getCreativeImage(id).catch(() => undefined);
    }),
  );
}
