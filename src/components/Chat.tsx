"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import type { ChatTurnEvent } from "@/lib/types";
import { refreshAll } from "./usePoll";

interface Step {
  label: string;
  state: "run" | "ok" | "err" | "note";
}
interface Msg {
  role: "user" | "assistant";
  text: string;
  steps?: Step[];
  error?: string;
}

const SUGGESTIONS = [
  "Mi történt az elmúlt 7 napban? Mit csinálnál ma?",
  "Melyik hirdetést állítanád le és miért?",
  "Csinálj 5 új variánst a legjobb hirdetés alapján, töltsd fel szüneteltetve.",
  "Készíts egy rövid instant formot felméréskéréshez.",
];

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((t: { role: Msg["role"]; text: string; tools?: string[] }[]) =>
        setMsgs(t.map((m) => ({ role: m.role, text: m.text, steps: m.tools?.map((label) => ({ label, state: "ok" as const })) }))),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs]);

  function patchLast(fn: (m: Msg) => Msg) {
    setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "", steps: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.body) throw new Error("Nincs válasz a szervertől.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          handle(JSON.parse(line) as ChatTurnEvent);
        }
      }
    } catch (e) {
      patchLast((m) => ({ ...m, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
      refreshAll();
    }
  }

  function handle(e: ChatTurnEvent) {
    if (e.type === "text") patchLast((m) => ({ ...m, text: m.text + (e.text ?? "") }));
    if (e.type === "error") patchLast((m) => ({ ...m, error: e.text }));
    if (e.type === "tool_start" && e.label) {
      const step: Step = { label: e.label, state: e.tool ? "run" : "note" };
      patchLast((m) => ({ ...m, steps: [...(m.steps ?? []), step] }));
    }
    if (e.type === "tool_end") {
      patchLast((m) => {
        const steps = [...(m.steps ?? [])];
        const i = steps.findIndex((s) => s.state === "run" && s.label === e.label);
        if (i >= 0) steps[i] = { ...steps[i], state: e.ok ? "ok" : "err" };
        return { ...m, steps };
      });
      refreshAll();
    }
  }

  async function reset() {
    await fetch("/api/chat", { method: "DELETE" });
    setMsgs([]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 md:px-8">
        <div className="mx-auto max-w-3xl py-6">
          {msgs.length === 0 ? (
            <Welcome onPick={send} />
          ) : (
            <div className="space-y-6">
              {msgs.map((m, i) => (
                <Bubble key={i} m={m} streaming={busy && i === msgs.length - 1} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-line bg-bg/80 px-4 py-3 backdrop-blur md:px-8">
        <form
          className="card mx-auto flex max-w-3xl items-end gap-2 p-2 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Írd le, mit csináljak…"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted"
          />
          {msgs.length > 0 && !busy && (
            <button type="button" onClick={reset} title="Új beszélgetés" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg">
              <RotateCcw size={18} />
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="grid size-9 place-items-center rounded-lg bg-fg text-bg transition-opacity disabled:opacity-30"
            aria-label="Küldés"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  return (
    <div className="pt-10 md:pt-20">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
        <Sparkles size={13} /> Az asszisztensed figyel
      </div>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Miben segíthetek ma?</h1>
      <p className="mt-2 max-w-xl text-muted">
        Hirdetések, szövegek, büdzsé, instant formok, leadek: írd le, mit szeretnél, és megcsinálom. Ha valamit magamtól
        javaslok, az a Javaslatok fülre kerül, ott jóváhagyhatod.
      </p>
      <div className="mt-8 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="card px-4 py-3 text-left text-sm transition-colors hover:border-accent/50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ m, streaming }: { m: Msg; streaming: boolean }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[15px] whitespace-pre-wrap text-bg">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-fg text-[10px] font-bold text-bg">OCP</span>
      <div className="min-w-0 flex-1">
        {!!m.steps?.length && (
          <ul className="mb-3 space-y-1">
            {m.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-muted">
                {s.state === "run" && <Loader2 size={13} className="animate-spin text-accent" />}
                {s.state === "ok" && <Check size={13} className="text-good" />}
                {s.state === "err" && <X size={13} className="text-bad" />}
                {s.state === "note" && <span className="mx-[3px] size-1.5 rounded-full bg-muted/60" />}
                <span className={s.state === "note" ? "italic" : ""}>{s.label}</span>
              </li>
            ))}
          </ul>
        )}
        {m.text ? (
          <div className="prose-ocp text-[15px] leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
          </div>
        ) : (
          streaming && !m.steps?.length && <Loader2 size={16} className="animate-spin text-muted" />
        )}
        {m.error && <p className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{m.error}</p>}
      </div>
    </div>
  );
}
