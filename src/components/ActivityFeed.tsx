"use client";

import { useState } from "react";
import { Bot, CircleAlert, Cog, Loader2, ShieldAlert, Sun, Undo2, User } from "lucide-react";
import type { Activity } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { refreshAll, usePoll } from "./usePoll";

const ICON = { agent: Bot, user: User, system: Cog };

export function ActivityFeed({ limit = 30 }: { limit?: number }) {
  const items = usePoll<Activity[]>("/api/activity");
  const [undoing, setUndoing] = useState<string | null>(null);

  async function undo(id: string) {
    setUndoing(id);
    const res = await fetch(`/api/activity/${id}/undo`, { method: "POST" });
    if (!res.ok) alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Nem sikerült visszavonni");
    setUndoing(null);
    refreshAll();
  }
  if (!items) return <p className="text-sm text-muted">Betöltés…</p>;
  if (!items.length)
    return <p className="text-sm text-muted">Még nincs esemény. Írj az asszisztensnek, vagy futtass egy átvizsgálást.</p>;

  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-line">
      {items.slice(0, limit).map((a) => {
        const Icon = a.kind === "error" ? CircleAlert : a.kind === "guard" ? ShieldAlert : a.kind === "brief" ? Sun : ICON[a.actor];
        return (
          <li key={a.id} className="fade-in relative flex gap-3">
            <span
              className={`z-10 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface ${
                a.kind === "error" || a.kind === "guard" ? "text-bad" : a.actor === "agent" ? "text-accent" : "text-muted"
              }`}
            >
              <Icon size={14} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] leading-snug">{a.text}</p>
              <p className="flex items-center gap-2 text-[11px] text-muted">
                {timeAgo(a.ts)}
                {a.undo &&
                  (a.undoneAt ? (
                    <span>· visszavonva</span>
                  ) : (
                    <button onClick={() => undo(a.id)} disabled={undoing === a.id} className="inline-flex items-center gap-1 font-medium text-accent hover:underline disabled:opacity-60">
                      {undoing === a.id ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />} Visszavonás
                    </button>
                  ))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-good">
      <span className="live-dot size-2 rounded-full bg-good" /> Élő
    </span>
  );
}
