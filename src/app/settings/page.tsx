"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Settings } from "@/lib/types";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePoll } from "@/components/usePoll";

export default function SettingsPage() {
  const remote = usePoll<Settings>("/api/settings", 600_000);
  const ads = usePoll<{ mode: "demo" | "meta" }>("/api/ads", 600_000);
  const [s, setS] = useState<Settings>();
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (remote && !s) setS(remote);
  }, [remote, s]);

  if (!s) return <Page><p className="text-sm text-muted">Betöltés…</p></Page>;

  const ap = s.autopilot;
  const setAp = (patch: Partial<Settings["autopilot"]>) => setS({ ...s, autopilot: { ...ap, ...patch } });

  async function save() {
    setSaving("saving");
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setSaving("saved");
    setTimeout(() => setSaving("idle"), 1800);
  }

  return (
    <Page>
      <PageHeader title="Beállítások" sub="Célok, robotpilóta korlátok és csatlakoztatott fiókok." />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="card space-y-5 p-6">
          <h2 className="font-semibold">Célok és márka</h2>
          <Field label="Cél CPL (lead ár)">
            <div className="flex gap-2">
              <input type="number" value={s.targetCpl} onChange={(e) => setS({ ...s, targetCpl: Number(e.target.value) })} className="input min-w-0 flex-1" />
              <input value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase().slice(0, 3) })} className="input w-20 shrink-0" />
            </div>
          </Field>
          <Field label="Márkahang – így írja a szövegeket az asszisztens">
            <textarea rows={4} value={s.brandVoice} onChange={(e) => setS({ ...s, brandVoice: e.target.value })} className="input resize-y" />
          </Field>
        </section>

        <section className="card space-y-5 p-6">
          <h2 className="font-semibold">Robotpilóta</h2>
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={ap.autoPause} onChange={(e) => setAp({ autoPause: e.target.checked })} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-medium">Automatikus leállítás</span>
              <span className="block text-[13px] text-muted">
                Kérdezés nélkül leállítja azt a hirdetést, ami a cél CPL {ap.autoPauseSpendMultiplier}-szorosát elköltötte lead nélkül.
              </span>
            </span>
          </label>
          <Field label={`Leállítási küszöb: cél CPL × ${ap.autoPauseSpendMultiplier}`}>
            <input type="range" min={1} max={6} step={0.5} value={ap.autoPauseSpendMultiplier} onChange={(e) => setAp({ autoPauseSpendMultiplier: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={`Max. büdzsé emelés egy lépésben: ${ap.maxBudgetIncreasePct}%`}>
            <input type="range" min={5} max={100} step={5} value={ap.maxBudgetIncreasePct} onChange={(e) => setAp({ maxBudgetIncreasePct: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
          <Field label={`Frequency limit (kreatív frissítés): ${ap.frequencyLimit}`}>
            <input type="range" min={1.5} max={8} step={0.5} value={ap.frequencyLimit} onChange={(e) => setAp({ frequencyLimit: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          </Field>
        </section>

        <section className="card space-y-4 p-6 lg:col-span-2">
          <h2 className="font-semibold">Hirdetési fiókok</h2>
          <Connection
            name="Meta (Facebook + Instagram)"
            status={ads?.mode === "meta" ? "connected" : "demo"}
            note={
              ads?.mode === "meta"
                ? "A fiók élő adatokkal fut."
                : "Most demó adatokkal fut. Csatlakoztatás: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID és META_PAGE_ID a .env.local fájlban (az egy kattintásos Facebook bejelentkezés a következő lépés)."
            }
          />
          <Connection name="Google Ads" status="soon" note="Tervezett integráció." />
          <Connection name="LinkedIn Ads" status="soon" note="Tervezett integráció." />
        </section>
      </div>

      <div className="sticky bottom-4 mt-6 flex max-w-5xl justify-end">
        <button onClick={save} disabled={saving === "saving"} className="inline-flex items-center gap-2 rounded-xl bg-fg px-5 py-2.5 text-sm font-semibold text-bg shadow-lg disabled:opacity-60">
          {saving === "saving" ? <Loader2 size={16} className="animate-spin" /> : saving === "saved" ? <Check size={16} /> : null}
          {saving === "saved" ? "Elmentve" : "Mentés"}
        </button>
      </div>
    </Page>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Connection({ name, status, note }: { name: string; status: "connected" | "demo" | "soon"; note: string }) {
  const badge = {
    connected: ["Csatlakoztatva", "bg-good-soft text-good"],
    demo: ["Demó mód", "bg-warn-soft text-warn"],
    soon: ["Hamarosan", "bg-surface-2 text-muted"],
  }[status];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-[13px] text-muted">{note}</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge[1]}`}>{badge[0]}</span>
    </div>
  );
}
