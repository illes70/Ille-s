"use client";

import { useState } from "react";
import { Check, ClipboardCheck, Loader2, TriangleAlert, X } from "lucide-react";
import type { Plan } from "@/lib/agent/plans";
import { refreshAll, usePollWithRefresh } from "./usePoll";

/** "Erre gondoltam – mehet?" Every change waits here until the user says yes. */
export function PendingPlans() {
  const [plans, reload] = usePollWithRefresh<Plan[]>("/api/plans");
  if (!plans?.length) return null;
  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <PlanCard key={p.id} plan={p} onDone={reload} />
      ))}
    </div>
  );
}

function PlanCard({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<"approve" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const warning = plan.items.some((i) => i.confirm);
  const chosen = plan.items.length - skip.size;

  async function decide(decision: "approve" | "cancel") {
    setBusy(decision);
    setError(null);
    const res = await fetch(`/api/plans/${plan.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, skip: [...skip] }),
    });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Hiba történt");
    setBusy(null);
    onDone();
    refreshAll();
    window.dispatchEvent(new Event("ocp:chat-reload"));
  }

  const toggle = (id: number) =>
    setSkip((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <section className={`card fade-in overflow-hidden border-2 ${warning ? "border-warn/50" : "border-accent/40"}`}>
      <header className={`flex items-center gap-2.5 px-4 py-3 ${warning ? "bg-warn-soft" : "bg-accent-soft/60"}`}>
        {warning ? <TriangleAlert size={17} className="shrink-0 text-warn" /> : <ClipboardCheck size={17} className="shrink-0 text-accent" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{warning ? "Figyelmeztetés – mégis mehet?" : "Erre gondoltam – mehet?"}</p>
          <p className="truncate text-xs text-muted">{plan.title}</p>
        </div>
      </header>
      <ol className="divide-y divide-line">
        {plan.items.map((it) => {
          const off = skip.has(it.id);
          return (
            <li key={it.id}>
              <label className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 ${off ? "opacity-50" : ""}`}>
                <input type="checkbox" checked={!off} onChange={() => toggle(it.id)} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
                <span className="min-w-0 text-[13px] leading-snug">
                  <span className="mr-1.5 font-semibold text-muted">{it.id}.</span>
                  <span className={off ? "line-through" : ""}>{it.text}</span>
                  {it.warning && <span className="mt-1 block text-xs text-warn">⚠ {it.warning}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      <footer className="space-y-2 border-t border-line px-4 py-3">
        {error && <p className="text-xs text-bad">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => decide("approve")}
            disabled={!!busy || chosen === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50"
          >
            {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Mehet{skip.size ? ` (${chosen} lépés)` : ""}
          </button>
          <button onClick={() => decide("cancel")} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm font-medium text-muted hover:text-fg">
            {busy === "cancel" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Mégse
          </button>
          <span className="text-xs text-muted">vagy írd meg lent, pl. „mehet, de a 2-t hagyd ki” / „a büdzsé legyen 5000”</span>
        </div>
      </footer>
    </section>
  );
}
