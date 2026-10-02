import type { Ad } from "@/lib/types";
import { fmtMoney, fmtNum } from "@/lib/format";

type Health = { label: string; tone: "good" | "warn" | "bad" | "muted" };

export function adHealth(ad: Ad, targetCpl: number, freqLimit: number): Health {
  const m = ad.metrics;
  if (ad.status === "PAUSED") return { label: "Szünetel", tone: "muted" };
  if (m.leads === 0 && m.spend >= targetCpl * 2) return { label: "Költ, nem hoz", tone: "bad" };
  if (m.frequency >= freqLimit) return { label: "Kifáradt", tone: "warn" };
  if (m.cpl !== null && m.cpl <= targetCpl * 0.75) return { label: "Nyerő", tone: "good" };
  if (m.cpl !== null && m.cpl > targetCpl * 1.3) return { label: "Drága", tone: "warn" };
  if (m.spend === 0) return { label: "Tanul", tone: "muted" };
  return { label: "Rendben", tone: "good" };
}

const TONE: Record<Health["tone"], string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  muted: "bg-surface-2 text-muted",
};

export function CreativePreview({ ad, className = "" }: { ad: Ad; className?: string }) {
  const [a, b] = ad.creative.palette ?? ["#334155", "#0f172a"];
  return (
    <div className={`relative aspect-[4/5] overflow-hidden ${className}`}>
      {ad.creative.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.creative.imageUrl} alt={ad.creative.headline} className="size-full object-cover" loading="lazy" />
      ) : (
        <div
          className="flex size-full flex-col justify-end p-5 text-white"
          style={{ background: `radial-gradient(120% 90% at 20% 10%, ${a} 0%, ${b} 70%)` }}
        >
          <p className="text-[22px] font-semibold leading-tight tracking-tight [text-wrap:balance]">
            {ad.creative.headline}
          </p>
          <span className="mt-4 w-fit rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-black">
            {ad.creative.cta}
          </span>
        </div>
      )}
    </div>
  );
}

export function AdCard({ ad, targetCpl, freqLimit, currency }: { ad: Ad; targetCpl: number; freqLimit: number; currency: string }) {
  const m = ad.metrics;
  const h = adHealth(ad, targetCpl, freqLimit);
  const max = Math.max(...ad.spendTrend, 1);
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative">
        <CreativePreview ad={ad} />
        <span className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur ${TONE[h.tone]}`}>
          {h.label}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="truncate text-sm font-semibold">{ad.name}</h3>
          <p className="truncate text-xs text-muted">
            {ad.campaignName} · {ad.adsetName}
          </p>
        </div>
        <p className="line-clamp-2 text-[13px] text-muted">{ad.creative.primaryText}</p>
        <dl className="tabular grid grid-cols-3 gap-x-2 gap-y-3 border-t border-line pt-3 text-[13px]">
          <Stat label="Költés" value={fmtMoney(m.spend, currency)} />
          <Stat label="Lead" value={fmtNum(m.leads)} />
          <Stat
            label="CPL"
            value={m.cpl === null ? "–" : fmtMoney(m.cpl, currency)}
            tone={m.cpl === null ? undefined : m.cpl <= targetCpl ? "good" : "bad"}
          />
          <Stat label="Frequency" value={m.frequency.toFixed(2)} tone={m.frequency >= freqLimit ? "bad" : undefined} />
          <Stat label="CTR" value={`${m.ctr.toFixed(2)}%`} />
          <Stat label="CPM" value={fmtMoney(m.cpm, currency)} />
        </dl>
        <div className="mt-auto flex items-end gap-[3px] pt-1" aria-label="Napi költés, utolsó 7 nap">
          {ad.spendTrend.map((v, i) => (
            <span key={i} className="flex-1 rounded-sm bg-accent/70" style={{ height: `${Math.max(2, (v / max) * 28)}px` }} />
          ))}
        </div>
        <p className="text-[11px] text-muted">
          Napi büdzsé: {fmtMoney(ad.adsetDailyBudget, currency)} · utolsó 7 nap
        </p>
      </div>
    </article>
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
