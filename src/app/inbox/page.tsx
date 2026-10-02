"use client";

import type { Proposal } from "@/lib/types";
import { Page, PageHeader } from "@/components/PageHeader";
import { ProposalCard } from "@/components/ProposalCard";
import { ScanButton } from "@/components/ScanButton";
import { usePoll } from "@/components/usePoll";

export default function InboxPage() {
  const proposals = usePoll<Proposal[]>("/api/proposals", 8000);
  const pending = proposals?.filter((p) => p.status === "pending") ?? [];
  const done = proposals?.filter((p) => p.status !== "pending") ?? [];

  return (
    <Page>
      <PageHeader
        title="Javaslatok"
        sub="Amit az asszisztens magától csinálna. Egy kattintás, és végrehajtja."
        right={<ScanButton label="Átvizsgálás most" />}
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Döntésre vár ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="card p-5 text-sm text-muted">
              Nincs nyitott javaslat. Az asszisztens folyamatosan figyel, és ide jelez, ha valamit változtatna.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((p) => (
                <ProposalCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">Előzmények</h2>
          <div className="space-y-3 opacity-80">
            {done.slice(0, 30).map((p) => (
              <ProposalCard key={p.id} p={p} compact />
            ))}
            {!done.length && <p className="text-sm text-muted">Még nincs lezárt javaslat.</p>}
          </div>
        </section>
      </div>
    </Page>
  );
}
