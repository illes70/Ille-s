"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { AdAccount } from "@/lib/types";
import { refreshAll, usePollWithRefresh } from "./usePoll";

interface AccountsResponse {
  mode: "demo" | "meta";
  active: AdAccount;
  accounts: AdAccount[];
}

export function AccountSwitcher() {
  const [data, reload] = usePollWithRefresh<AccountsResponse>("/api/accounts", 120_000);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!data?.active) return null;

  async function pick(id: string) {
    setOpen(false);
    await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    reload();
    refreshAll();
  }

  return (
    <div ref={ref} className="relative md:mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2 text-left hover:border-accent/40"
      >
        <span
          className="grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: hue(data.active.id) }}
        >
          {initials(data.active.name)}
        </span>
        <span className="hidden min-w-0 flex-1 md:block">
          <span className="block truncate text-[13px] font-medium">{data.active.name}</span>
          <span className="block text-[11px] text-muted">{data.mode === "meta" ? "Meta hirdetési fiók" : "Demó fiók"}</span>
        </span>
        <ChevronsUpDown size={14} className="hidden shrink-0 text-muted md:block" />
      </button>
      {open && (
        <div className="card absolute top-full left-0 z-30 mt-1 w-64 p-1 shadow-xl">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-muted">Hirdetési fiókok</p>
          {data.accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => pick(a.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-surface-2"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: hue(a.id) }}>
                {initials(a.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {a.id === data.active.id && <Check size={14} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter((w) => /[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

function hue(id: string) {
  const colors = ["#2563eb", "#059669", "#d97706", "#db2777", "#7c3aed", "#0891b2"];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}
