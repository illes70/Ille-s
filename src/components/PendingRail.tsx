"use client";

import Link from "next/link";
import type { Proposal } from "@/lib/types";
import { ActivityFeed, LiveBadge } from "./ActivityFeed";
import { ProposalCard } from "./ProposalCard";
import { ScanButton } from "./ScanButton";
import { usePoll } from "./usePoll";

/** Right-hand rail next to the chat: what needs a decision + what the robot is doing. */
export function PendingRail() {
  const proposals = usePoll<Proposal[]>("/api/proposals", 8000);
  const pending = proposals?.filter((p) => p.status === "pending") ?? [];

  return (
    <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-line bg-surface/50 p-5 xl:block">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Döntésre vár</h2>
        <ScanButton />
      </div>
      {pending.length === 0 ? (
        <p className="card p-4 text-[13px] text-muted">Nincs nyitott javaslat. Minden a terv szerint fut.</p>
      ) : (
        <div className="space-y-3">
          {pending.slice(0, 4).map((p) => (
            <ProposalCard key={p.id} p={p} compact />
          ))}
          {pending.length > 4 && (
            <Link href="/inbox" className="block text-center text-xs font-medium text-accent">
              További {pending.length - 4} javaslat →
            </Link>
          )}
        </div>
      )}

      <div className="mt-8 mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Robot naplója</h2>
        <LiveBadge />
      </div>
      <ActivityFeed limit={12} />
    </aside>
  );
}
