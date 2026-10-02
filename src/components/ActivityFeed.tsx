"use client";

import { Bot, CircleAlert, User, Cog } from "lucide-react";
import type { Activity } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { usePoll } from "./usePoll";

const ICON = { agent: Bot, user: User, system: Cog };

export function ActivityFeed({ limit = 30 }: { limit?: number }) {
  const items = usePoll<Activity[]>("/api/activity", 3000);
  if (!items) return <p className="text-sm text-muted">Betöltés…</p>;
  if (!items.length)
    return <p className="text-sm text-muted">Még nincs esemény. Írj az asszisztensnek, vagy futtass egy átvizsgálást.</p>;

  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-line">
      {items.slice(0, limit).map((a) => {
        const Icon = a.kind === "error" ? CircleAlert : ICON[a.actor];
        return (
          <li key={a.id} className="relative flex gap-3">
            <span
              className={`z-10 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface ${
                a.kind === "error" ? "text-bad" : a.actor === "agent" ? "text-accent" : "text-muted"
              }`}
            >
              <Icon size={14} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[13px] leading-snug">{a.text}</p>
              <p className="text-[11px] text-muted">{timeAgo(a.ts)}</p>
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
