"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck, TriangleAlert, X, Zap } from "lucide-react";
import { refreshAll, usePollWithRefresh } from "./usePoll";

interface ConsentState {
  mode: "demo" | "meta";
  consent: { userName: string; at: string; pageIds: string[] } | null;
  pages: { id: string; name: string; live: boolean; consented: boolean }[];
}
interface PageResult {
  id: string;
  name: string;
  live: boolean;
  readable: boolean;
  forms: number;
  imported: number;
  problem?: string;
  fix?: { text: string; href: string };
}

function useConsent() {
  return usePollWithRefresh<ConsentState>("/api/leads/consent");
}

/** The question itself + the per-page result after "Igen". */
function ConsentBody({ state, onDone }: { state: ConsentState; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function yes() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/leads/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = (await res.json()) as { pages?: PageResult[]; error?: string };
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Hiba történt");
    setResults(json.pages ?? []);
    refreshAll();
  }

  if (results) {
    const imported = results.reduce((s, r) => s + r.imported, 0);
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-semibold text-good">
          <CheckCircle2 size={18} /> Kész – {imported} korábbi lead betöltve, az újak azonnal jönnek.
        </p>
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id} className="rounded-xl border border-line px-3 py-2.5 text-[13px]">
              <div className="flex items-center gap-2">
                {r.problem ? <TriangleAlert size={14} className="shrink-0 text-warn" /> : <CheckCircle2 size={14} className="shrink-0 text-good" />}
                <span className="font-medium">{r.name}</span>
                <span className="ml-auto text-xs text-muted">
                  {r.forms} űrlap · {r.imported} lead{r.live ? " · azonnali" : ""}
                </span>
              </div>
              {r.problem && (
                <div className="mt-1.5 space-y-1 pl-6 text-xs">
                  <p className="text-muted">{r.problem}</p>
                  {r.fix && (
                    <a href={r.fix.href} target={r.fix.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent">
                      {r.fix.text} {r.fix.href.startsWith("http") && <ExternalLink size={11} />}
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {onDone && (
          <button onClick={onDone} className="w-full rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg">
            Tovább
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[14px] leading-relaxed">
        Engedélyezed, hogy <b>{state.pages.length} Facebook-oldalad</b> összes leadjét bekössem? Az elmúlt 90 nap leadjei azonnal betöltődnek, az újak pedig pár
        másodpercen belül megjelennek, és értesítést kapsz róluk.
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {state.pages.slice(0, 12).map((p) => (
          <li key={p.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
            {p.name}
          </li>
        ))}
        {state.pages.length > 12 && <li className="px-1 py-1 text-xs text-muted">+{state.pages.length - 12}</li>}
      </ul>
      <p className="flex items-start gap-2 text-xs text-muted">
        <ShieldCheck size={14} className="mt-px shrink-0" /> A leadeket csak te látod. Az engedélyt a Beállításokban bármikor visszavonhatod.
      </p>
      {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button onClick={yes} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />} {busy ? "Bekötés… (pár másodperc)" : "Igen, kösd be az összeset"}
        </button>
        {onDone && !busy && (
          <button onClick={onDone} className="rounded-xl border border-line px-4 text-sm font-medium text-muted hover:text-fg">
            Később
          </button>
        )}
      </div>
    </div>
  );
}

/** On the leads page: until the user said yes. */
export function LeadConsentCard() {
  const [state] = useConsent();
  const [hidden, setHidden] = useState(false);
  if (!state || state.mode !== "meta" || state.consent || !state.pages.length || hidden) return null;
  return (
    <section className="card mb-5 p-5">
      <h2 className="mb-3 font-semibold">Leadek bekötése</h2>
      <ConsentBody state={state} onDone={() => setHidden(true)} />
    </section>
  );
}

/** Right after connecting Facebook: the second (and last) step of onboarding. */
export function LeadConsentModal({ onClose }: { onClose: () => void }) {
  const [state] = useConsent();
  if (!state || state.mode !== "meta" || !state.pages.length) return null;
  if (state.consent && !state.pages.some((p) => !p.consented)) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="card fade-in relative w-full max-w-md p-6 shadow-2xl">
        <button onClick={onClose} className="absolute top-3 right-3 rounded-lg p-1.5 text-muted hover:text-fg" aria-label="Bezárás">
          <X size={16} />
        </button>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Még egy lépés: a leadek</h2>
        <ConsentBody state={state} onDone={onClose} />
      </div>
    </div>
  );
}

/** Settings: who allowed it, and withdraw. */
export function LeadConsentStatus() {
  const [state, reload] = useConsent();
  const [busy, setBusy] = useState(false);
  if (!state || state.mode !== "meta") return null;
  if (!state.consent) return <p className="text-[13px] text-muted">A leadek még nincsenek bekötve – a Leadek oldalon egy kattintással megteheted.</p>;
  async function revoke() {
    if (!confirm("Biztos? Új leadek nem érkeznek az OCP-be, amíg újra nem engedélyezed.")) return;
    setBusy(true);
    await fetch("/api/leads/consent", { method: "DELETE" });
    setBusy(false);
    reload();
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <span className="inline-flex items-center gap-1.5 text-good">
        <CheckCircle2 size={14} /> Leadek bekötve
      </span>
      <span className="text-muted">
        {state.consent.userName} engedélyezte · {new Date(state.consent.at).toLocaleString("hu-HU")} · {state.consent.pageIds.length} oldal
      </span>
      <button onClick={revoke} disabled={busy} className="ml-auto text-xs font-medium text-bad hover:underline">
        Visszavonás
      </button>
    </div>
  );
}
