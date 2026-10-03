"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface Field {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
}

/** Shared sign-in / sign-up card. */
export function AuthCard(props: {
  title: string;
  sub: string;
  fields: Field[];
  submit: string;
  endpoint: string;
  onDone: () => void;
  footer?: { text: string; href: string; link: string };
  /** sent along with the fields (e.g. an invite token) */
  extra?: Record<string, string>;
  /** shown instead of the form (e.g. sign-up closed) */
  blocked?: string;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(props.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...props.extra, ...values }) });
    if (res.ok) return props.onDone();
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Hiba történt");
    setBusy(false);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <form onSubmit={submit} className="card fade-in w-full max-w-sm space-y-4 p-7 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-fg text-sm font-bold text-bg">O</span>
          <span className="text-lg font-semibold tracking-tight">OCP</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{props.sub}</p>
        </div>
        {props.blocked ? (
          <p className="rounded-lg bg-surface-2 px-3 py-3 text-sm text-muted">{props.blocked}</p>
        ) : (
        <>
        {props.fields.map((f, i) => (
          <label key={f.name} className="block">
            <span className="mb-1.5 block text-[13px] text-muted">{f.label}</span>
            <input
              className="input"
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              autoFocus={i === 0}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
            />
          </label>
        ))}
        {error && <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />} {props.submit}
        </button>
        </>
        )}
        {props.footer && (
          <p className="text-center text-[13px] text-muted">
            {props.footer.text}{" "}
            <Link href={props.footer.href} className="font-medium text-accent">
              {props.footer.link}
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
