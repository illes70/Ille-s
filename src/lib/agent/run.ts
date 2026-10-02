import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatTurnEvent } from "../types";
import { logActivity, readStore, updateStore } from "../store";
import { SYSTEM_PROMPT } from "./prompt";
import { clientTools, runTool, serverTools, toolLabel } from "./tools";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

const MODEL = process.env.OCP_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.OCP_EFFORT ?? "medium") as "low" | "medium" | "high";
const MAX_STEPS = 25;

const client = new Anthropic();

/**
 * Runs one user turn of the assistant: streams text + tool progress through `emit`,
 * executes client tools, and appends every completed step to the stored history
 * (append-only, so thinking blocks stay valid across turns).
 */
export async function runAgentTurn(userText: string, emit: (e: ChatTurnEvent) => void) {
  const store = await readStore();
  const history: MessageParam[] = [...store.chat];
  const pending: MessageParam[] = [{ role: "user", content: userText }];
  await logActivity("user", "chat", userText.length > 140 ? `${userText.slice(0, 140)}…` : userText);

  const commit = async () => {
    const msgs = pending.splice(0);
    history.push(...msgs);
    await updateStore((d) => void d.chat.push(...msgs));
  };

  let jsonRetries = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
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
      betas: ["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"],
    });
    stream.on("text", (delta) => emit({ type: "text", text: delta }));
    stream.on("thinking", (delta) => delta && emit({ type: "tool_start", label: delta.trim() }));

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only an unparseable streamed tool input is retried; API errors bubble up.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

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
        emit({ type: "tool_end", tool: t.name, label, ok: r.ok });
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

/** Text-only view of the stored conversation for rendering the chat. */
export async function chatTranscript() {
  const { chat } = await readStore();
  const out: { role: "user" | "assistant"; text: string; tools?: string[] }[] = [];
  for (const m of chat) {
    if (m.role === "user") {
      if (typeof m.content === "string") out.push({ role: "user", text: m.content });
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
