import "server-only";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import type { MediaItem } from "../types";
import { readStore, updateStore } from "../store";
import { loadImage } from "./media";
import { currentTenant } from "../tenant";

// Images go to the Claude Files API once; chat history then only carries the file id
// instead of megabytes of base64 on every turn.

const client = new Anthropic();
const g = globalThis as unknown as { __ocpClaudeFiles?: Map<string, string> };
const ids = (g.__ocpClaudeFiles ??= new Map());

export async function claudeImageBlock(url: string): Promise<Anthropic.Beta.Messages.BetaImageBlockParam> {
  // per workspace: /api/media/<file> resolves to a different folder for every tenant
  const key = `${await currentTenant()}:${url}`;
  let fileId = ids.get(key);
  if (!fileId) {
    const store = await readStore();
    const media: MediaItem | undefined = store.media.find((m) => m.url === url);
    fileId = (media as MediaItem & { claudeFileId?: string })?.claudeFileId;
    if (!fileId) {
      const { bytes, mime } = await loadImage(url);
      const uploaded = await client.files.upload({ file: await toFile(bytes, url.split("/").pop() ?? "image", { type: mime }) });
      fileId = uploaded.id;
      if (media) {
        await updateStore((d) => {
          const m = d.media.find((x) => x.url === url) as (MediaItem & { claudeFileId?: string }) | undefined;
          if (m) m.claudeFileId = fileId;
        });
      }
    }
    ids.set(key, fileId);
  }
  return { type: "image", source: { type: "file", file_id: fileId } };
}
