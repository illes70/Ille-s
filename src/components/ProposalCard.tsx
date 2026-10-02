"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { Proposal } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { refreshAll } from "./usePoll";

const SEV: Record<Proposal["severity"], string> = {
  high: "bg-bad",
  medium: "bg-warn",
  low: "bg-accent",
};

const STATUS: Partial<Record<Proposal["status"], string>> = {
  executed: "Végrehajtva",
  rejected: "Elutasítva",
  failed: "Sikertelen",
  approved: "Jóváhagyva",
};

export function ProposalCard({ p, compact = false }: { p: Proposal; compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    await fetch(`/api/proposals/${p.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusy(false);
    refreshAll();
  }

  const actionable = p.action.type !== "none";

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${SEV[p.severity]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">{p.title}</p>
            <span className="shrink-0 text-[11px] text-muted">{timeAgo(p.createdAt)}</span>
          </div>
          <p className="mt-1 text-[13px] text-muted">{p.reason}</p>
          {p.impact && !compact && <p className="mt-1 text-[13px]">→ {p.impact}</p>}
          {p.status === "pending" ? (
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy}
                onClick={() => decide("approved")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-50"
              >
                <Check size={14} /> {actionable ? "Mehet" : "Rendben"}
              </button>
              <button
                disabled={busy}
                onClick={() => decide("rejected")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-fg disabled:opacity-50"
              >
                <X size={14} /> Most nem
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              {STATUS[p.status]}
              {p.result ? ` · ${p.result}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
