"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Ad } from "@/lib/types";
import { CreativePreview } from "./AdCard";

const FORMATS = [
  { id: "image", label: "Kép" },
  { id: "feed", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "story", label: "Story" },
  { id: "reels", label: "Reels" },
] as const;

type Format = (typeof FORMATS)[number]["id"];

/** The creative itself, or Meta's own placement preview of the live ad. */
export function AdPreview({ ad }: { ad: Ad }) {
  const [format, setFormat] = useState<Format>("image");
  const [state, setState] = useState<{ src?: string; demo?: boolean; error?: string; loading?: boolean }>({});

  useEffect(() => {
    if (format === "image") return;
    setState({ loading: true });
    fetch(`/api/ads/${ad.id}/preview?format=${format}`)
      .then((r) => r.json())
      .then((j: { src?: string; demo?: boolean; error?: string }) => setState(j))
      .catch(() => setState({ error: "Az előnézet nem tölthető be." }));
  }, [ad.id, format]);

  const tall = format === "story" || format === "reels";
  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFormat(f.id)}
            className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium ${format === f.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {format === "image" ? (
        <CreativePreview ad={ad} large className="rounded-2xl" />
      ) : state.loading ? (
        <div className={`grid place-items-center rounded-2xl border border-line bg-surface ${tall ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
          <Loader2 size={18} className="animate-spin text-muted" />
        </div>
      ) : state.src ? (
        <iframe src={state.src} title="Meta előnézet" className={`w-full rounded-2xl border border-line bg-white ${tall ? "aspect-[9/16]" : "aspect-[4/5]"}`} />
      ) : state.demo ? (
        <MockPreview ad={ad} tall={tall} />
      ) : (
        <p className="rounded-2xl border border-line p-4 text-[13px] text-muted">{state.error ?? "Nincs előnézet."}</p>
      )}
    </div>
  );
}

/** Demo mode: a simple feed/story mock (live accounts use Meta's real preview). */
function MockPreview({ ad, tall }: { ad: Ad; tall: boolean }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-white text-black ${tall ? "relative aspect-[9/16]" : ""}`}>
      {tall ? (
        <>
          <CreativePreview ad={ad} className="absolute inset-0 h-full" />
          {/* the placeholder already shows headline + button; overlay only real images */}
          {ad.creative.imageUrl && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
            <p className="text-sm font-semibold">{ad.creative.headline}</p>
            <span className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">{ad.creative.cta}</span>
          </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 p-3">
            <span className="size-8 rounded-full bg-gray-300" />
            <div>
              <p className="text-[13px] font-semibold">Cég neve</p>
              <p className="text-[11px] text-gray-500">Hirdetés</p>
            </div>
          </div>
          <p className="line-clamp-3 px-3 pb-2 text-[13px]">{ad.creative.primaryText}</p>
          <CreativePreview ad={ad} />
          <div className="flex items-center justify-between gap-2 bg-gray-100 p-3">
            <p className="truncate text-[13px] font-semibold">{ad.creative.headline}</p>
            <span className="shrink-0 rounded-md bg-gray-300 px-3 py-1.5 text-xs font-semibold">{ad.creative.cta}</span>
          </div>
        </>
      )}
      <p className="bg-surface-2 px-3 py-1.5 text-center text-[10px] text-muted">Demó előnézet – élő fióknál a Meta saját előnézete jelenik meg</p>
    </div>
  );
}
