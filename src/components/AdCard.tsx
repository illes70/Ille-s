import type { Ad } from "@/lib/types";
import type { Totals } from "@/lib/analytics";
import { fmtMoney, fmtNum } from "@/lib/format";

type Tone = "good" | "warn" | "bad" | "muted" | "info";
type Health = { label: string; tone: Tone };

export function adHealth(ad: Ad, targetCpl: number, freqLimit: number): Health {
  const m = ad.metrics;
  if (ad.status === "PAUSED") return { label: "Szünetel", tone: "muted" };
  if (m.leads === 0 && m.spend >= targetCpl * 2) return { label: "Költ, nem hoz", tone: "bad" };
  if (m.frequency >= freqLimit) return { label: "Kifáradt", tone: "warn" };
  if (m.cpl !== null && m.cpl <= targetCpl * 0.75) return { label: "Nyerő", tone: "good" };
  if (m.cpl !== null && m.cpl > targetCpl * 1.3) return { label: "Drága", tone: "warn" };
  if (m.spend === 0) return { label: "Indul", tone: "info" };
  return { label: "Rendben", tone: "good" };
}

export const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  muted: "bg-surface-2 text-muted",
  info: "bg-accent-soft text-accent",
};

export const LEARNING: Record<NonNullable<Ad["adsetLearning"]>, Health> = {
  LEARNING: { label: "Tanulási fázis", tone: "info" },
  SUCCESS: { label: "Stabil", tone: "good" },
  FAIL: { label: "Kevés eredmény", tone: "warn" },
};

export function Badge({ h, className = "" }: { h: Health; className?: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${TONE[h.tone]} ${className}`}>{h.label}</span>;
}

export function CreativePreview({ ad, className = "", large = false }: { ad: Ad; className?: string; large?: boolean }) {
  const [a, b] = ad.creative.palette ?? ["#334155", "#0f172a"];
  return (
    <div className={`relative overflow-hidden ${large ? "aspect-[4/5]" : "aspect-square"} ${className}`}>
      {ad.creative.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.creative.imageUrl} alt={ad.creative.headline} className="size-full object-cover" loading="lazy" />
      ) : (
        <div
          className={`flex size-full flex-col justify-end text-white ${large ? "p-8" : "p-5"}`}
          style={{ background: `radial-gradient(120% 90% at 20% 10%, ${a} 0%, ${b} 70%)` }}
        >
          <p className={`font-semibold leading-tight tracking-tight [text-wrap:balance] ${large ? "text-3xl" : "text-xl"}`}>
            {ad.creative.headline}
          </p>
          <span className="mt-4 w-fit rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-black">{ad.creative.cta}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  ad: Ad;
  t: Totals;
  targetCpl: number;
  freqLimit: number;
  currency: string;
  onOpen: () => void;
}

export function AdCard({ ad, t, targetCpl, freqLimit, currency, onOpen }: Props) {
  const h = adHealth(ad, targetCpl, freqLimit);
  const last14 = ad.daily.slice(-14);
  const max = Math.max(...last14.map((d) => d.spend), 1);
  return (
    <button onClick={onOpen} className="card group flex flex-col overflow-hidden text-left transition-shadow hover:shadow-lg">
      <div className="relative">
        <CreativePreview ad={ad} className="transition-transform duration-300 group-hover:scale-[1.015]" />
        <Badge h={h} className="absolute top-3 left-3 backdrop-blur" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{ad.name}</h3>
          <p className="truncate text-xs text-muted">{ad.creative.headline}</p>
        </div>
        <dl className="tabular grid grid-cols-3 gap-x-2 gap-y-3 border-t border-line pt-3 text-[13px]">
          <Stat label="Költés" value={fmtMoney(t.spend, currency)} />
          <Stat label="Lead" value={fmtNum(t.leads)} />
          <Stat
            label="CPL"
            value={t.cpl === null ? "–" : fmtMoney(t.cpl, currency)}
            tone={t.cpl === null ? undefined : t.cpl <= targetCpl ? "good" : "bad"}
          />
          <Stat label="CTR" value={`${t.ctr.toFixed(2)}%`} />
          <Stat label="CPM" value={fmtMoney(t.cpm, currency)} />
          <Stat label="Freq. (7n)" value={ad.metrics.frequency.toFixed(1)} tone={ad.metrics.frequency >= freqLimit ? "bad" : undefined} />
        </dl>
        <div className="mt-auto flex h-7 items-end gap-[2px] pt-1" aria-label="Napi költés, utolsó 14 nap">
          {last14.map((d) => (
            <span key={d.date} className="flex-1 rounded-t-[3px] bg-accent/60" style={{ height: `${Math.max(d.spend ? 8 : 0, (d.spend / max) * 100)}%` }} />
          ))}
        </div>
      </div>
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`truncate font-medium ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</dd>
    </div>
  );
}
