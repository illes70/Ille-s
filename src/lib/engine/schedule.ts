import "server-only";
import type { Overview } from "../live";
import type { AdStatus, UndoAction } from "../types";
import { fmtMoney } from "../format";
import { logActivity, readStore, settingsWithDefaults, updateStore } from "../store";
import { currentTenant } from "../tenant";
import { listUsers, tenantOf } from "../users";
import { notify } from "../notify";
import { localDate, localTime, writeBrief } from "./brief";
import { runScan } from "./monitor";

// The 0-24 engine of one workspace, called once a minute by the live poller:
//  1. spend guard   – over the daily cap → every active ad of that account is paused
//  2. monitor scan  – every N minutes: new proposals, autopilot within its limits
//  3. morning brief – once a day at the chosen local time, pushed + e-mailed
//  4. connection    – warns a week before the Facebook token expires

export async function runSchedules(ov: Overview) {
  const store = await readStore();
  const s = settingsWithDefaults(store.settings);
  const tz = s.schedule.timezone;
  const today = localDate(tz);

  await spendGuard(ov, today).catch((err) => console.error("[ocp guard]", err));

  if (s.schedule.scanEveryMinutes > 0) {
    const last = store.lastScanAt ? new Date(store.lastScanAt).getTime() : 0;
    if (Date.now() - last >= s.schedule.scanEveryMinutes * 60_000) await runScan("cron").catch((err) => console.error("[ocp scan]", err));
  }

  if (s.schedule.briefEnabled && store.jobs?.lastBriefDate !== today && inBriefWindow(localTime(tz), s.schedule.briefTime)) {
    const t = await currentTenant();
    const me = (await listUsers()).find((u) => tenantOf(u) === t);
    const brief = await writeBrief(ov, me?.name.split(" ").pop());
    await notify("brief", {
      title: "☀️ Jó reggelt – a mai teendőid",
      body: `${brief.text}${brief.todo.length ? `\n\n${brief.todo.map((x, i) => `${i + 1}. ${x.text}`).join("\n")}` : ""}`,
      url: "/",
      tag: `brief-${brief.date}`,
    });
  }

  await tokenExpiry(today).catch((err) => console.error("[ocp token]", err));
}

/** From the chosen time until 4 hours later (a server restart at 9:00 still sends it; no "good morning" at 22:00). */
function inBriefWindow(now: string, at: string) {
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const d = min(now) - min(at);
  return d >= 0 && d < 240;
}

async function spendGuard(ov: Overview, today: string) {
  const store = await readStore();
  for (const { account, summary } of ov.rows) {
    const cap = store.companies[account.id]?.dailySpendCap;
    if (!cap || summary.today.spend < cap) continue;
    if (store.jobs?.guardTripped?.[account.id] === today) continue;

    const { getAdsLive } = await import("../live");
    const { getProvider } = await import("../meta/provider");
    const { ads } = await getAdsLive(account.id, 0);
    const provider = await getProvider(account.id);
    const active = ads.filter((a) => a.status === "ACTIVE");
    const paused: { level: "ad"; id: string; status: AdStatus }[] = [];
    for (const ad of active) {
      try {
        await provider.setAdStatus(ad.id, "PAUSED");
        paused.push({ level: "ad", id: ad.id, status: "ACTIVE" });
      } catch (err) {
        console.error("[ocp guard] pause failed", ad.id, err);
      }
    }
    await updateStore((d) => void (d.jobs = { ...d.jobs, guardTripped: { ...d.jobs?.guardTripped, [account.id]: today } }));
    const money = (n: number) => fmtMoney(n, account.currency);
    const undo: UndoAction = { type: "statuses", accountId: account.id, items: paused };
    const text = `Napi költési plafon elérve – ${account.name}: ${money(summary.today.spend)} / ${money(cap)}. ${paused.length} aktív hirdetést leállítottam, holnap reggel te döntesz az újraindításról.`;
    await logActivity("system", "guard", text, paused.length ? undo : undefined);
    await notify("alert", { title: `🛑 Költési plafon: ${account.name}`, body: text, url: "/activity", tag: `guard-${account.id}` });
  }
}

async function tokenExpiry(today: string) {
  const store = await readStore();
  const exp = store.metaAuth?.expiresAt;
  if (!exp || store.jobs?.tokenWarnedOn === today) return;
  const days = Math.floor((new Date(exp).getTime() - Date.now()) / 86_400_000);
  if (days > 7) return;
  await updateStore((d) => void (d.jobs = { ...d.jobs, tokenWarnedOn: today }), ["health"]);
  const text =
    days < 0
      ? "A Facebook-kapcsolat lejárt – az adatok nem frissülnek. Beállítások → „Csatlakoztatás Facebookkal” (1 kattintás) és minden megy tovább."
      : `A Facebook-kapcsolat ${days} nap múlva lejár. Egy kattintás a megújítás: Beállítások → „Kapcsolat megújítása”.`;
  await logActivity("system", "error", text);
  await notify("alert", { title: "Facebook-kapcsolat megújítása", body: text, url: "/settings", tag: "token" });
}
