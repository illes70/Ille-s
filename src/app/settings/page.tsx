"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleX, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { FacebookIcon } from "@/components/FacebookIcon";
import type { AutopilotLevel, Settings } from "@/lib/types";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePoll, usePollWithRefresh, refreshAll } from "@/components/usePoll";
import { AiCard, DangerCard, InviteCard, NotifyCard, ScheduleCard } from "@/components/SettingsCards";
import { LeadConsentStatus } from "@/components/LeadConsent";

const LEVELS: { id: AutopilotLevel; label: string; desc: (ap: Settings["autopilot"]) => string }[] = [
  { id: "ask", label: "Mindig kérdez", desc: () => "Minden változtatás javaslatként érkezik, semmi nem történik a jóváhagyásod nélkül." },
  {
    id: "bounded",
    label: "Kereten belül automata",
    desc: (ap) =>
      `Magától leállítja, ami a cél CPL ${ap.autoPauseSpendMultiplier}-szorosát elköltötte lead nélkül, és legfeljebb ${ap.maxBudgetIncreasePct}%-kal emeli a nyerők büdzséjét. Minden más kérdés.`,
  },
  { id: "full", label: "Teljes automata", desc: () => "Minden végrehajtható javaslatot azonnal megcsinál, és utólag jelent." },
];

interface Connection {
  appConfigured: boolean;
  envToken: boolean;
  connected: boolean;
  userName?: string;
  expiresAt?: string;
  pages: { id: string; name: string; leadgenSubscribed: boolean }[];
}

interface HealthCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
  fix?: { text: string; href?: string; action?: "connect_meta" | "subscribe_leadgen" };
}

const BANNERS: Record<string, [string, "good" | "bad" | "warn"]> = {
  connected: ["Facebook csatlakoztatva – a fiókok és oldalak betöltve.", "good"],
  denied: ["A Facebook-csatlakozást megszakítottad.", "warn"],
  bad_state: ["A csatlakozás lejárt vagy megszakadt – próbáld újra.", "warn"],
  missing_app: ["Az egygombos csatlakozáshoz előbb egy Meta app kell (lásd Rendszerállapot → Meta app).", "warn"],
  error: ["A csatlakozás nem sikerült.", "bad"],
};

export default function SettingsPage() {
  const [banner, setBanner] = useState<{ text: string; tone: "good" | "bad" | "warn" } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const key = q.get("meta");
    if (key && BANNERS[key]) {
      const [text, tone] = BANNERS[key];
      setBanner({ text: q.get("msg") ? `${text} ${q.get("msg")}` : text, tone });
      window.history.replaceState(null, "", "/settings");
    }
  }, []);

  return (
    <Page>
      <PageHeader title="Beállítások" sub="Kapcsolatok, értesítések, a 0–24 robot és a robotpilóta szabályai." />
      {banner && (
        <p className={`mb-6 rounded-xl px-4 py-3 text-sm ${banner.tone === "good" ? "bg-good-soft text-good" : banner.tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
          {banner.text}
        </p>
      )}
      <div className="grid max-w-6xl items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ConnectCard />
          <NotifyCard />
          <AutopilotCard />
        </div>
        <div className="space-y-6">
          <HealthCard />
          <AiCard />
          <ScheduleCard />
          <InviteCard />
          <DangerCard />
        </div>
      </div>
    </Page>
  );
}

function ConnectCard() {
  const c = usePoll<Connection>("/api/connection");
  const [busy, setBusy] = useState(false);
  if (!c) return <section className="card p-6 text-sm text-muted">Betöltés…</section>;
  const days = c.expiresAt ? Math.round((new Date(c.expiresAt).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#1877f2] text-white">
          <FacebookIcon size={22} />
        </span>
        <div>
          <h2 className="font-semibold">Meta (Facebook + Instagram)</h2>
          <p className="text-[13px] text-muted">
            {c.connected ? (c.userName ? `Csatlakoztatva: ${c.userName}` : "Csatlakoztatva (.env token)") : "Most demó adatokkal fut"}
          </p>
        </div>
      </div>

      {c.connected ? (
        <div className="space-y-3">
          {days !== null && (
            <p className={`text-[13px] ${days < 7 ? "text-warn" : "text-muted"}`}>
              A kapcsolat {days} nap múlva lejár{days < 7 ? " – csatlakozz újra." : "."}
            </p>
          )}
          <LeadConsentStatus />
          {!!c.pages.length && (
            <ul className="divide-y divide-line rounded-xl border border-line text-[13px]">
              {c.pages.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate">{p.name}</span>
                  <span className={p.leadgenSubscribed ? "text-good" : "text-muted"}>{p.leadgenSubscribed ? "azonnali leadek" : "leadek nincsenek bekötve"}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <a href="/api/auth/meta/start" className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-accent/50">
              <RefreshCw size={15} /> Újracsatlakozás
            </a>
            {!c.envToken && (
              <button
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Biztosan bontod a Facebook-kapcsolatot? Az OCP demó módba vált.")) return;
                  setBusy(true);
                  await fetch("/api/auth/meta/disconnect", { method: "POST" });
                  setBusy(false);
                  refreshAll();
                }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-muted hover:text-bad"
              >
                Kapcsolat bontása
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] text-muted">
            Egy kattintás: bejelentkezel a Facebookkal, kiválasztod a vállalkozásokat és oldalakat, és az OCP behúzza az összes hirdetési
            fiókot élő adatokkal és képekkel, és bekapcsolja az azonnali leadeket.
          </p>
          <a
            href="/api/auth/meta/start"
            className={`inline-flex items-center gap-2 rounded-xl bg-[#1877f2] px-5 py-2.5 text-sm font-semibold text-white ${c.appConfigured ? "" : "pointer-events-none opacity-50"}`}
          >
            <FacebookIcon size={18} /> Csatlakozás Facebookkal
          </a>
          {!c.appConfigured && <p className="text-xs text-warn">Ehhez előbb Meta app kell – a lépéseket lásd a Rendszerállapotnál.</p>}
        </div>
      )}
    </section>
  );
}

function HealthCard() {
  const [checks, reload] = usePollWithRefresh<HealthCheck[]>("/api/health", 300_000);
  const [fixing, setFixing] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => setChecking(false), [checks]);

  async function fix(c: HealthCheck) {
    if (c.fix?.action === "connect_meta") return void (window.location.href = "/api/auth/meta/start");
    if (c.fix?.action === "subscribe_leadgen") {
      setFixing(c.id);
      await fetch("/api/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe_leadgen" }) });
      setFixing(null);
      reload();
    }
  }

  return (
    <section id="health" className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Rendszerállapot</h2>
        <button
          onClick={() => {
            setChecking(true);
            reload();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg"
        >
          <RefreshCw size={13} className={checking ? "animate-spin" : ""} /> Ellenőrzés
        </button>
      </div>
      {!checks ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Ellenőrzés…
        </p>
      ) : (
        <ul className="space-y-4">
          {checks.map((c) => (
            <li key={c.id} className="flex gap-3">
              {c.status === "ok" ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" />
              ) : c.status === "warn" ? (
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
              ) : (
                <CircleX size={18} className="mt-0.5 shrink-0 text-bad" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{c.label}</p>
                <p className="text-[13px] text-muted">{c.detail}</p>
                {c.fix && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {c.fix.action ? (
                      <button
                        onClick={() => fix(c)}
                        disabled={fixing === c.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-60"
                      >
                        {fixing === c.id && <Loader2 size={12} className="animate-spin" />}
                        {c.fix.text}
                      </button>
                    ) : (
                      <p className="text-[13px]">→ {c.fix.text}</p>
                    )}
                    {c.fix.href && (
                      <a href={c.fix.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                        Megnyitás <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-xs text-muted">Ha valami piros, írd a chatbe: „Valami nem működik” – az asszisztens végigvezet a javításon.</p>
    </section>
  );
}

function AutopilotCard() {
  const remote = usePoll<Settings>("/api/settings");
  const [s, setS] = useState<Settings>();
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (remote && !s) setS(remote);
  }, [remote, s]);
  if (!s) return <section className="card p-6 text-sm text-muted">Betöltés…</section>;

  const ap = s.autopilot;
  const setAp = (patch: Partial<Settings["autopilot"]>) => setS({ ...s, autopilot: { ...ap, ...patch } });

  const { currency, targetCpl } = s;
  async function save() {
    setSaving("saving");
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency, targetCpl, autopilot: ap }) });
    setSaving("saved");
    setTimeout(() => setSaving("idle"), 1800);
  }

  return (
    <section className="card space-y-5 p-6">
      <h2 className="font-semibold">Robotpilóta</h2>
      <div className="space-y-2">
        {LEVELS.map((l) => (
          <label
            key={l.id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${ap.level === l.id ? "border-accent bg-accent-soft/50" : "border-line"}`}
          >
            <input type="radio" name="level" checked={ap.level === l.id} onChange={() => setAp({ level: l.id })} className="mt-1 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-medium">{l.label}</span>
              <span className="block text-[13px] text-muted">{l.desc(ap)}</span>
            </span>
          </label>
        ))}
      </div>
      <Field label="Alapértelmezett cél CPL (cégenként a Cégprofilban felülírható)">
        <div className="flex gap-2">
          <input type="number" value={s.targetCpl} onChange={(e) => setS({ ...s, targetCpl: Number(e.target.value) })} className="input min-w-0 flex-1" />
          <input value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase().slice(0, 3) })} className="input w-20 shrink-0" />
        </div>
      </Field>
      <Field label={`Leállítási küszöb: cél CPL × ${ap.autoPauseSpendMultiplier}`}>
        <input type="range" min={1} max={6} step={0.5} value={ap.autoPauseSpendMultiplier} onChange={(e) => setAp({ autoPauseSpendMultiplier: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
      </Field>
      <Field label={`Max. büdzsé emelés egy lépésben: ${ap.maxBudgetIncreasePct}%`}>
        <input type="range" min={5} max={100} step={5} value={ap.maxBudgetIncreasePct} onChange={(e) => setAp({ maxBudgetIncreasePct: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
      </Field>
      <Field label={`Frequency limit (kreatív frissítés): ${ap.frequencyLimit}`}>
        <input type="range" min={1.5} max={8} step={0.5} value={ap.frequencyLimit} onChange={(e) => setAp({ frequencyLimit: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
      </Field>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving === "saving"} className="inline-flex items-center gap-2 rounded-xl bg-fg px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-60">
          {saving === "saving" ? <Loader2 size={16} className="animate-spin" /> : saving === "saved" ? <Check size={16} /> : null}
          {saving === "saved" ? "Elmentve" : "Mentés"}
        </button>
      </div>
    </section>
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
