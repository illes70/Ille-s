"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next?.startsWith("/") ? next : "/";
    } else {
      setError((await res.json()).error ?? "Hiba");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-7">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-fg text-sm font-bold text-bg">O</span>
          <span className="text-lg font-semibold">OCP</span>
        </div>
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Jelszó" className="input" />
        {error && <p className="text-sm text-bad">{error}</p>}
        <button disabled={busy || !password} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />} Belépés
        </button>
      </form>
    </div>
  );
}
