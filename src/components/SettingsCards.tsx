"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Check, Clock, Copy, Loader2, Smartphone, Trash2, UserPlus } from "lucide-react";
import type { Settings } from "@/lib/types";
import { usePoll, usePollWithRefresh } from "./usePoll";

type Full = Settings & Required<Pick<Settings, "schedule" | "notify">>;

function useSettingsPart<K extends "schedule" | "notify">(key: K) {
  const [remote, reload] = usePollWithRefresh<Full>("/api/settings");
  const [value, setValue] = useState<Full[K]>();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (remote && !value) setValue(remote[key]);
  }, [remote, value, key]);
  async function save(next = value) {
    setState("saving");
    setError(null);
    const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: next }) });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Mentési hiba");
      setState("idle");
      return;
    }
    setState("saved");
    reload();
    setTimeout(() => setState("idle"), 1600);
  }
  return { value, setValue, save, state, error };
}

function SaveButton({ state, onClick }: { state: "idle" | "saving" | "saved"; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={state === "saving"} className="inline-flex items-center gap-2 rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-60">
      {state === "saving" ? <Loader2 size={15} className="animate-spin" /> : state === "saved" ? <Check size={15} /> : null}
      {state === "saved" ? "Elmentve" : "Mentés"}
    </button>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-[13px]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
      >
        <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

const b64ToUint8 = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Push on this device + e-mail, and what to get. */
export function NotifyCard() {
  const { value: n, setValue, save, state, error } = useSettingsPart("notify");
  const [push, reloadPush] = usePollWithRefresh<{ publicKey: string; devices: number }>("/api/push");
  const [device, setDevice] = useState<"unsupported" | "ios-install" | "off" | "on" | "denied">("off");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        const ios = /iphone|ipad/i.test(navigator.userAgent);
        setDevice(ios ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setDevice("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      setDevice((await reg?.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setDevice("unsupported"));
  }, []);

  async function enable() {
    if (!push) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setDevice("denied");
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(push.publicKey) });
      const label = /iphone|ipad/i.test(navigator.userAgent) ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Számítógép";
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), label }) });
      setDevice("on");
      reloadPush();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setDevice("off");
    setBusy(false);
    reloadPush();
  }

  async function sendTest() {
    setTest("…");
    const r = (await (await fetch("/api/notify/test", { method: "POST" })).json()) as { push: number; email: boolean; emailConfigured: boolean };
    setTest(
      [
        r.push ? `${r.push} eszközre elküldve` : "push: nincs feliratkozott eszköz",
        r.email ? "e-mail elküldve" : r.emailConfigured ? "e-mail: nem ment ki" : "e-mail: nincs beállítva (RESEND_API_KEY)",
      ].join(" · "),
    );
  }

  if (!n) return <section className="card p-6 text-sm text-muted">Betöltés…</section>;
  const set = (patch: Partial<typeof n>) => setValue({ ...n, ...patch });

  return (
    <section className="card space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-accent" />
        <h2 className="font-semibold">Értesítések</h2>
      </div>

      <div className="rounded-xl border border-line p-3">
        <div className="flex items-center gap-3">
          <Smartphone size={18} className="shrink-0 text-muted" />
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-medium">Ezen az eszközön</p>
            <p className="text-muted">
              {device === "on"
                ? "Bekapcsolva – új leadnél azonnal csörög."
                : device === "denied"
                  ? "A böngészőben le vannak tiltva az értesítések – a webcím melletti lakat ikonnál engedélyezd."
                  : device === "ios-install"
                    ? "iPhone-on: Megosztás → „Főképernyőhöz adás”, majd onnan nyisd meg az OCP-t, és itt kapcsold be."
                    : device === "unsupported"
                      ? "Ez a böngésző nem támogatja a push értesítést."
                      : "Kapcsold be, és a telefonod azonnal jelez minden új leadnél."}
              {push && push.devices > 0 && ` (${push.devices} eszköz összesen)`}
            </p>
          </div>
          {(device === "off" || device === "on") && (
            <button
              onClick={device === "on" ? disable : enable}
              disabled={busy}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${device === "on" ? "border border-line text-muted" : "bg-accent text-white"}`}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />} {device === "on" ? "Kikapcsolás" : "Bekapcsolás"}
            </button>
          )}
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] text-muted">E-mail cím az értesítésekhez (üresen: a belépési címed)</span>
        <input className="input" type="email" value={n.email ?? ""} onChange={(e) => set({ email: e.target.value || undefined })} placeholder="te@ceged.hu" />
      </label>

      <div className="divide-y divide-line">
        <div className="pb-2">
          <p className="pb-1 text-xs font-medium text-muted">Új lead (azonnal)</p>
          <Toggle on={n.leadsPush} onChange={(v) => set({ leadsPush: v })} label="Push" />
          <Toggle on={n.leadsEmail} onChange={(v) => set({ leadsEmail: v })} label="E-mail" />
        </div>
        <div className="py-2">
          <p className="pb-1 text-xs font-medium text-muted">Reggeli összefoglaló</p>
          <Toggle on={n.briefPush} onChange={(v) => set({ briefPush: v })} label="Push" />
          <Toggle on={n.briefEmail} onChange={(v) => set({ briefEmail: v })} label="E-mail" />
        </div>
        <div className="pt-2">
          <p className="pb-1 text-xs font-medium text-muted">Riasztások (költési plafon, lejáró kapcsolat)</p>
          <Toggle on={n.alertsPush} onChange={(v) => set({ alertsPush: v })} label="Push" />
          <Toggle on={n.alertsEmail} onChange={(v) => set({ alertsEmail: v })} label="E-mail" />
        </div>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {test && <span className="mr-auto text-xs text-muted">{test}</span>}
        <button onClick={sendTest} className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:text-fg">
          Teszt küldése
        </button>
        <SaveButton state={state} onClick={() => save()} />
      </div>
    </section>
  );
}

/** When the 0-24 engine scans and writes the morning brief. */
export function ScheduleCard() {
  const { value: s, setValue, save, state, error } = useSettingsPart("schedule");
  const [writing, setWriting] = useState(false);
  if (!s) return <section className="card p-6 text-sm text-muted">Betöltés…</section>;
  const set = (patch: Partial<typeof s>) => setValue({ ...s, ...patch });

  async function briefNow() {
    setWriting(true);
    await fetch("/api/brief", { method: "POST" });
    setWriting(false);
    window.location.href = "/";
  }

  return (
    <section className="card space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Clock size={18} className="text-accent" />
        <h2 className="font-semibold">0–24 robot</h2>
      </div>
      <p className="text-[13px] text-muted">
        A szerveren éjjel-nappal fut, akkor is, ha az OCP nincs megnyitva: figyeli a számokat, javaslatot ír, a robotpilóta szintjén belül cselekszik, és
        reggel összefoglalót küld.
      </p>
      <Toggle on={s.briefEnabled} onChange={(v) => set({ briefEnabled: v })} label="Reggeli összefoglaló („Jó reggelt, ma ez a dolgod”)" />
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-muted">Időpont</span>
          <input className="input" type="time" value={s.briefTime} onChange={(e) => set({ briefTime: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-muted">Átvizsgálás</span>
          <select className="input" value={s.scanEveryMinutes} onChange={(e) => set({ scanEveryMinutes: Number(e.target.value) })}>
            <option value={30}>félóránként</option>
            <option value={60}>óránként</option>
            <option value={180}>3 óránként</option>
            <option value={360}>6 óránként</option>
            <option value={0}>kikapcsolva</option>
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={briefNow} disabled={writing} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted hover:text-fg disabled:opacity-60">
          {writing && <Loader2 size={15} className="animate-spin" />} Összefoglaló most
        </button>
        <SaveButton state={state} onClick={() => save()} />
      </div>
    </section>
  );
}

/** Operator only: a sign-up link for a new customer (own, isolated workspace). */
export function InviteCard() {
  const status = usePoll<{ user: { role: string } | null }>("/api/auth/status");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (status?.user?.role !== "owner") return null;

  async function create() {
    const r = (await (await fetch("/api/invites", { method: "POST" })).json()) as { url: string };
    setLink(r.url);
    setCopied(false);
  }

  return (
    <section className="card space-y-3 p-6">
      <div className="flex items-center gap-2">
        <UserPlus size={18} className="text-accent" />
        <h2 className="font-semibold">Új ügyfél meghívása</h2>
      </div>
      <p className="text-[13px] text-muted">
        Egyszer használható regisztrációs link (14 napig érvényes). Az ügyfél saját, teljesen elkülönített fiókot kap – ő nem látja a tiédet, te nem
        látod az övét.
      </p>
      {link ? (
        <div className="flex gap-2">
          <input readOnly value={link} className="input min-w-0 flex-1 text-xs" onFocus={(e) => e.target.select()} />
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-fg px-3 text-sm font-semibold text-bg"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Másolva" : "Másolás"}
          </button>
        </div>
      ) : (
        <button onClick={create} className="rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg">
          Meghívó link készítése
        </button>
      )}
    </section>
  );
}

/** GDPR: delete my account and data. */
export function DangerCard() {
  const status = usePoll<{ user: { role: string; email: string } | null }>("/api/auth/status");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!status?.user || status.user.role === "owner") return null;

  async function del() {
    const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
    if (res.ok) window.location.href = "/login";
    else setError(((await res.json()) as { error?: string }).error ?? "Hiba");
  }

  return (
    <section className="card space-y-3 border-bad/30 p-6">
      <h2 className="font-semibold text-bad">Fiók és adatok törlése</h2>
      <p className="text-[13px] text-muted">Végleges: a fiókod, a Facebook-kapcsolat, a leadek, képek és beszélgetések mind törlődnek.</p>
      <input className="input" placeholder={`Írd be: ${status.user.email}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <button onClick={del} disabled={confirm !== status.user.email} className="inline-flex items-center gap-2 rounded-xl bg-bad px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        <Trash2 size={15} /> Végleges törlés
      </button>
    </section>
  );
}
