import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatTurnEvent } from "../types";
import { logActivity, readStore, updateStore } from "../store";
import { getProvider } from "../meta/provider";
import { getCompany } from "../company";
import { claudeImageBlock } from "../creative/claude-files";
import { SYSTEM_PROMPT } from "./prompt";
import { clientTools, runTool, serverTools, toolLabel } from "./tools";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

const MAX_STEPS = 25;

// Server-side compaction keeps long company chats cheap (old turns get summarized
// instead of being resent forever). If the API ever rejects it, run without it.
const g = globalThis as unknown as { __ocpNoCompaction?: boolean };

const client = new Anthropic();

/**
 * Runs one user turn of the assistant: streams text + tool progress through `emit`,
 * executes client tools, and appends every completed step to the stored history
 * (append-only, so thinking blocks stay valid across turns).
 */
export async function runAgentTurn(userText: string, images: string[], emit: (e: ChatTurnEvent) => void) {
  // every company (ad account) has its own conversation
  const accountId = (await getProvider()).account.id;
  const store = await readStore();
  const history: MessageParam[] = [...(store.chats[accountId] ?? [])];

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  if (!history.length) {
    // new conversation: start it with who we work for (append-only afterwards)
    content.push({ type: "text", text: `[Aktív cég – cégprofil]\n${JSON.stringify(await getCompany(accountId))}` });
  }
  for (const url of images) content.push(await claudeImageBlock(url));
  content.push({ type: "text", text: images.length ? `${userText}\n\n${images.map((u) => `[kép: ${u}]`).join("\n")}` : userText });
  const pending: MessageParam[] = [{ role: "user", content }];
  await logActivity("user", "chat", userText.length > 140 ? `${userText.slice(0, 140)}…` : userText);

  const commit = async () => {
    const msgs = pending.splice(0);
    history.push(...msgs);
    await updateStore((d) => void (d.chats[accountId] = [...(d.chats[accountId] ?? []), ...msgs]));
  };

  const { effectiveAi, modelFor, recordClaude } = await import("../ai-usage");
  const ai = await effectiveAi();
  if (ai.blocked) {
    emit({ type: "error", text: "A havi AI-keret elfogyott – a Beállítások → AI és költségek alatt emelheted, vagy válthatsz takarékos módra." });
    emit({ type: "done" });
    return;
  }
  // one model per conversation turn (thinking blocks and the cache are model-bound)
  const { model: MODEL, effort: EFFORT } = modelFor(ai.mode);

  let jsonRetries = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const compaction = !g.__ocpNoCompaction;
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: SYSTEM_PROMPT,
      tools: [...clientTools, ...serverTools],
      messages: [...history, ...pending],
      thinking: { type: "adaptive", display: "updates" },
      output_config: { effort: EFFORT },
      cache_control: { type: "ephemeral" },
      fallbacks: "default",
      ...(compaction ? { context_management: { edits: [{ type: "compact_20260112" as const }] } } : {}),
      betas: ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18", ...(compaction ? ["compact-2026-01-12" as const] : [])],
    });
    stream.on("text", (delta) => emit({ type: "text", text: delta }));
    stream.on("thinking", (delta) => delta && emit({ type: "tool_start", label: delta.trim() }));

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (compaction && err instanceof Anthropic.BadRequestError && /compact|context_management/i.test(err.message)) {
        console.warn("[ocp chat] compaction rejected, continuing without it:", err.message);
        g.__ocpNoCompaction = true;
        continue;
      }
      // Only an unparseable streamed tool input is retried; API errors bubble up.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }
    await recordClaude("chat", message.model ?? MODEL, message.usage).catch((e) => console.error("[ocp usage]", e));

    if (message.stop_reason === "refusal") {
      emit({ type: "error", text: "Ezt a kérést a modell nem tudta teljesíteni." });
      break;
    }

    pending.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "pause_turn") continue; // server tool (web search) wants to keep going

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
    );
    for (const b of message.content) {
      if (b.type === "server_tool_use") emit({ type: "tool_start", tool: b.name, label: toolLabel(b.name, b.input) });
    }
    if (!toolUses.length) {
      await commit();
      break;
    }
    if (message.stop_reason === "max_tokens") {
      pending.pop(); // never run tools on a truncated input
      emit({ type: "error", text: "A válasz túl hosszú lett, próbáld kisebb lépésekben." });
      break;
    }

    const results = await Promise.all(
      toolUses.map(async (t) => {
        const label = toolLabel(t.name, t.input);
        emit({ type: "tool_start", tool: t.name, label });
        const r = await runTool(t.name, t.input);
        emit({ type: "tool_end", tool: t.name, label, ok: r.ok, flag: r.flag });
        return {
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: r.content,
          is_error: !r.ok,
        };
      }),
    );
    pending.push({ role: "user", content: results });
    await commit();
  }
  emit({ type: "done" });
}

/** Displayable view of the active company's conversation. */
export async function chatTranscript() {
  const accountId = (await getProvider()).account.id;
  const chat = (await readStore()).chats[accountId] ?? [];
  const out: { role: "user" | "assistant"; text: string; images?: string[]; tools?: string[] }[] = [];
  for (const m of chat) {
    if (m.role === "user") {
      const blocks = typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content;
      if (blocks.every((b) => b.type === "tool_result")) continue;
      const text = blocks
        .flatMap((b) => (b.type === "text" && !b.text.startsWith("[Aktív cég") ? [b.text] : []))
        .join("\n");
      const images = [...text.matchAll(/\[kép: ([^\]]+)\]/g)].map((x) => x[1]);
      out.push({ role: "user", text: text.replace(/\n*\[kép: [^\]]+\]/g, "").trim(), images });
      continue;
    }
    if (typeof m.content === "string") continue;
    const text = m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const tools = m.content.flatMap((b) =>
      b.type === "tool_use" || b.type === "server_tool_use" ? [toolLabel(b.name, b.input)] : [],
    );
    const last = out[out.length - 1];
    if (last?.role === "assistant") {
      last.text += text;
      last.tools = [...(last.tools ?? []), ...tools];
    } else {
      out.push({ role: "assistant", text, tools });
    }
  }
  return out;
}

export async function resetChat() {
  const accountId = (await getProvider()).account.id;
  await updateStore((d) => void delete d.chats[accountId]);
}
