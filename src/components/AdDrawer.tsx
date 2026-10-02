"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, MessageSquare, Pause, Play, X } from "lucide-react";
import { adsManagerUrl } from "@/lib/links";
import type { Ad } from "@/lib/types";
import { adTotals, series, type SeriesMetric } from "@/lib/analytics";
import { fmtMoney, fmtNum } from "@/lib/format";
import { Badge, CreativePreview, LEARNING, adHealth } from "./AdCard";
import { BarChart } from "./BarChart";
import { refreshAll } from "./usePoll";

const METRICS: { id: SeriesMetric; label: string }[] = [
  { id: "spend", label: "Költés" },
  { id: "leads", label: "Lead" },
  { id: "cpl", label: "CPL" },
  { id: "clicks", label: "Kattintás" },
];

interface Props {
  ad: Ad;
  from: string;
  rangeLabel: string;
  currency: string;
  targetCpl: number;
  freqLimit: number;
  onClose: () => void;
}

export function AdDrawer({ ad, from, rangeLabel, currency, targetCpl, freqLimit, onClose }: Props) {
  const [metric, setMetric] = useState<SeriesMetric>("spend");
  const [busy, setBusy] = useState(false);
  const t = adTotals(ad, from);
  const money = (n: number) => fmtMoney(n, currency);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggle() {
    setBusy(true);
    await fetch(`/api/ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: ad.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }),
    });
    setBusy(false);
    refreshAll();
  }

  const ask = encodeURIComponent(`Nézd meg a(z) „${ad.name}” hirdetést (${ad.id}): hogyan megy, és mit csinálnál vele?`);
  const fmt = metric === "spend" || metric === "cpl" ? money : (n: number) => fmtNum(n);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[880px] flex-col overflow-y-auto bg-bg shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-5 py-3 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{ad.name}</p>
            <p className="truncate text-xs text-muted">
              {ad.campaignName} · {ad.adsetName}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Bezárás">
            <X size={18} />
          </button>
        </header>

        <div className="grid gap-6 p-5 md:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <CreativePreview ad={ad} large className="rounded-2xl" />
            <div className="card space-y-2 p-4 text-[13px]">
              <p className="font-semibold">{ad.creative.headline}</p>
              <p className="whitespace-pre-wrap text-muted">{ad.creative.primaryText}</p>
              <p className="text-xs">
                Gomb: <span className="font-medium">{ad.creative.cta}</span>
              </p>
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge h={adHealth(ad, targetCpl, freqLimit)} />
              {ad.adsetLearning && <Badge h={LEARNING[ad.adsetLearning]} />}
              <span className="text-xs text-muted">Napi keret: {money(ad.adsetDailyBudget)}</span>
            </div>

            <div>
              <p className="mb-2 text-xs text-muted">{rangeLabel}</p>
              <dl className="tabular grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Big label="Költés" value={money(t.spend)} />
                <Big label="Lead" value={fmtNum(t.leads)} />
                <Big label="CPL" value={t.cpl === null ? "–" : money(t.cpl)} tone={t.cpl === null ? undefined : t.cpl <= targetCpl ? "good" : "bad"} />
                <Big label="CTR" value={`${t.ctr.toFixed(2)}%`} />
                <Big label="Megjelenés" value={fmtNum(t.impressions)} />
                <Big label="Kattintás" value={fmtNum(t.clicks)} />
                <Big label="CPM" value={money(t.cpm)} />
                <Big label="Frequency (7 nap)" value={ad.metrics.frequency.toFixed(2)} tone={ad.metrics.frequency >= freqLimit ? "bad" : undefined} />
              </dl>
            </div>

            <div className="card p-4">
              <div className="mb-4 flex gap-1">
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMetric(m.id)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${metric === m.id ? "bg-accent-soft text-accent" : "text-muted hover:text-fg"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <BarChart points={series([ad], from, "day", metric)} format={fmt} height={180} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={toggle}
                disabled={busy}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                  ad.status === "ACTIVE" ? "border border-line bg-surface text-fg hover:border-bad/50" : "bg-good text-white"
                }`}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : ad.status === "ACTIVE" ? <Pause size={15} /> : <Play size={15} />}
                {ad.status === "ACTIVE" ? "Leállítás" : "Indítás"}
              </button>
              <Link href={`/?q=${ask}`} className="inline-flex items-center gap-2 rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg">
                <MessageSquare size={15} /> Kérdezd az asszisztenst
              </Link>
              {!ad.accountId.startsWith("act_demo") && (
                <a
                  href={adsManagerUrl(ad.accountId, ad.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:text-fg"
                >
                  <ExternalLink size={15} /> Ads Manager
                </a>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="card px-3 py-2.5">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`mt-0.5 truncate font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</dd>
    </div>
  );
}
