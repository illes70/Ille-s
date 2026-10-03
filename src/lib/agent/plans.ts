import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { logActivity, newId, readStore, updateStore } from "../store";

// "Erre gondoltam – mehet?" Every change on Meta goes through a plan the user approves:
//   1. the assistant calls propose_changes with the exact steps (tool + input + plain text)
//   2. the user clicks "Mehet" (unticking what they don't want) or writes
//      "mehet, de a 2-t hagyd ki" – then the assistant calls execute_plan
//   3. only now the steps run, in order; later steps can use earlier results ({{1.campaign_id}})
// Write tools refuse to run outside an approved plan (enforced in runTool).

/** Tools that change something on Meta. They only ever run from an approved plan. */
export const PLAN_ONLY = new Set([
  "set_status",
  "set_budget",
  "create_ads",
  "create_lead_form",
  "update_ad_creative",
  "create_campaign",
  "create_ad_set",
  "update_ad_set",
  "duplicate",
  "upload_video",
  "create_audience",
  "create_lookalike",
]);

export type PlanItemStatus = "pending" | "done" | "skipped" | "failed" | "warning" | "refused";

export interface PlanItem {
  id: number;
  /** what the user reads: "Leállítom: „Klíma – akciós” (CPL 6 200 Ft)" */
  text: string;
  tool: string;
  input: Record<string, unknown>;
  status: PlanItemStatus;
  result?: string;
  /** the user approves this step knowing the advisor's warning (follow-up plans) */
  confirm?: boolean;
  /** the advisor's concern, shown on the card */
  warning?: string;
}

export interface Plan {
  id: string;
  accountId: string;
  title: string;
  createdAt: string;
  items: PlanItem[];
  status: "pending" | "executed" | "cancelled" | "superseded";
  /** the user wrote something after the plan was shown (text approval allowed) */
  userResponded?: boolean;
  resolvedAt?: string;
  resolvedBy?: "button" | "chat";
}

export async function proposePlan(
  accountId: string,
  title: string,
  items: { text: string; tool: string; input: Record<string, unknown>; confirm?: boolean; warning?: string }[],
): Promise<Plan> {
  const { validateToolInput } = await import("./tools");
  items.forEach((it, i) => {
    // overriding the advisor is the user's call, made on a warning card – never preset by the assistant
    if (!it.confirm) delete it.input.confirmed_after_warning;
    if (!PLAN_ONLY.has(it.tool)) throw new Error(`${i + 1}. lépés: a(z) ${it.tool} nem módosító eszköz – azt közvetlenül hívd, ne tervben.`);
    const err = validateToolInput(it.tool, it.input);
    if (err) throw new Error(`${i + 1}. lépés (${it.tool}) hibás bemenet: ${err}`);
  });
  const plan: Plan = {
    id: newId("pln"),
    accountId,
    title,
    createdAt: new Date().toISOString(),
    items: items.map((it, i) => ({ id: i + 1, text: it.text, tool: it.tool, input: it.input, status: "pending", confirm: it.confirm, warning: it.warning })),
    status: "pending",
  };
  await updateStore((d) => {
    d.plans ??= [];
    // a new plan replaces the previous unanswered one of the same company
    for (const p of d.plans) if (p.accountId === accountId && p.status === "pending") p.status = "superseded";
    d.plans.unshift(plan);
    d.plans = d.plans.slice(0, 200);
  }, ["plans"]);
  return plan;
}

export async function pendingPlans(accountId: string): Promise<Plan[]> {
  return ((await readStore()).plans ?? []).filter((p) => p.accountId === accountId && p.status === "pending");
}

/** Called when the user writes in the chat: from now on a text "mehet" may approve the open plan. */
export async function markUserResponded(accountId: string) {
  await updateStore((d) => {
    for (const p of d.plans ?? []) if (p.accountId === accountId && p.status === "pending") p.userResponded = true;
  });
}

/** {{2.campaign_id}} → the campaign_id that step 2 returned. */
function resolveRefs(value: unknown, results: Map<number, Record<string, unknown>>): { value: unknown; missing?: number } {
  let missing: number | undefined;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const whole = v.match(/^\{\{(\d+)\.([\w.]+)\}\}$/);
      const sub = (n: number, path: string) => {
        const r = results.get(n);
        if (!r) {
          missing = n;
          return undefined;
        }
        return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), r);
      };
      if (whole) return sub(Number(whole[1]), whole[2]);
      return v.replace(/\{\{(\d+)\.([\w.]+)\}\}/g, (_, n, p) => String(sub(Number(n), p) ?? ""));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const out = walk(value);
  return { value: out, missing };
}

const firstText = (c: string | unknown[]) =>
  typeof c === "string" ? c : ((c as { type: string; text?: string }[]).find((b) => b.type === "text")?.text ?? "");

/**
 * Runs the approved steps. `skip`: item ids the user left out; `confirmed`: items whose
 * advisor warning the user has seen and accepted.
 */
export async function executePlan(planId: string, opts: { skip?: number[]; confirmed?: number[]; by: "button" | "chat" }): Promise<Plan> {
  const plan = ((await readStore()).plans ?? []).find((p) => p.id === planId);
  if (!plan) throw new Error("Nincs ilyen terv.");
  if (plan.status !== "pending") throw new Error(plan.status === "executed" ? "Ez a terv már végre lett hajtva." : "Ez a terv már nem érvényes – kérj újat.");
  if (opts.by === "chat" && !plan.userResponded) throw new Error("A felhasználó még nem válaszolt a tervre – várd meg a jóváhagyását.");

  // claim it first: a double click or a parallel chat approval can't run it twice
  const claimed = await updateStore((d) => {
    const p = d.plans?.find((x) => x.id === planId);
    if (!p || p.status !== "pending") return false;
    p.status = "executed";
    p.resolvedAt = new Date().toISOString();
    p.resolvedBy = opts.by;
    return true;
  }, ["plans"]);
  if (!claimed) throw new Error("Ez a terv már végre lett hajtva.");

  const { runTool } = await import("./tools");
  const { getProvider } = await import("../meta/provider");
  const { runAsActiveAccount } = await import("../account-context");
  const skip = new Set(opts.skip ?? []);
  const confirmed = new Set(opts.confirmed ?? []);
  const results = new Map<number, Record<string, unknown>>();
  const items: PlanItem[] = plan.items.map((it) => ({ ...it }));

  await runAsActiveAccount(plan.accountId, async () => {
    // the plan belongs to one company: make sure the tools act on that ad account
    await getProvider(plan.accountId);
    for (const it of items) {
      if (skip.has(it.id)) {
        it.status = "skipped";
        it.result = "kihagyva (a felhasználó kérésére)";
        continue;
      }
      const { value, missing } = resolveRefs(it.input, results);
      if (missing !== undefined) {
        it.status = "skipped";
        it.result = `kihagyva – a ${missing}. lépés eredményére épülne, ami nem készült el`;
        continue;
      }
      const input = { ...(value as Record<string, unknown>), ...(confirmed.has(it.id) || it.confirm ? { confirmed_after_warning: true } : {}) };
      const r = await runTool(it.tool, input, { viaPlan: true });
      const text = firstText(r.content);
      it.result = text.slice(0, 600);
      if (!r.ok) it.status = "failed";
      else if (r.flag === "confirm") it.status = "warning";
      else if (r.flag === "refused") it.status = "refused";
      else {
        it.status = "done";
        try {
          results.set(it.id, JSON.parse(text) as Record<string, unknown>);
        } catch {
          results.set(it.id, {});
        }
      }
    }
  });

  await updateStore((d) => {
    const p = d.plans?.find((x) => x.id === planId);
    if (p) p.items = items;
  }, ["plans", "ads", "activity"]);
  // steps the advisor stopped with a warning come back as a new card: "mégis mehet?"
  const warned = items.filter((i) => i.status === "warning");
  if (warned.length) {
    await proposePlan(
      plan.accountId,
      `Figyelmeztetés – mégis mehet? (${plan.title})`,
      warned.map((i) => {
        let concern = "";
        try {
          concern = ((JSON.parse(i.result ?? "{}") as { concerns?: string[] }).concerns ?? []).join(" ");
        } catch {}
        return { text: i.text, tool: i.tool, input: (resolveRefs(i.input, results).value as Record<string, unknown>) ?? i.input, confirm: true, warning: concern || "Szakmai aggály – lásd a chatet." };
      }),
    );
  }
  const done = items.filter((i) => i.status === "done").length;
  await logActivity(opts.by === "button" ? "user" : "agent", "action", `Jóváhagyott terv: „${plan.title}” – ${done}/${items.length} lépés kész${items.some((i) => i.status === "warning" || i.status === "refused" || i.status === "failed") ? ", a többinél teendő van" : ""}.`);
  return { ...plan, status: "executed", items, resolvedBy: opts.by };
}

export async function cancelPlan(planId: string) {
  await updateStore((d) => {
    const p = d.plans?.find((x) => x.id === planId);
    if (p?.status === "pending") {
      p.status = "cancelled";
      p.resolvedAt = new Date().toISOString();
    }
  }, ["plans"]);
}

function reasonOf(i: PlanItem) {
  try {
    return ((JSON.parse(i.result ?? "{}") as { reasons?: string[] }).reasons ?? []).join(" ") || "lásd a chatet";
  } catch {
    return i.result ?? "";
  }
}

const ICON: Record<PlanItemStatus, string> = { pending: "•", done: "✓", skipped: "–", failed: "✗", warning: "⚠", refused: "⛔" };

/** What the assistant (and the transcript) learns after a button decision. */
export function planOutcomeText(plan: Plan, decision: "executed" | "cancelled", note?: string) {
  if (decision === "cancelled") return `[OCP] A felhasználó elvetette a tervet: „${plan.title}”.${note ? ` Megjegyzés: ${note}` : ""}`;
  const why = (i: PlanItem) =>
    i.status === "warning" ? "szakmai figyelmeztetés – külön kártyán jóváhagyásra vár" : i.status === "refused" ? `nem engedélyezett: ${reasonOf(i)}` : (i.result ?? i.status);
  const lines = plan.items.map((i) => `${ICON[i.status]} ${i.id}. ${i.text}${i.status === "done" ? "" : ` – ${why(i)}`}`);
  return `[OCP] Jóváhagyva gombbal: „${plan.title}”\n${lines.join("\n")}`;
}

/** Append the outcome to the company's chat so the next turn knows (append-only history). */
export async function appendToChat(accountId: string, text: string) {
  const msg: Anthropic.Beta.Messages.BetaMessageParam = { role: "user", content: [{ type: "text", text }] };
  await updateStore((d) => void (d.chats[accountId] = [...(d.chats[accountId] ?? []), msg]));
}
