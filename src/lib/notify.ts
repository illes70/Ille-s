import "server-only";
import { promises as fs } from "fs";
import path from "path";
import webpush from "web-push";
import type { PushSub } from "./types";
import { DATA_DIR } from "./users";
import { readStore, settingsWithDefaults, updateStore } from "./store";
import { currentTenant } from "./tenant";

// Reaching the user when the app isn't open: Web Push (phone + desktop, the app
// installed to the home screen) and e-mail (Resend). Three kinds of messages:
//   lead  – a new lead, seconds after it arrives (speed-to-lead)
//   brief – the morning brief
//   alert – something needs attention now (spend cap hit, connection about to expire…)

export type NotifyKind = "lead" | "brief" | "alert";

export interface Message {
  title: string;
  body: string;
  /** page to open on tap, e.g. /leads */
  url: string;
  /** e-mail body (HTML); defaults to the text body */
  html?: string;
  /** same tag replaces the previous notification instead of stacking */
  tag?: string;
}

// ---------- Web Push ----------

interface Vapid {
  publicKey: string;
  privateKey: string;
}
const g = globalThis as unknown as { __ocpVapid?: Vapid };

/** VAPID keys from .env, else generated once into .data/vapid.json. */
export async function vapidKeys(): Promise<Vapid> {
  if (g.__ocpVapid) return g.__ocpVapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    g.__ocpVapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const file = path.join(DATA_DIR, "vapid.json");
    try {
      g.__ocpVapid = JSON.parse(await fs.readFile(file, "utf8")) as Vapid;
    } catch {
      g.__ocpVapid = webpush.generateVAPIDKeys();
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(file, JSON.stringify(g.__ocpVapid), { mode: 0o600 });
    }
  }
  return g.__ocpVapid;
}

async function sendPush(subs: PushSub[], msg: Message): Promise<number> {
  if (!subs.length) return 0;
  const keys = await vapidKeys();
  const contact = process.env.OCP_MAIL_FROM?.match(/<?([^<>\s]+@[^<>\s]+)>?/)?.[1] ?? "ocp@example.com";
  webpush.setVapidDetails(`mailto:${contact}`, keys.publicKey, keys.privateKey);
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag });
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3600, urgency: "high" });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // the browser dropped the subscription (app uninstalled, permission revoked)
        if (code === 404 || code === 410) gone.push(s.endpoint);
        else console.error("[ocp push]", code, (err as Error).message);
      }
    }),
  );
  if (gone.length) await updateStore((d) => void (d.pushSubs = (d.pushSubs ?? []).filter((s) => !gone.includes(s.endpoint))));
  return sent;
}

// ---------- e-mail (Resend) ----------

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

async function sendEmail(to: string, msg: Message): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const base = process.env.OCP_PUBLIC_URL ?? "";
  const link = base ? `${base}${msg.url}` : msg.url;
  const html =
    msg.html ??
    `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
       <p style="white-space:pre-wrap;margin:0 0 16px">${escapeHtml(msg.body)}</p>
       ${base ? `<a href="${link}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Megnyitás az OCP-ben</a>` : ""}
     </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.OCP_MAIL_FROM ?? "OCP <onboarding@resend.dev>", to: [to], subject: msg.title, html }),
  }).catch((err) => {
    console.error("[ocp mail]", err);
    return null;
  });
  if (!res?.ok) console.error("[ocp mail]", res?.status, await res?.text().catch(() => ""));
  return !!res?.ok;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------- one entry point ----------

/** Sends to the current workspace on every channel its settings allow. Never throws. */
export async function notify(kind: NotifyKind, msg: Message): Promise<{ push: number; email: boolean }> {
  try {
    const store = await readStore();
    const n = settingsWithDefaults(store.settings).notify;
    const wantPush = kind === "lead" ? n.leadsPush : kind === "brief" ? n.briefPush : n.alertsPush;
    const wantEmail = kind === "lead" ? n.leadsEmail : kind === "brief" ? n.briefEmail : n.alertsEmail;
    const email = n.email ?? (await ownerEmail());
    const [push, mailed] = await Promise.all([
      wantPush ? sendPush(store.pushSubs ?? [], msg) : 0,
      wantEmail && email ? sendEmail(email, msg) : false,
    ]);
    return { push, email: mailed };
  } catch (err) {
    console.error("[ocp notify]", err);
    return { push: 0, email: false };
  }
}

/** Default address: the first person of this workspace. */
async function ownerEmail(): Promise<string | undefined> {
  const t = await currentTenant();
  const { listUsers, tenantOf } = await import("./users");
  return (await listUsers()).find((u) => tenantOf(u) === t)?.email;
}

/** Test message from the settings page. */
export async function notifyTest() {
  return notify("alert", { title: "OCP teszt értesítés", body: "Ha ezt látod, az értesítések működnek. 🎉", url: "/settings", tag: "test" });
}
