"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";
import type { AccountSummary, AdAccount, SyncState } from "@/lib/types";
import { fmtMoney, fmtNum } from "@/lib/format";
import { Page } from "@/components/PageHeader";
import { LiveNumber } from "@/components/live/LiveNumber";
import { FacebookIcon } from "@/components/FacebookIcon";
import { refreshAll, usePoll, usePollWithRefresh } from "@/components/usePoll";

interface Pending {
  id: string;
  name: string;
  businessId: string;
  businessName: string;
}

interface OverviewResponse {
  mode: "demo" | "meta";
  rows: { account: AdAccount; summary: AccountSummary }[];
  fetchedAt: string;
  sync: SyncState;
  pending?: Pending[];
  error?: string;
}

const COLORS = ["#2563eb", "#059669", "#d97706", "#db2777", "#7c3aed", "#0891b2"];
const hue = (id: string) => COLORS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % COLORS.length];
const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export default function OverviewPage() {
  const router = useRouter();
  const [data, reload] = usePollWithRefresh<OverviewResponse>("/api/overview");
  const conn = usePoll<{ connected: boolean; appConfigured: boolean }>("/api/connection");
  const [sync, setSync] = useState<SyncState | null>(null);
  const [q, setQ] = useState("");
  const [flag, setFlag] = useState<"connected" | "welcome" | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("connected")) setFlag("connected");
    else if (p.has("welcome")) setFlag("welcome");
    if (p.size) window.history.replaceState(null, "", "/overview");
    const onSync = (e: Event) => setSync((e as CustomEvent<SyncState>).detail);
    window.addEventListener("ocp:sync", onSync);
    return () => window.removeEventListener("ocp:sync", onSync);
  }, []);

  const s = sync ?? data?.sync;
  const rows = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => !q || r.account.name.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.summary.today.spend - a.summary.today.spend || b.summary.last7.spend - a.summary.last7.spend),
    [data, q],
  );
  const sum = (k: "today" | "last7", f: "spend" | "leads") => (data?.rows ?? []).reduce((acc, r) => acc + r.summary[k][f], 0);
  const cur = data?.rows[0]?.account.currency ?? "HUF";
  const money = (n: number) => fmtMoney(n, cur);
  const tSpend = sum("today", "spend"), tLeads = sum("today", "leads"), wSpend = sum("last7", "spend"), wLeads = sum("last7", "leads");

  async function open(acc: AdAccount) {
    setOpening(acc.id);
    await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: acc.id }) });
    refreshAll();
    router.push("/ads");
  }

  return (
    <Page>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Áttekintés</h1>
          <p className="mt-1 text-sm text-muted">
            {data ? `${data.rows.length} hirdetési fiók · élőben` : "Betöltés…"}
            {data?.mode === "demo" && " · demó adatok"}
          </p>
        </div>
        {data?.mode === "meta" && (
          <button
            onClick={() => fetch("/api/sync", { method: "POST" }).then(() => reload())}
            disabled={s?.running}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-medium text-muted hover:text-fg disabled:opacity-60"
          >
            <RefreshCw size={14} className={s?.running ? "animate-spin" : ""} /> Teljes újraszinkron
          </button>
        )}
      </header>

      {flag === "connected" && (
        <p className="fade-in mb-5 flex items-center gap-2 rounded-xl bg-good-soft px-4 py-3 text-sm text-good">
          <CheckCircle2 size={16} /> Facebook csatlakoztatva – minden fiókod itt van, a hirdetések és képek most töltődnek.
        </p>
      )}

      {conn && !conn.connected && (
        <section className="card fade-in mb-8 overflow-hidden">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{flag === "welcome" ? "Üdv az OCP-ben! Egy lépés van hátra." : "Csatlakoztasd a Facebook-fiókodat"}</h2>
              <p className="mt-2 max-w-xl text-[14px] text-muted">
                Egy kattintás: bejelentkezel a Facebookkal, és az összes hirdetési fiókod – számokkal, hirdetésekkel, képekkel – másodpercek alatt itt lesz, élőben. Addig demó adatokat látsz.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <a
                href="/api/auth/meta/start"
                className={`inline-flex items-center gap-2 rounded-xl bg-[#1877f2] px-6 py-3 text-[15px] font-semibold text-white shadow-lg shadow-[#1877f2]/25 ${conn.appConfigured ? "" : "pointer-events-none opacity-50"}`}
              >
                <FacebookIcon size={20} /> Csatlakozás Facebookkal
              </a>
              {!conn.appConfigured && (
                <a href="/settings" className="text-xs text-warn underline">
                  Előbb egy Meta app kell – lépések a Beállításokban
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {s?.running && (
        <div className="card fade-in mb-6 p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-[13px]">
            <span className="flex items-center gap-2 font-medium">
              <Loader2 size={14} className="animate-spin text-accent" /> Hirdetések és képek betöltése{s.current ? ` – ${s.current}` : "…"}
            </span>
            <span className="tabular text-muted">
              {s.done}/{s.total} fiók
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${s.total ? Math.max(4, (s.done / s.total) * 100) : 4}%` }} />
          </div>
        </div>
      )}

      {data?.error && <p className="card mb-4 p-4 text-sm text-bad">{data.error}</p>}

      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Költés ma" value={tSpend} format={money} accent />
        <Kpi label="Lead ma" value={tLeads} format={(n) => fmtNum(Math.round(n))} />
        <Kpi label="CPL ma" value={tLeads ? tSpend / tLeads : null} format={money} />
        <Kpi label="Költés 7 nap" value={wSpend} format={money} />
        <Kpi label="Lead 7 nap" value={wLeads} format={(n) => fmtNum(Math.round(n))} />
        <Kpi label="CPL 7 nap" value={wLeads ? wSpend / wLeads : null} format={money} />
      </section>

      {!!data?.pending?.length && <PendingAccounts items={data.pending} onDone={reload} />}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Fiókok</h2>
        {(data?.rows.length ?? 0) > 6 && (
          <label className="relative">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fiók keresése…" className="input w-56 py-1.5 pl-8" />
          </label>
        )}
      </div>

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-36 animate-pulse bg-surface-2/60" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ account, summary }) => {
            const cpl7 = summary.last7.leads ? summary.last7.spend / summary.last7.leads : null;
            const m = (n: number) => fmtMoney(n, account.currency);
            return (
              <button key={account.id} onClick={() => open(account)} className="card fade-in group p-4 text-left transition-shadow hover:shadow-lg">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white" style={{ background: hue(account.id) }}>
                    {initials(account.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{account.name}</p>
                    <p className="text-xs text-muted">{summary.activeAds} aktív hirdetés</p>
                  </div>
                  {opening === account.id ? (
                    <Loader2 size={15} className="animate-spin text-muted" />
                  ) : summary.activeAds > 0 ? (
                    <span className="live-dot size-2 rounded-full bg-good" title="Fut" />
                  ) : (
                    <span className="size-2 rounded-full bg-muted/40" title="Nincs aktív hirdetés" />
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-[13px]">
                  <Cell label="Ma" value={<LiveNumber value={summary.today.spend} format={m} />} />
                  <Cell label="Lead ma" value={<LiveNumber value={summary.today.leads} format={(n) => fmtNum(Math.round(n))} />} />
                  <Cell label="CPL 7 nap" value={cpl7 === null ? "–" : <LiveNumber value={cpl7} format={m} />} />
                </dl>
                <p className="mt-3 text-[11px] text-muted">
                  7 nap: {m(summary.last7.spend)} · {fmtNum(summary.last7.leads)} lead
                </p>
                {summary.error && <p className="mt-2 truncate text-[11px] text-warn">Részleges adat: {summary.error}</p>}
              </button>
            );
          })}
          {!rows.length && <p className="card p-5 text-sm text-muted">Nincs találat.</p>}
        </div>
      )}
    </Page>
  );
}

function Kpi(props: { label: string; value: number | null; format: (n: number) => string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${props.accent ? "border-accent/40 bg-gradient-to-br from-accent-soft to-surface" : ""}`}>
      <p className="text-xs text-muted">{props.label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{props.value === null ? "–" : <LiveNumber value={props.value} format={props.format} />}</p>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}

/** Client accounts that sit in a Business Manager but aren't assigned to the user yet. */
function PendingAccounts({ items, onDone }: { items: Pending[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, { error: string; link?: string }>>({});

  async function claim(p: Pending) {
    setBusy(p.id);
    const res = await fetch("/api/accounts/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    if (!res.ok) {
      const body = (await res.json()) as { error: string; link?: string };
      setErrors((e) => ({ ...e, [p.id]: body }));
    }
    setBusy(null);
    onDone();
  }

  async function recheck() {
    setBusy("all");
    await fetch("/api/accounts/claim", { method: "PUT" });
    setBusy(null);
    onDone();
  }

  return (
    <section className="card fade-in mb-8 border-warn/40 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Hozzáférés kell ({items.length})</h2>
          <p className="text-[13px] text-muted">Ezeket a fiókokat a Business Managereden keresztül látod, de még nem vagy hozzájuk rendelve.</p>
        </div>
        <button onClick={recheck} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-fg disabled:opacity-60">
          <RefreshCw size={13} className={busy === "all" ? "animate-spin" : ""} /> Frissítés
        </button>
      </div>
      <ul className="divide-y divide-line">
        {items.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted">{p.businessName}</p>
              {errors[p.id] && (
                <p className="mt-1 text-xs text-warn">
                  {errors[p.id].error.split("\n")[0]}{" "}
                  {errors[p.id].link && (
                    <a href={errors[p.id].link} target="_blank" rel="noreferrer" className="font-medium underline">
                      Megnyitás a Business Managerben
                    </a>
                  )}
                </p>
              )}
            </div>
            <button onClick={() => claim(p)} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-60">
              {busy === p.id && <Loader2 size={12} className="animate-spin" />} Hozzáférés beállítása
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
