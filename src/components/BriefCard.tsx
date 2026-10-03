"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Sun, X } from "lucide-react";
import type { Brief } from "@/lib/types";
import { refreshAll, usePollWithRefresh } from "./usePoll";

const DOT = { high: "bg-bad", medium: "bg-warn", low: "bg-accent" } as const;

/** "Jó reggelt!" – the morning brief on top of the chat: numbers + today's to-dos, approvable in place. */
export function BriefCard({ onAsk }: { onAsk: (text: string) => void }) {
  const [data, reload] = usePollWithRefresh<{ brief: Brief | null; isToday: boolean }>("/api/brief");
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  if (!data?.brief || !data.isToday || data.brief.readAt) return null;
  const b = data.brief;

  async function approve(id: string) {
    setBusy(id);
    await fetch(`/api/proposals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "approved" }) });
    setDone((s) => new Set(s).add(id));
    setBusy(null);
    refreshAll();
  }

  async function dismiss() {
    await fetch("/api/brief", { method: "PATCH" });
    reload();
  }

  return (
    <section className="card fade-in mb-6 overflow-hidden">
      <header className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-amber-500/15 text-amber-500">
          <Sun size={17} />
        </span>
        <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="font-semibold">Reggeli összefoglaló</span>
          <span className="text-xs text-muted">{b.todo.length ? `${b.todo.length} teendő mára` : "ma nincs teendő"}</span>
          <ChevronDown size={15} className={`text-muted transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <button onClick={dismiss} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Elolvastam" title="Elolvastam">
          <X size={16} />
        </button>
      </header>
      {open && (
        <div className="space-y-4 p-4">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{b.text}</p>
          {!!b.todo.length && (
            <ol className="space-y-2">
              {b.todo.map((t, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[t.severity]}`} />
                  <p className="min-w-0 flex-1 text-[13px] leading-snug">{t.text}</p>
                  {t.proposalId &&
                    (done.has(t.proposalId) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-good">
                        <Check size={13} /> Kész
                      </span>
                    ) : (
                      <button
                        onClick={() => approve(t.proposalId!)}
                        disabled={busy === t.proposalId}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-fg px-2.5 py-1 text-xs font-semibold text-bg disabled:opacity-60"
                      >
                        {busy === t.proposalId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Mehet
                      </button>
                    ))}
                </li>
              ))}
            </ol>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onAsk("Nézzük a mai teendőket: mivel kezdjem, és miért?")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-fg">
              Mivel kezdjem?
            </button>
            <button onClick={() => onAsk("Mi történt tegnap részletesen, fiókonként?")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-fg">
              Részletek fiókonként
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
