"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import type { Lead } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePoll } from "@/components/usePoll";

export default function LeadsPage() {
  const leads = usePoll<Lead[]>("/api/leads", 30_000);

  return (
    <Page>
      <PageHeader title="Leadek" sub="Az instant formokból érkező érdeklődők, egyszerűsítve." />
      {!leads ? (
        <p className="text-sm text-muted">Betöltés…</p>
      ) : !leads.length ? (
        <p className="card p-5 text-sm text-muted">Még nincs lead. Kérj az asszisztenstől egy instant formot.</p>
      ) : (
        <div className="card divide-y divide-line">
          {leads.map((l) => (
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
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
