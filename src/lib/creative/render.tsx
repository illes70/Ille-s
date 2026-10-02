import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { ImageResponse } from "next/og";
import type { MediaItem } from "../types";
import { saveMedia, toDataUrl } from "./media";

// Ad images with exact, sharp text over a photo. Free (no AI image model), so prices
// and phone numbers are always spelled right – AI image models often garble text.

export type TemplateId = "green_box" | "headline_band" | "before_after";

export interface ComposeInput {
  template: TemplateId;
  /** background photo (OCP media URL or public URL); before_after uses photo + photo2 */
  photoUrl?: string;
  photo2Url?: string;
  brand?: string;
  service?: string;
  price?: string;
  priceNote?: string;
  headline?: string;
  subline?: string;
  cta?: string;
  bottomLine?: string;
  phone?: string;
  /** [light, dark] brand colors */
  colors?: [string, string];
  format?: "feed" | "square" | "story";
  accountId?: string;
}

const FONT = "Inter, InterExt";
const SIZES = { feed: [1080, 1350], square: [1080, 1080], story: [1080, 1920] } as const;

let fontCache: { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" }[] | null = null;
async function fonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "node_modules/@fontsource/inter/files");
  const load = async (subset: string, weight: 400 | 700 | 800) => ({
    // separate family for latin-ext so bold ő/ű are picked by weight, not by a 400 fallback
    name: subset === "latin" ? "Inter" : "InterExt",
    data: await fs.readFile(path.join(dir, `inter-${subset}-${weight}-normal.woff`)),
    weight,
    style: "normal" as const,
  });
  // latin + latin-ext: ő, ű and the other Hungarian letters
  fontCache = await Promise.all([load("latin", 400), load("latin", 700), load("latin", 800), load("latin-ext", 400), load("latin-ext", 700), load("latin-ext", 800)]);
  return fontCache;
}

export async function composeAdImage(input: ComposeInput): Promise<MediaItem> {
  const [w, h] = SIZES[input.format ?? "feed"];
  const [light, dark] = input.colors ?? ["#16a34a", "#14532d"];
  const photo = input.photoUrl ? await toDataUrl(input.photoUrl) : null;
  const photo2 = input.photo2Url ? await toDataUrl(input.photo2Url) : null;
  const bg = photo ? null : `linear-gradient(160deg, ${light} 0%, ${dark} 100%)`;

  const Photo = ({ src, style }: { src: string; style?: React.CSSProperties }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} width={w} height={h} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", ...style }} alt="" />
  );

  let body: React.ReactElement;
  if (input.template === "green_box") {
    const box = (children: React.ReactNode, style: React.CSSProperties = {}) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: dark, opacity: 0.95, color: "white", borderRadius: 14, padding: "18px 40px", textAlign: "center", ...style }}>
        {children}
      </div>
    );
    body = (
      <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", fontFamily: FONT, background: bg ?? "#111" }}>
        {photo && <Photo src={photo} />}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "56px 64px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            {input.brand && box(<span style={{ fontSize: 30, fontWeight: 700 }}>{input.brand}</span>, { padding: "10px 28px" })}
            {input.service && box(<span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{input.service}</span>, { maxWidth: 940 })}
            {input.price &&
              box(
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ fontSize: 88, fontWeight: 800, lineHeight: 1 }}>{input.price}</span>
                  {input.priceNote && <span style={{ fontSize: 30, fontWeight: 400, marginTop: 10 }}>{input.priceNote}</span>}
                </div>,
              )}
            {box(<span style={{ fontSize: 34, fontWeight: 700 }}>{input.cta ?? "Kattints a lenti linkre!"}</span>, { padding: "14px 32px" })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            {input.bottomLine && box(<span style={{ fontSize: 28, fontWeight: 400, lineHeight: 1.3 }}>{input.bottomLine}</span>, { maxWidth: 940 })}
            {input.phone && box(<span style={{ fontSize: 40, fontWeight: 800, letterSpacing: 1 }}>{input.phone}</span>, { padding: "12px 36px" })}
          </div>
        </div>
      </div>
    );
  } else if (input.template === "before_after") {
    const label = (t: string) => (
      <div style={{ display: "flex", position: "absolute", top: 28, left: 28, background: "rgba(0,0,0,0.65)", color: "white", fontSize: 30, fontWeight: 800, padding: "8px 20px", borderRadius: 999 }}>{t}</div>
    );
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: FONT, background: dark }}>
        <div style={{ display: "flex", flex: 1 }}>
          {[photo, photo2].map((src, i) => (
            <div key={i} style={{ display: "flex", position: "relative", width: "50%", height: "100%", overflow: "hidden", background: i ? light : dark }}>
              {src && <Photo src={src} />}
              {label(i ? "UTÁNA" : "ELŐTTE")}
            </div>
          ))}
        </div>
        <Band light={light} dark={dark} input={input} />
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", fontFamily: FONT, background: dark }}>
        <div style={{ display: "flex", position: "relative", flex: 1, background: bg ?? dark, overflow: "hidden" }}>{photo && <Photo src={photo} />}</div>
        <Band light={light} dark={dark} input={input} />
      </div>
    );
  }

  const res = new ImageResponse(body, { width: w, height: h, fonts: await fonts() });
  const bytes = Buffer.from(await res.arrayBuffer());
  return saveMedia(bytes, "image/png", { kind: "composed", accountId: input.accountId, prompt: `${input.template}: ${input.headline ?? input.service ?? ""}` });
}

function Band({ light, dark, input }: { light: string; dark: string; input: ComposeInput }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: dark, color: "white", padding: "44px 56px 52px", gap: 14 }}>
      {input.brand && <span style={{ fontSize: 26, fontWeight: 700, color: light, textTransform: "uppercase", letterSpacing: 2 }}>{input.brand}</span>}
      <span style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>{input.headline ?? input.service ?? ""}</span>
      {(input.subline || input.price) && <span style={{ fontSize: 34, fontWeight: 400, opacity: 0.9 }}>{input.subline ?? input.price}</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 10 }}>
        <span style={{ display: "flex", background: light, color: "white", fontSize: 32, fontWeight: 800, padding: "14px 30px", borderRadius: 999 }}>{input.cta ?? "Ajánlatot kérek"}</span>
        {input.phone && <span style={{ fontSize: 34, fontWeight: 700 }}>{input.phone}</span>}
      </div>
    </div>
  );
}
