"use client";

import { useState } from "react";
import { Mail, MapPin, Phone, TriangleAlert } from "lucide-react";
import type { Lead, LeadStatus } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePollWithRefresh } from "@/components/usePoll";
import { LeadConsentCard } from "@/components/LeadConsent";

const STATUSES: { id: LeadStatus; label: string; cls: string }[] = [
  { id: "new", label: "Új", cls: "bg-accent-soft text-accent" },
  { id: "contacted", label: "Felhívva", cls: "bg-surface-2 text-fg" },
  { id: "survey", label: "Felmérés", cls: "bg-warn-soft text-warn" },
  { id: "won", label: "Megnyert", cls: "bg-good-soft text-good" },
  { id: "lost", label: "Elveszett", cls: "bg-bad-soft text-bad" },
];

export default function LeadsPage() {
  const [scope, setScope] = useState<"account" | "all">("account");
  const [hideSpam, setHideSpam] = useState(true);
  const [raw, reload] = usePollWithRefresh<Lead[]>(scope === "all" ? "/api/leads?scope=all" : "/api/leads");
  const leads = raw && (hideSpam ? raw.filter((l) => l.quality?.verdict !== "spam") : raw);
  const spamCount = (raw ?? []).filter((l) => l.quality?.verdict === "spam").length;
  const [filter, setFilter] = useState<LeadStatus | "all">("all");
  const shown = (leads ?? []).filter((l) => filter === "all" || l.status === filter);

  async function setStatus(id: string, status: LeadStatus) {
    await fetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    reload();
  }

  return (
    <Page>
      <PageHeader title="Leadek" sub="Az instant formokból érkező érdeklődők – a webhookkal másodpercek alatt itt vannak." />
      <LeadConsentCard />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-line p-0.5 text-xs font-medium">
          {(["account", "all"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={`rounded-lg px-3 py-1 ${scope === s ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}>
              {s === "account" ? "Ez a fiók" : "Minden fiók"}
            </button>
          ))}
        </div>
        {spamCount > 0 && (
          <button onClick={() => setHideSpam(!hideSpam)} className="text-xs text-muted hover:text-fg">
            {hideSpam ? `${spamCount} szűrt spam megjelenítése` : "Spam elrejtése"}
          </button>
        )}
      </div>
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
                  {l.quality && l.quality.verdict !== "ok" && (
                    <p className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${l.quality.verdict === "spam" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
                      <TriangleAlert size={11} /> {l.quality.verdict === "spam" ? "Spam: " : ""}
                      {l.quality.flags.join(", ")}
                    </p>
                  )}
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
