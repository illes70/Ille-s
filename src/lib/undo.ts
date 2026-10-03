import "server-only";
import type { UndoAction } from "./types";
import { getProvider } from "./meta/provider";
import { logActivity, readStore, updateStore } from "./store";

// One-click "Visszavonás" on the activity feed: puts statuses / budgets back to what
// they were before the change (by the assistant, the autopilot, the spend cap or you).

async function setStatus(accountId: string, level: "ad" | "adset" | "campaign", id: string, status: "ACTIVE" | "PAUSED") {
  const provider = await getProvider(accountId);
  if (level === "ad") return provider.setAdStatus(id, status);
  if (provider.mode === "demo") {
    await updateStore((d) => d.ads.filter((a) => (level === "adset" ? a.adsetId : a.campaignId) === id).forEach((a) => (a.status = status)), ["ads"]);
    return;
  }
  const { updateObject } = await import("./meta/manage");
  await updateObject(id, { status });
  const { adsChanged } = await import("./live-bus");
  await adsChanged(accountId);
}

async function apply(u: UndoAction) {
  if (u.type === "status") return setStatus(u.accountId, u.level, u.id, u.status);
  if (u.type === "statuses") {
    for (const it of u.items) await setStatus(u.accountId, it.level, it.id, it.status);
    return;
  }
  const provider = await getProvider(u.accountId);
  if (u.level === "adset" || provider.mode === "demo") return provider.setAdsetBudget(u.id, u.dailyBudget);
  const { updateObject, toMinor } = await import("./meta/manage");
  await updateObject(u.id, { daily_budget: toMinor(u.dailyBudget) });
  const { adsChanged } = await import("./live-bus");
  await adsChanged(u.accountId);
}

export async function undoActivity(activityId: string) {
  const entry = (await readStore()).activity.find((a) => a.id === activityId);
  if (!entry?.undo) throw new Error("Ez a lépés nem vonható vissza.");
  if (entry.undoneAt) throw new Error("Ezt már visszavontad.");
  await apply(entry.undo);
  await updateStore((d) => {
    const a = d.activity.find((x) => x.id === activityId);
    if (a) a.undoneAt = new Date().toISOString();
  });
  await logActivity("user", "action", `Visszavonva: ${entry.text}`);
}
