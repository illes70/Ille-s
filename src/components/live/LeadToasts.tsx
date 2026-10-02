"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserPlus, X } from "lucide-react";
import type { Lead } from "@/lib/types";

interface Toast {
  id: string;
  lead: Lead;
  accountName?: string;
}

/** New lead → small card top-right for a few seconds. */
export function LeadToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onLead = (e: Event) => {
      const { lead, accountName } = (e as CustomEvent<{ lead: Lead; accountName?: string }>).detail;
      setToasts((t) => [{ id: lead.id, lead, accountName }, ...t.filter((x) => x.id !== lead.id)].slice(0, 4));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== lead.id)), 8000);
    };
    window.addEventListener("ocp:lead", onLead);
    return () => window.removeEventListener("ocp:lead", onLead);
  }, []);

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[60] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map(({ id, lead, accountName }) => (
        <div key={id} className="card toast-in pointer-events-auto flex items-start gap-3 p-3.5 shadow-xl">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-good-soft text-good">
            <UserPlus size={17} />
          </span>
          <Link href="/leads" className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Új lead: {lead.name}</p>
            <p className="truncate text-xs text-muted">
              {[lead.city, lead.formName, accountName].filter(Boolean).join(" · ")}
            </p>
            {lead.phone && <p className="tabular mt-0.5 text-xs font-medium">{lead.phone}</p>}
          </Link>
          <button onClick={() => setToasts((t) => t.filter((x) => x.id !== id))} className="text-muted hover:text-fg" aria-label="Bezárás">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
