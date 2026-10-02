"use client";

import { useState } from "react";
import { Mail, MapPin, Phone } from "lucide-react";
import type { Lead, LeadStatus } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePollWithRefresh } from "@/components/usePoll";

const STATUSES: { id: LeadStatus; label: string; cls: string }[] = [
  { id: "new", label: "Új", cls: "bg-accent-soft text-accent" },
  { id: "contacted", label: "Felhívva", cls: "bg-surface-2 text-fg" },
  { id: "survey", label: "Felmérés", cls: "bg-warn-soft text-warn" },
  { id: "won", label: "Megnyert", cls: "bg-good-soft text-good" },
  { id: "lost", label: "Elveszett", cls: "bg-bad-soft text-bad" },
];

export default function LeadsPage() {
  const [leads, reload] = usePollWithRefresh<Lead[]>("/api/leads");
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const shown = (leads ?? []).filter((l) => filter === "all" || l.status === filter);

  async function setStatus(id: string, status: LeadStatus) {
    await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    reload();
  }

  return (
    <Page>
      <PageHeader title="Leadek" sub="Az instant formokból érkező érdeklődők – a webhookkal másodpercek alatt itt vannak." />
      <div className="mb-4 flex flex-wrap gap-1">
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>
          Mind {leads ? `(${leads.length})` : ""}
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s.id} on={filter === s.id} onClick={() => setFilter(s.id)}>
            {s.label} ({(leads ?? []).filter((l) => l.status === s.id).length})
          </Chip>
        ))}
      </div>
      {!leads ? (
        <p className="text-sm text-muted">Betöltés…</p>
      ) : !shown.length ? (
        <p className="card p-5 text-sm text-muted">Nincs lead ebben a státuszban.</p>
      ) : (
        <div className="card divide-y divide-line">
          {shown.map((l) => {
            const st = STATUSES.find((s) => s.id === l.status)!;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
                <div className="min-w-[180px] flex-1">
                  <p className="text-sm font-semibold">{l.name}</p>
                  <p className="text-xs text-muted">
                    {l.formName} · {timeAgo(l.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                  {l.phone && (
                    <a href={`tel:${l.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                      <Phone size={13} className="text-muted" /> {l.phone}
                    </a>
                  )}
                  {l.email && (
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 hover:text-accent">
                      <Mail size={13} className="text-muted" /> {l.email}
                    </a>
                  )}
                  {l.city && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={13} className="text-muted" /> {l.city}
                    </span>
                  )}
                </div>
                {l.note && <p className="w-full text-[13px] text-muted md:w-auto md:max-w-xs">„{l.note}”</p>}
                <select
                  value={l.status}
                  onChange={(e) => setStatus(l.id, e.target.value as LeadStatus)}
                  className={`rounded-full border-0 px-3 py-1 text-xs font-semibold ${st.cls}`}
                  aria-label="Státusz"
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );
}
