import "server-only";
import type { MediaItem } from "../types";
import { saveMedia } from "./media";

// Optional AI photo generation through the OpenAI Images API (pay per image).
// The free ChatGPT app has no API, so it can't be called from OCP.

export const imageGenEnabled = () => !!process.env.OPENAI_API_KEY;

export async function generatePhoto(prompt: string, size: "1024x1024" | "1024x1536" | "1536x1024", accountId?: string): Promise<MediaItem> {
  if (!imageGenEnabled()) {
    throw new Error(
      "Az AI képgenerálás nincs bekapcsolva (OPENAI_API_KEY hiányzik). Addig használd a sablonos képet egy meglévő fotóval (compose_ad_image) – az ingyenes.",
    );
  }
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1", prompt, size, n: 1 }),
  });
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[]; error?: { message: string } };
  if (!res.ok || json.error) throw new Error(`OpenAI képgenerálás hiba: ${json.error?.message ?? res.statusText}`);
  const item = json.data?.[0];
  let bytes: Buffer;
  if (item?.b64_json) bytes = Buffer.from(item.b64_json, "base64");
  else if (item?.url) bytes = Buffer.from(await (await fetch(item.url)).arrayBuffer());
  else throw new Error("Az OpenAI nem adott vissza képet.");
  return saveMedia(bytes, "image/png", { kind: "generated", prompt, accountId });
}
