import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { readStore, settingsWithDefaults, updateStore } from "./store";

// What the AI costs, per workspace and month, and which model a request may use.
// Prices are list prices (USD per 1M tokens; images: per image) – an estimate for
// steering, the provider invoices are the truth.

export type AiMode = "max" | "balanced" | "saver";

const CLAUDE: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

/** Which Claude model and effort a chat turn runs on. */
export function modelFor(mode: AiMode): { model: string; effort: "low" | "medium" | "high" } {
  if (process.env.OCP_MODEL) return { model: process.env.OCP_MODEL, effort: (process.env.OCP_EFFORT as "low" | "medium" | "high") ?? "medium" };
  switch (mode) {
    case "max":
      return { model: "claude-opus-5-5", effort: "medium" };
    case "balanced":
      return { model: "claude-opus-5-5", effort: "low" };
    case "saver":
      return { model: "claude-sonnet-5-5", effort: "low" };
  }
}

export const month = (d = new Date()) => d.toISOString().slice(0, 7);

export interface MonthUsage {
  usd: number;
  chatTurns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  images: number;
  imagesFree: number;
  /** usd per area */
  by: { chat: number; brief: number; images: number };
  warned80?: boolean;
  limitHit?: boolean;
}

const empty = (): MonthUsage => ({ usd: 0, chatTurns: 0, tokensIn: 0, tokensOut: 0, cacheRead: 0, images: 0, imagesFree: 0, by: { chat: 0, brief: 0, images: 0 } });

export function claudeCost(model: string, u: Anthropic.Beta.Messages.BetaUsage) {
  const p = CLAUDE[model] ?? CLAUDE["claude-opus-5-5"];
  return (
    ((u.input_tokens ?? 0) * p.in +
      (u.output_tokens ?? 0) * p.out +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

async function add(area: keyof MonthUsage["by"], usd: number, patch: (m: MonthUsage) => void) {
  const m = month();
  const crossed = await updateStore((d) => {
    d.usage ??= {};
    const cur = (d.usage[m] ??= empty());
    cur.usd += usd;
    cur.by[area] += usd;
    patch(cur);
    // keep 13 months
    for (const k of Object.keys(d.usage).sort().slice(0, -13)) delete d.usage[k];
    const budget = settingsWithDefaults(d.settings).ai.monthlyBudgetUsd;
    if (budget > 0 && !cur.limitHit && cur.usd >= budget) {
      cur.limitHit = cur.warned80 = true;
      return "100" as const;
    }
    if (budget > 0 && !cur.warned80 && cur.usd >= budget * 0.8) {
      cur.warned80 = true;
      return "80" as const;
    }
    return null;
  }, ["settings"]);
  if (crossed) {
    const s = settingsWithDefaults((await readStore()).settings);
    const { notify } = await import("./notify");
    const { logActivity } = await import("./store");
    const text =
      crossed === "80"
        ? `Az AI-keret 80%-a elfogyott ebben a hónapban (${s.ai.monthlyBudgetUsd} $).`
        : s.ai.onLimit === "stop"
          ? `Elérted a havi AI-keretet (${s.ai.monthlyBudgetUsd} $): a chat és a fizetős képgenerálás a hónap végéig szünetel (ingyenes képek mennek). A Beállításokban emelheted.`
          : `Elérted a havi AI-keretet (${s.ai.monthlyBudgetUsd} $): a hónap végéig takarékos módban dolgozom (olcsóbb modell, ingyenes képek).`;
    await logActivity("system", "guard", text);
    await notify("alert", { title: "AI-keret", body: text, url: "/settings#ai", tag: `ai-${crossed}` });
  }
}

export async function recordClaude(area: "chat" | "brief", model: string, u: Anthropic.Beta.Messages.BetaUsage) {
  const usd = claudeCost(model, u);
  await add(area, usd, (m) => {
    if (area === "chat") m.chatTurns++;
    m.tokensIn += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    m.tokensOut += u.output_tokens ?? 0;
    m.cacheRead += u.cache_read_input_tokens ?? 0;
  });
}

export async function recordImage(usd: number) {
  await add("images", usd, (m) => {
    m.images++;
    if (usd === 0) m.imagesFree++;
  });
}

/** The mode a request may use right now (the monthly limit can force "saver" or stop). */
export async function effectiveAi(): Promise<{ mode: AiMode; blocked: boolean; usage: MonthUsage }> {
  const store = await readStore();
  const s = settingsWithDefaults(store.settings).ai;
  const usage = store.usage?.[month()] ?? empty();
  const over = s.monthlyBudgetUsd > 0 && usage.usd >= s.monthlyBudgetUsd;
  if (!over) return { mode: s.mode, blocked: false, usage };
  return s.onLimit === "stop" ? { mode: "saver", blocked: true, usage } : { mode: "saver", blocked: false, usage };
}

export async function usageSummary() {
  const store = await readStore();
  const s = settingsWithDefaults(store.settings).ai;
  const cur = store.usage?.[month()] ?? empty();
  const history = Object.entries(store.usage ?? {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([m, u]) => ({ month: m, usd: u.usd }));
  return { month: month(), current: cur, budget: s.monthlyBudgetUsd, mode: s.mode, onLimit: s.onLimit, history };
}
