"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, UserPlus, X } from "lucide-react";
import type { AdAccount, Lead } from "@/lib/types";

interface Toast {
  id: string;
  lead?: Lead;
  account?: AdAccount;
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
    const onAccount = (e: Event) => {
      const account = (e as CustomEvent<AdAccount>).detail;
      setToasts((t) => [{ id: account.id, account }, ...t.filter((x) => x.id !== account.id)].slice(0, 4));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== account.id)), 10000);
    };
    window.addEventListener("ocp:lead", onLead);
    window.addEventListener("ocp:account", onAccount);
    return () => {
      window.removeEventListener("ocp:lead", onLead);
      window.removeEventListener("ocp:account", onAccount);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[60] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map(({ id, lead, account, accountName }) =>
        account ? (
          <div key={id} className="card toast-in pointer-events-auto flex items-start gap-3 p-3.5 shadow-xl">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Building2 size={17} />
            </span>
            <Link href="/overview" className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Új ügyfélfiók: {account.name}</p>
              <p className="text-xs text-muted">Automatikusan csatlakoztatva – profil, hirdetések, képek betöltve.</p>
            </Link>
            <button onClick={() => setToasts((t) => t.filter((x) => x.id !== id))} className="text-muted hover:text-fg" aria-label="Bezárás">
              <X size={15} />
            </button>
          </div>
        ) : lead ? (
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
        ) : null,
      )}
    </div>
  );
}
