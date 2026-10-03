import "server-only";
import type { Ad, Proposal, ProposalAction, Settings, UndoAction } from "../types";
import { getProvider, listAccounts } from "../meta/provider";
import { logActivity, newId, readStore, updateStore } from "../store";
import { fmtMoney } from "../format";

type Draft = Omit<Proposal, "id" | "status" | "createdAt">;

/** Pure rule set: looks at 7-day metrics and returns what it would change. */
export function analyze(ads: Ad[], s: Settings): Draft[] {
  const out: Draft[] = [];
  const money = (n: number) => fmtMoney(n, s.currency);
  const active = ads.filter((a) => a.status === "ACTIVE");

  for (const ad of active) {
    const m = ad.metrics;

    // 1) Burning budget with zero results
    if (m.leads === 0 && m.spend >= s.targetCpl * s.autopilot.autoPauseSpendMultiplier) {
      out.push({
        key: `pause:${ad.id}`,
        kind: "pause_ad",
        severity: "high",
        adId: ad.id,
        title: `Leállítás: „${ad.name}”`,
        reason: `${money(m.spend)} költés 7 nap alatt, 0 lead. Ez a cél CPL (${money(s.targetCpl)}) ${s.autopilot.autoPauseSpendMultiplier}-szorosa.`,
        impact: `Napi kb. ${money(m.spend / 7)} megtakarítás`,
        action: { type: "set_status", adId: ad.id, status: "PAUSED" },
      });
      continue;
    }

    // 2) Expensive results
    if (m.cpl !== null && m.cpl > s.targetCpl * 1.6 && m.spend > s.targetCpl * 4) {
      out.push({
        key: `pause:${ad.id}`,
        kind: "pause_ad",
        severity: "medium",
        adId: ad.id,
        title: `Drága lead: „${ad.name}”`,
        reason: `CPL ${money(m.cpl)}, a cél ${money(s.targetCpl)}. A pénzt jobb hirdetésekre csoportosítanám.`,
        action: { type: "set_status", adId: ad.id, status: "PAUSED" },
      });
    }

    // 3) Creative fatigue
    if (m.frequency >= s.autopilot.frequencyLimit) {
      out.push({
        key: `fatigue:${ad.id}`,
        kind: "refresh_creative",
        severity: "medium",
        adId: ad.id,
        title: `Kifáradó kreatív: „${ad.name}”`,
        reason: `Frequency ${m.frequency.toFixed(1)} (limit ${s.autopilot.frequencyLimit}). Ugyanaz a közönség túl sokszor látta.`,
        impact: "3 új variáns ugyanarra az ígéretre, új képpel és új első mondattal",
        action: { type: "none" },
      });
    }

    // 4) Winners: cheap leads with enough volume → scale (never during learning: a budget change resets it)
    if (m.cpl !== null && m.cpl <= s.targetCpl * 0.75 && m.leads >= 10 && m.frequency < s.autopilot.frequencyLimit - 0.5 && ad.adsetLearning !== "LEARNING") {
      const pct = Math.min(20, s.autopilot.maxBudgetIncreasePct);
      const newBudget = Math.round((ad.adsetDailyBudget * (1 + pct / 100)) / 100) * 100;
      out.push({
        key: `scale:${ad.adsetId}`,
        kind: "scale_budget",
        severity: "low",
        adId: ad.id,
        title: `Skálázás: „${ad.adsetName}” +${pct}%`,
        reason: `„${ad.name}” ${money(m.cpl)}/lead áron hoz (${m.leads} lead), jóval a cél alatt.`,
        impact: `Napi büdzsé ${money(ad.adsetDailyBudget)} → ${money(newBudget)}`,
        action: { type: "set_budget", adsetId: ad.adsetId, dailyBudget: newBudget },
      });
    }

    // 5) Weak hook
    if (m.impressions > 5000 && m.ctr < 0.8) {
      out.push({
        key: `ctr:${ad.id}`,
        kind: "refresh_creative",
        severity: "low",
        adId: ad.id,
        title: `Gyenge horog: „${ad.name}”`,
        reason: `CTR ${m.ctr.toFixed(2)}% – az első sor/kép nem állítja meg a görgetést.`,
        impact: "Új headline + első mondat teszt",
        action: { type: "none" },
      });
    }
  }
  // one proposal per key (e.g. two winning ads in the same ad set → one budget raise)
  return [...new Map(out.map((d) => [d.key, d])).values()];
}

export async function executeAction(action: ProposalAction, accountId?: string): Promise<{ text: string; undo?: UndoAction }> {
  const provider = await getProvider(accountId);
  const acc = provider.account.id;
  if (action.type === "set_status" && action.adId && action.status) {
    await provider.setAdStatus(action.adId, action.status);
    return {
      text: action.status === "PAUSED" ? "Hirdetés leállítva." : "Hirdetés elindítva.",
      undo: { type: "status", level: "ad", id: action.adId, accountId: acc, status: action.status === "PAUSED" ? "ACTIVE" : "PAUSED" },
    };
  }
  if (action.type === "set_budget" && action.adsetId && action.dailyBudget) {
    const before = (await provider.listAds()).find((a) => a.adsetId === action.adsetId)?.adsetDailyBudget;
    await provider.setAdsetBudget(action.adsetId, action.dailyBudget);
    return {
      text: `Napi büdzsé beállítva: ${action.dailyBudget}.`,
      undo: before ? { type: "budget", level: "adset", id: action.adsetId, accountId: acc, dailyBudget: before } : undefined,
    };
  }
  return { text: "Nincs automatikus lépés – a kreatív frissítést a chatben indítsd." };
}

/** Which fresh proposals the autopilot may execute without asking. */
function autoAllowed(p: Proposal, s: Settings): boolean {
  if (p.action.type === "none") return false;
  switch (s.autopilot.level) {
    case "ask":
      return false;
    case "bounded":
      return (p.kind === "pause_ad" && p.severity === "high") || p.kind === "scale_budget";
    case "full":
      return true;
  }
}

/**
 * One monitoring pass over every ad account: read ads, raise new proposals,
 * and auto-execute what the autopilot level allows.
 */
export async function runScan(trigger: "cron" | "manual" | "agent") {
  const [accounts, store] = await Promise.all([listAccounts(), readStore()]);
  let scanned = 0;
  let createdCount = 0;
  let autoCount = 0;

  for (const account of accounts) {
    const provider = await getProvider(account.id);
    const ads = await provider.listAds();
    scanned += ads.length;
    const drafts = analyze(ads, { ...store.settings, currency: account.currency, targetCpl: store.companies[account.id]?.targetCpl ?? store.settings.targetCpl });

    const created = await updateStore((d) => {
      const openKeys = new Set(d.proposals.filter((p) => p.status === "pending").map((p) => p.key));
      const fresh: Proposal[] = drafts
        .map((x) => ({ ...x, key: `${account.id}:${x.key}` }))
        .filter((x) => !openKeys.has(x.key))
        .map((x) => ({
          ...x,
          title: accounts.length > 1 ? `${x.title} · ${account.name}` : x.title,
          accountId: account.id,
          id: newId("prp"),
          status: "pending",
          createdAt: new Date().toISOString(),
        }));
      d.proposals.unshift(...fresh);
      return fresh;
    });
    createdCount += created.length;

    for (const p of created.filter((x) => autoAllowed(x, store.settings))) {
      await resolveProposal(p.id, "approved", "agent");
      autoCount++;
    }
  }

  await updateStore((d) => void (d.lastScanAt = new Date().toISOString()));
  await logActivity(
    "agent",
    "scan",
    `Átnéztem ${scanned} hirdetést ${accounts.length} fiókban (${trigger === "cron" ? "ütemezett" : trigger === "manual" ? "kézi" : "asszisztens"}). ${createdCount} új javaslat${autoCount ? `, ${autoCount} automatikusan végrehajtva` : ""}.`,
  );
  return { scanned, created: createdCount, autoExecuted: autoCount };
}

export async function resolveProposal(
  id: string,
  decision: "approved" | "rejected",
  by: "user" | "agent",
) {
  const store = await readStore();
  const p = store.proposals.find((x) => x.id === id);
  if (!p) throw new Error("Nincs ilyen javaslat.");
  if (p.status !== "pending") return p;

  if (decision === "rejected") {
    await updateStore((d) => {
      const t = d.proposals.find((x) => x.id === id)!;
      t.status = "rejected";
      t.resolvedAt = new Date().toISOString();
    });
    await logActivity(by, "proposal", `Elutasítva: ${p.title}`);
    return p;
  }

  let result: string;
  let undo: UndoAction | undefined;
  let status: Proposal["status"] = "executed";
  try {
    ({ text: result, undo } = await executeAction(p.action, p.accountId));
  } catch (e) {
    result = e instanceof Error ? e.message : String(e);
    status = "failed";
  }
  await updateStore((d) => {
    const t = d.proposals.find((x) => x.id === id)!;
    t.status = status;
    t.result = result;
    t.resolvedAt = new Date().toISOString();
  });
  await logActivity(
    by,
    status === "failed" ? "error" : "action",
    `${by === "agent" ? "Robotpilóta" : "Jóváhagyva"}: ${p.title} – ${result}`,
    status === "failed" ? undefined : undo,
  );
  return p;
}
