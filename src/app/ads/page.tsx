"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Ad, AdAccount, Lead, Settings } from "@/lib/types";
import { RANGES, funnel, groupByAdset, rangeStart, series, totals, adTotals, type Grain, type RangeId, type SeriesMetric } from "@/lib/analytics";
import { fmtMoney, fmtNum } from "@/lib/format";
import { AdCard, Badge, LEARNING, adHealth } from "@/components/AdCard";
import { AdDrawer } from "@/components/AdDrawer";
import { BarChart } from "@/components/BarChart";
import { Funnel } from "@/components/Funnel";
import { Page } from "@/components/PageHeader";
import { LiveNumber } from "@/components/live/LiveNumber";
import { usePoll, usePollWithRefresh } from "@/components/usePoll";

interface AdsResponse {
  mode: string;
  account: AdAccount;
  ads: Ad[];
  fetchedAt: string;
  error?: string;
}

const METRICS: { id: SeriesMetric; label: string }[] = [
  { id: "spend", label: "Költés" },
  { id: "leads", label: "Leadek" },
  { id: "cpl", label: "Lead-költség" },
  { id: "clicks", label: "Kattintás" },
];

const GRAINS: { id: Grain; label: string }[] = [
  { id: "day", label: "Napi" },
  { id: "week", label: "Heti" },
  { id: "month", label: "Havi" },
];

export default function AdsPage() {
  const [data, reload] = usePollWithRefresh<AdsResponse>("/api/ads");
  const settings = usePoll<Settings>("/api/settings");
  const leads = usePoll<Lead[]>("/api/leads");

  const [range, setRange] = useState<RangeId>("30");
  const [campaign, setCampaign] = useState("all");
  const [adset, setAdset] = useState("all");
  const [status, setStatus] = useState<"all" | "ACTIVE" | "attention" | "PAUSED">("all");
  const [metric, setMetric] = useState<SeriesMetric>("spend");
  const [grain, setGrain] = useState<Grain>("day");
  const [view, setView] = useState<"groups" | "list">("groups");
  const [openId, setOpenId] = useState<string | null>(null);

  const from = rangeStart(range);
  const rangeLabel = RANGES.find((r) => r.id === range)!.label;
  const cur = data?.account.currency ?? settings?.currency ?? "HUF";
  const money = (n: number) => fmtMoney(n, cur);
  const target = settings?.targetCpl ?? 0;
  const freqLimit = settings?.autopilot.frequencyLimit ?? 99;

  // reset filters when the account changes
  const accountId = data?.account.id;
  useEffect(() => {
    setCampaign("all");
    setAdset("all");
  }, [accountId]);

  const allAds = data?.ads ?? [];
  const campaigns = uniq(allAds.map((a) => [a.campaignId, a.campaignName]));
  const adsets = uniq(allAds.filter((a) => campaign === "all" || a.campaignId === campaign).map((a) => [a.adsetId, a.adsetName]));

  const scoped = useMemo(
    () => allAds.filter((a) => (campaign === "all" || a.campaignId === campaign) && (adset === "all" || a.adsetId === adset)),
    [allAds, campaign, adset],
  );
  const visible = scoped.filter((a) => {
    if (status === "all") return true;
    if (status === "attention") return ["bad", "warn"].includes(adHealth(a, target, freqLimit).tone);
    return a.status === status;
  });

  const t = totals(scoped, from);
  const scopedIds = new Set(scoped.map((a) => a.id));
  const leadsInScope = (leads ?? []).filter((l) => l.createdAt.slice(0, 10) >= from && (!l.adId || scopedIds.has(l.adId)));
  const groups = groupByAdset(visible, from);
  const openAd = allAds.find((a) => a.id === openId);
  const metricFmt = metric === "spend" || metric === "cpl" ? money : (n: number) => fmtNum(n);

  return (
    <Page>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hirdetések</h1>
          <p className="mt-1 text-sm text-muted">{data?.account.name ?? "…"} · költés, leadek és minden kreatív egy helyen</p>
        </div>
        <Freshness at={data?.fetchedAt} onRefresh={reload} />
      </header>

      {/* Filters: one row above everything */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Select value={campaign} onChange={(v) => { setCampaign(v); setAdset("all"); }} all="Összes kampány" options={campaigns} />
        <Select value={adset} onChange={setAdset} all={`Összes hirdetéscsoport (${adsets.length})`} options={adsets} />
        <div className="ml-auto flex gap-1 rounded-xl bg-surface-2 p-1">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} className={seg(range === r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {data?.error && <p className="card mb-4 p-4 text-sm text-bad">{data.error}</p>}

      {/* KPIs */}
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Költés" value={t.spend} format={money} accent />
        <Kpi label="Leadek" value={t.leads} format={(n) => fmtNum(Math.round(n))} />
        <Kpi
          label="Lead-költség"
          value={t.cpl}
          format={money}
          hint={target ? `cél: ${money(target)}` : undefined}
          tone={t.cpl === null || !target ? undefined : t.cpl <= target ? "good" : "bad"}
        />
        <Kpi label="CTR" value={t.ctr} format={(n) => `${n.toFixed(2)}%`} hint={`${fmtNum(t.clicks)} kattintás`} />
        <Kpi label="CPM" value={t.cpm} format={money} hint={`${fmtNum(t.impressions)} megjelenés`} />
      </section>

      {/* Trend + funnel */}
      <section className="mb-10 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMetric(m.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${metric === m.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
              {GRAINS.map((g) => (
                <button key={g.id} onClick={() => setGrain(g.id)} className={seg(grain === g.id, true)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <BarChart points={series(scoped, from, grain, metric)} format={metricFmt} />
        </div>
        <div className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Tölcsér</h2>
          <p className="mb-4 text-xs text-muted">A leadek útja · {rangeLabel}</p>
          <Funnel stages={funnel(leadsInScope)} spend={t.spend} currency={cur} />
          {leadsInScope.length !== t.leads && (
            <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-[11px] text-warn">
              A Meta {fmtNum(t.leads)} leadet számolt, a leadlistában {fmtNum(leadsInScope.length)} van. A tölcsér a leadlistából számol
              {data?.mode === "demo" ? " (a demóban csak néhány minta-lead van)." : " – kösd be a lead webhookot, hogy minden lead beérkezzen."}
            </p>
          )}
          <p className="mt-3 text-[11px] text-muted">A státuszokat a Leadek oldalon vagy a chatben állíthatod.</p>
        </div>
      </section>

      {/* Creatives */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Kreatívok <span className="text-muted">({visible.length})</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
              {(
                [
                  ["all", "Mind"],
                  ["ACTIVE", "Aktív"],
                  ["attention", "Figyelmet kér"],
                  ["PAUSED", "Szünetel"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} onClick={() => setStatus(id)} className={seg(status === id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
              <button onClick={() => setView("groups")} className={seg(view === "groups")}>
                Csoportonként
              </button>
              <button onClick={() => setView("list")} className={seg(view === "list")}>
                Egy lista
              </button>
            </div>
          </div>
        </div>

        {!data ? (
          <p className="text-sm text-muted">Betöltés…</p>
        ) : view === "list" ? (
          <Grid>
            {[...visible]
              .sort((a, b) => adTotals(b, from).spend - adTotals(a, from).spend)
              .map((ad) => (
                <AdCard key={ad.id} ad={ad} t={adTotals(ad, from)} currency={cur} targetCpl={target} freqLimit={freqLimit} onOpen={() => setOpenId(ad.id)} />
              ))}
          </Grid>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <div key={g.adsetId}>
                <div className="card mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-semibold">{g.adsetName}</p>
                    <p className="text-xs text-muted">
                      {g.campaignName} · {g.ads.length} hirdetés
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!g.active ? <Badge h={{ label: "Szünetel", tone: "muted" }} /> : g.learning && <Badge h={LEARNING[g.learning]} />}
                    <span className="text-xs text-muted">Napi {money(g.dailyBudget)}</span>
                  </div>
                  <dl className="tabular flex gap-6 text-[13px]">
                    <Inline label="Költés" value={money(g.totals.spend)} />
                    <Inline label="Lead" value={fmtNum(g.totals.leads)} />
                    <Inline
                      label="CPL"
                      value={g.totals.cpl === null ? "–" : money(g.totals.cpl)}
                      tone={g.totals.cpl === null || !target ? undefined : g.totals.cpl <= target ? "good" : "bad"}
                    />
                  </dl>
                </div>
                <Grid>
                  {g.ads.map((ad) => (
                    <AdCard key={ad.id} ad={ad} t={adTotals(ad, from)} currency={cur} targetCpl={target} freqLimit={freqLimit} onOpen={() => setOpenId(ad.id)} />
                  ))}
                </Grid>
              </div>
            ))}
            {!groups.length && <p className="card p-5 text-sm text-muted">Nincs a szűrésnek megfelelő hirdetés.</p>}
          </div>
        )}
      </section>

      {openAd && (
        <AdDrawer
          ad={openAd}
          from={from}
          rangeLabel={rangeLabel}
          currency={cur}
          targetCpl={target}
          freqLimit={freqLimit}
          onClose={() => setOpenId(null)}
        />
      )}
    </Page>
  );
}

function uniq(pairs: string[][]): [string, string][] {
  return [...new Map(pairs.map(([id, name]) => [id, name])).entries()];
}

const seg = (on: boolean, small = false) =>
  `rounded-lg ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]"} font-medium transition-colors ${on ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`;

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{children}</div>;
}

function Select({ value, onChange, all, options }: { value: string; onChange: (v: string) => void; all: string; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2 text-[13px] sm:max-w-[260px] sm:flex-none ${value === "all" ? "border-line" : "border-accent text-accent"}`}
    >
      <option value="all">{all}</option>
      {options.map(([id, name]) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

function Kpi(props: { label: string; value: number | null; format: (n: number) => string; hint?: string; tone?: "good" | "bad"; accent?: boolean }) {
  const { label, value, format, hint, tone, accent } = props;
  return (
    <div className={`card p-4 ${accent ? "border-accent/40 bg-gradient-to-br from-accent-soft to-surface" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>
        {value === null ? "–" : <LiveNumber value={value} format={format} />}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Inline({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</dd>
    </div>
  );
}

function Freshness({ at, onRefresh }: { at?: string; onRefresh: () => void }) {
  const [, tick] = useState(0);
  const [spin, setSpin] = useState(false);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setSpin(false), [at]);
  const secs = at ? Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000)) : null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="live-dot size-2 rounded-full bg-good" />
      <span>{secs === null ? "Betöltés…" : secs < 5 ? "Élő · most frissült" : `Élő · Meta-adat ${secs < 120 ? `${secs} mp` : `${Math.round(secs / 60)} perc`}-e`}</span>
      <button
        onClick={() => {
          setSpin(true);
          fetch("/api/ads?fresh=1").finally(onRefresh);
        }}
        className="rounded-lg border border-line bg-surface p-1.5 hover:text-fg"
        aria-label="Frissítés"
      >
        <RefreshCw size={13} className={spin ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
