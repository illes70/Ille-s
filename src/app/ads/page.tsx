"use client";

import { useMemo, useState } from "react";
import type { Ad, Settings } from "@/lib/types";
import { fmtMoney, fmtNum } from "@/lib/format";
import { AdCard, adHealth } from "@/components/AdCard";
import { Page, PageHeader } from "@/components/PageHeader";
import { ScanButton } from "@/components/ScanButton";
import { usePoll } from "@/components/usePoll";

const FILTERS = [
  { id: "all", label: "Mind" },
  { id: "ACTIVE", label: "Aktív" },
  { id: "attention", label: "Figyelmet kér" },
  { id: "PAUSED", label: "Szünetel" },
] as const;

const SORTS = [
  { id: "spend", label: "Költés" },
  { id: "cpl", label: "CPL" },
  { id: "leads", label: "Lead" },
  { id: "frequency", label: "Frequency" },
] as const;

export default function AdsPage() {
  const data = usePoll<{ mode: string; ads: Ad[]; error?: string }>("/api/ads", 30_000);
  const settings = usePoll<Settings>("/api/settings", 60_000);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("spend");

  const ads = useMemo(() => {
    if (!data?.ads || !settings) return [];
    const list = data.ads.filter((a) => {
      if (filter === "all") return true;
      if (filter === "attention") {
        const h = adHealth(a, settings.targetCpl, settings.autopilot.frequencyLimit);
        return h.tone === "bad" || h.tone === "warn";
      }
      return a.status === filter;
    });
    const v = (a: Ad) => (sort === "cpl" ? (a.metrics.cpl ?? Infinity) : a.metrics[sort]);
    return list.sort((a, b) => (sort === "cpl" ? v(a) - v(b) : v(b) - v(a)));
  }, [data, settings, filter, sort]);

  const totals = useMemo(() => {
    const all = data?.ads ?? [];
    const spend = all.reduce((s, a) => s + a.metrics.spend, 0);
    const leads = all.reduce((s, a) => s + a.metrics.leads, 0);
    const active = all.filter((a) => a.status === "ACTIVE");
    const freq = active.length ? active.reduce((s, a) => s + a.metrics.frequency, 0) / active.length : 0;
    return { spend, leads, cpl: leads ? spend / leads : null, active: active.length, freq };
  }, [data]);

  const cur = settings?.currency ?? "HUF";

  return (
    <Page>
      <PageHeader title="Hirdetések" sub="Élő kép az összes hirdetésről – utolsó 7 nap." right={<ScanButton label="Átvizsgálás most" />} />

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Költés" value={fmtMoney(totals.spend, cur)} />
        <Kpi label="Lead" value={fmtNum(totals.leads)} />
        <Kpi
          label="Átlag CPL"
          value={totals.cpl === null ? "–" : fmtMoney(totals.cpl, cur)}
          hint={settings ? `cél: ${fmtMoney(settings.targetCpl, cur)}` : undefined}
          tone={totals.cpl !== null && settings ? (totals.cpl <= settings.targetCpl ? "good" : "bad") : undefined}
        />
        <Kpi label="Aktív hirdetés" value={fmtNum(totals.active)} />
        <Kpi label="Átlag frequency" value={totals.freq.toFixed(2)} />
      </section>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${filter === f.id ? "bg-surface text-fg shadow-sm" : "text-muted"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Rendezés
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-fg"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {data?.error && <p className="card mb-4 p-4 text-sm text-bad">{data.error}</p>}
      {!data ? (
        <p className="text-sm text-muted">Betöltés…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {settings &&
            ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} currency={cur} targetCpl={settings.targetCpl} freqLimit={settings.autopilot.frequencyLimit} />
            ))}
        </div>
      )}
    </Page>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold tracking-tight ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
