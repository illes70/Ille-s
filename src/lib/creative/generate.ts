import "server-only";
import { createHash } from "crypto";
import type { MediaItem } from "../types";
import { loadImage, saveMedia } from "./media";
import { readStore, settingsWithDefaults } from "../store";

// AI photos from several providers, picked by quality tier and price:
//   free     – Cloudflare Workers AI (FLUX): free daily allocation, good for drafts and backgrounds
//   standard – Google Gemini image ("Nano Banana", ~$0.04) – strong, can edit a real photo
//   pro      – OpenAI GPT Image, high quality (the ChatGPT image model, ~$0.2) or a Gemini pro model
// The exact text on ads never comes from these: compose_ad_image puts it on for free.
// The same request twice is served from the media library (no second bill).

export type ImageTier = "free" | "standard" | "pro";
export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

interface GenInput {
  prompt: string;
  size: ImageSize;
  /** a photo to edit / use as reference (only providers that support it) */
  reference?: { bytes: Buffer; mime: string };
}
interface Provider {
  id: string;
  label: string;
  tier: ImageTier;
  enabled: () => boolean;
  canEdit: boolean;
  /** estimated list price of one image, USD */
  cost: () => number;
  model: () => string;
  run: (i: GenInput) => Promise<{ bytes: Buffer; mime: string }>;
}

const aspect = (size: ImageSize) => (size === "1024x1536" ? "4:5" : size === "1536x1024" ? "16:9" : "1:1");

async function failText(res: Response) {
  const t = await res.text().catch(() => "");
  try {
    const j = JSON.parse(t) as { error?: { message?: string } | string; errors?: { message?: string }[] };
    return typeof j.error === "string" ? j.error : (j.error?.message ?? j.errors?.[0]?.message ?? t.slice(0, 200));
  } catch {
    return t.slice(0, 200) || res.statusText;
  }
}

const cloudflare: Provider = {
  id: "cloudflare",
  label: "FLUX (Cloudflare, ingyenes keret)",
  tier: "free",
  canEdit: false,
  enabled: () => !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN),
  cost: () => 0,
  model: () => process.env.CF_IMAGE_MODEL ?? "@cf/black-forest-labs/flux-1-schnell",
  async run({ prompt }) {
    const res = await fetch(`${process.env.CF_API_BASE ?? "https://api.cloudflare.com"}/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${cloudflare.model()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, steps: 8 }),
    });
    if (!res.ok) throw new Error(`Cloudflare: ${await failText(res)}`);
    const json = (await res.json()) as { result?: { image?: string } };
    if (!json.result?.image) throw new Error("Cloudflare: nem jött kép.");
    return { bytes: Buffer.from(json.result.image, "base64"), mime: "image/jpeg" };
  },
};

function gemini(tier: "standard" | "pro"): Provider {
  const model = () => (tier === "pro" ? process.env.GEMINI_IMAGE_PRO_MODEL : undefined) ?? process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
  return {
    id: tier === "pro" ? "gemini-pro" : "gemini",
    label: tier === "pro" ? "Gemini (pro képmodell)" : "Gemini „Nano Banana”",
    tier,
    canEdit: true,
    enabled: () => !!process.env.GEMINI_API_KEY && (tier === "standard" || !!process.env.GEMINI_IMAGE_PRO_MODEL),
    cost: () => (tier === "pro" ? 0.134 : 0.039),
    model,
    async run({ prompt, size, reference }) {
      const parts: Record<string, unknown>[] = [];
      if (reference) parts.push({ inlineData: { mimeType: reference.mime, data: reference.bytes.toString("base64") } });
      parts.push({ text: reference ? `Edit this photo: ${prompt}` : prompt });
      const call = (withAspect: boolean) =>
        fetch(`${process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${model()}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["IMAGE"], ...(withAspect ? { imageConfig: { aspectRatio: aspect(size) } } : {}) },
          }),
        });
      let res = await call(true);
      // older image models don't take an aspect ratio
      if (res.status === 400) res = await call(false);
      if (!res.ok) throw new Error(`Gemini: ${await failText(res)}`);
      const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[] };
      const img = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
      if (!img) throw new Error("Gemini: nem jött kép (lehet, hogy a kérés tartalmi szűrőbe ütközött – fogalmazd át).");
      return { bytes: Buffer.from(img.data, "base64"), mime: img.mimeType };
    },
  };
}

function openai(tier: "standard" | "pro"): Provider {
  const quality = tier === "pro" ? "high" : "medium";
  return {
    id: tier === "pro" ? "openai-pro" : "openai",
    label: `OpenAI GPT Image (${quality === "high" ? "magas" : "közepes"} minőség – a ChatGPT képmodellje)`,
    tier,
    canEdit: false,
    enabled: () => !!process.env.OPENAI_API_KEY,
    cost: () => (quality === "high" ? 0.21 : 0.053),
    model: () => process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
    async run({ prompt, size }) {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model(), prompt, size, quality, n: 1 }),
      });
      if (!res.ok) throw new Error(`OpenAI: ${await failText(res)}`);
      const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
      const item = json.data?.[0];
      if (item?.b64_json) return { bytes: Buffer.from(item.b64_json, "base64"), mime: "image/png" };
      if (item?.url) return { bytes: Buffer.from(await (await fetch(item.url)).arrayBuffer()), mime: "image/png" };
      throw new Error("OpenAI: nem jött kép.");
    },
  };
}

// best first within a tier
const PROVIDERS: Provider[] = [openai("pro"), gemini("pro"), gemini("standard"), openai("standard"), cloudflare];

export const imageGenEnabled = () => PROVIDERS.some((p) => p.enabled());

export function imageProviders() {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, tier: p.tier, enabled: p.enabled(), costUsd: p.cost(), canEdit: p.canEdit }));
}

/** The provider for a wanted tier: that tier if configured, else the nearest one (cheaper first). */
function pick(tier: ImageTier, needsEdit: boolean): Provider | undefined {
  const order: ImageTier[] = tier === "pro" ? ["pro", "standard", "free"] : tier === "standard" ? ["standard", "free", "pro"] : ["free", "standard", "pro"];
  for (const t of order) {
    const p = PROVIDERS.find((x) => x.tier === t && x.enabled() && (!needsEdit || x.canEdit));
    if (p) return p;
  }
  return needsEdit ? pick(tier, false) : undefined;
}

export async function generatePhoto(
  prompt: string,
  size: ImageSize,
  opts: { accountId?: string; tier?: ImageTier; referenceUrl?: string } = {},
): Promise<MediaItem & { provider: string; costUsd: number; reused?: boolean }> {
  const { effectiveAi, recordImage } = await import("../ai-usage");
  const ai = await effectiveAi();
  const settings = settingsWithDefaults((await readStore()).settings);
  let tier: ImageTier = opts.tier ?? settings.ai.imageTier;
  // saver mode (chosen, or forced by the monthly limit): free provider first
  if (ai.mode === "saver") tier = "free";

  const provider = pick(tier, !!opts.referenceUrl);
  if (!provider) {
    throw new Error(
      "Nincs bekapcsolva AI képgenerálás. Ingyenes: Cloudflare (CF_ACCOUNT_ID + CF_API_TOKEN). Erős: Gemini (GEMINI_API_KEY) vagy OpenAI (OPENAI_API_KEY). Addig a sablonos kép egy meglévő fotóval ingyen működik (compose_ad_image).",
    );
  }
  if (ai.blocked && provider.cost() > 0) throw new Error("A havi AI-keret elfogyott – ingyenes képgeneráló (Cloudflare) nincs beállítva. A Beállításokban emelheted a keretet.");

  const genKey = createHash("sha256").update(JSON.stringify([provider.id, provider.model(), prompt, size, opts.referenceUrl ?? ""])).digest("hex").slice(0, 32);
  const existing = (await readStore()).media.find((m) => (m as MediaItem & { genKey?: string }).genKey === genKey);
  if (existing) return { ...existing, provider: provider.label, costUsd: 0, reused: true };

  const reference = opts.referenceUrl ? await loadImage(opts.referenceUrl) : undefined;
  const out = await provider.run({ prompt, size, reference: provider.canEdit ? reference : undefined });
  const item = await saveMedia(out.bytes, out.mime, { kind: "generated", prompt, accountId: opts.accountId });
  const { updateStore } = await import("../store");
  await updateStore((d) => {
    const m = d.media.find((x) => x.id === item.id) as (MediaItem & { genKey?: string; provider?: string }) | undefined;
    if (m) Object.assign(m, { genKey, provider: provider.id });
  });
  await recordImage(provider.cost());
  return { ...item, provider: provider.label, costUsd: provider.cost() };
}
