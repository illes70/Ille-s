"use client";

import { useState } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { refreshAll } from "./usePoll";

export function ScanButton({ label = "Átvizsgálás" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/scan", { method: "POST" });
        setBusy(false);
        refreshAll();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg disabled:opacity-60"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
      {label}
    </button>
  );
}
