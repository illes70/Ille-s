"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, ImagePlus, Loader2, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import type { ChatTurnEvent, LiveKey, MediaItem } from "@/lib/types";
import { refreshAll, usePoll } from "./usePoll";
import { BriefCard } from "./BriefCard";
import { PendingPlans } from "./PlanCard";

interface Step {
  label: string;
  state: "run" | "ok" | "err" | "note" | "warn";
  note?: string;
}
interface Msg {
  role: "user" | "assistant";
  text: string;
  images?: string[];
  steps?: Step[];
  error?: string;
}

type Transcript = { role: Msg["role"]; text: string; images?: string[]; tools?: string[] }[];

const SUGGESTIONS = [
  "Mi történt az elmúlt 7 napban? Mit csinálnál ma?",
  "Melyik hirdetést állítanád le és miért?",
  "Csinálj 5 új variánst a legjobb hirdetés alapján, töltsd fel szüneteltetve.",
  "Készíts egy zöld dobozos hirdetésképet a cégprofil alapján.",
  "Készíts egy rövid instant formot felméréskéréshez.",
  "Valami nem működik – nézd meg a rendszerállapotot.",
];

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const company = usePoll<{ company: { name: string } }>("/api/company");

  // each company has its own conversation: reload it when the account changes
  useEffect(() => {
    const load = () =>
      fetch("/api/chat")
        .then((r) => r.json())
        .then((t: Transcript) =>
          setMsgs(t.map((m) => ({ role: m.role, text: m.text, images: m.images, steps: m.tools?.map((label) => ({ label, state: "ok" as const })) }))),
        )
        .catch(() => undefined);
    load();
    const onInvalidate = (e: Event) => (e as CustomEvent<LiveKey[]>).detail.includes("accounts") && !busyRef.current && load();
    const onReload = () => !busyRef.current && load();
    window.addEventListener("ocp:invalidate", onInvalidate);
    window.addEventListener("ocp:chat-reload", onReload);
    return () => {
      window.removeEventListener("ocp:invalidate", onInvalidate);
      window.removeEventListener("ocp:chat-reload", onReload);
    };
  }, []);
  const busyRef = useRef(false);
  busyRef.current = busy;

  async function upload(files: FileList | File[]) {
    const images = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 6);
    if (!images.length) return;
    setUploading(true);
    for (const f of images) {
      const body = new FormData();
      body.append("file", f);
      const res = await fetch("/api/media", { method: "POST", body });
      const item = (await res.json()) as MediaItem & { error?: string };
      if (res.ok) setAttachments((a) => [...a, item.url].slice(0, 6));
      else alert(item.error ?? "Feltöltési hiba");
    }
    setUploading(false);
    taRef.current?.focus();
  }

  // ?q=… prefills the input (used by "Kérdezd az asszisztenst" buttons)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setInput(q);
      window.history.replaceState(null, "", "/");
      taRef.current?.focus();
    }
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs]);

  function patchLast(fn: (m: Msg) => Msg) {
    setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
  }

  async function send(text: string) {
    const message = text.trim();
    const images = attachments;
    if ((!message && !images.length) || busy || uploading) return;
    setInput("");
    setAttachments([]);
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: message, images }, { role: "assistant", text: "", steps: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, images }),
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
        if (i >= 0)
          steps[i] = {
            ...steps[i],
            state: !e.ok ? "err" : e.flag ? "warn" : "ok",
            note: e.flag === "confirm" ? "megerősítésre vár" : e.flag === "refused" ? "nem engedélyezett" : undefined,
          };
        return { ...m, steps };
      });
      refreshAll();
    }
    if (e.type === "plan") refreshAll();
  }

  async function reset() {
    await fetch("/api/chat", { method: "DELETE" });
    setMsgs([]);
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/80 text-sm font-medium text-accent">
          Engedd el a képet a csatoláshoz
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 md:px-8">
        <div className="mx-auto max-w-3xl py-6">
          <BriefCard onAsk={(t) => void send(t)} />
          {msgs.length === 0 ? (
            <Welcome onPick={send} company={company?.company.name} />
          ) : (
            <div className="space-y-6">
              {msgs.map((m, i) => (
                <Bubble key={i} m={m} streaming={busy && i === msgs.length - 1} />
              ))}
            </div>
          )}
          <div className="mt-6">
            <PendingPlans />
          </div>
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-line bg-bg/80 px-4 py-3 backdrop-blur md:px-8">
        <form
          className="card mx-auto max-w-3xl p-2 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {(attachments.length > 0 || uploading) && (
            <div className="flex flex-wrap gap-2 px-1 pt-1 pb-2">
              {attachments.map((url) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-16 rounded-lg border border-line object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachments((a) => a.filter((x) => x !== url))}
                    className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-fg text-bg"
                    aria-label="Eltávolítás"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="grid size-16 place-items-center rounded-lg border border-dashed border-line">
                  <Loader2 size={16} className="animate-spin text-muted" />
                </div>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
          <button type="button" onClick={() => fileRef.current?.click()} title="Kép csatolása" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg">
            <ImagePlus size={18} />
          </button>
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
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              if (files.length) {
                e.preventDefault();
                void upload(files);
              }
            }}
            placeholder={company ? `Mit csináljak a(z) ${company.company.name} hirdetéseivel?` : "Írd le, mit csináljak…"}
            className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted"
          />
          {msgs.length > 0 && !busy && (
            <button type="button" onClick={reset} title="Új beszélgetés" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg">
              <RotateCcw size={18} />
            </button>
          )}
          <button
            type="submit"
            disabled={busy || uploading || (!input.trim() && !attachments.length)}
            className="grid size-9 place-items-center rounded-lg bg-fg text-bg transition-opacity disabled:opacity-30"
            aria-label="Küldés"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
          </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Welcome({ onPick, company }: { onPick: (t: string) => void; company?: string }) {
  return (
    <div className="pt-10 md:pt-20">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
        <Sparkles size={13} /> {company ? `${company} · az asszisztensed figyel` : "Az asszisztensed figyel"}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Miben segíthetek ma?</h1>
      <p className="mt-2 max-w-xl text-muted">
        Hirdetések, szövegek, képek, büdzsé, instant formok, leadek: írd le, mit szeretnél, és megcsinálom. Képet is
        behúzhatsz vagy beilleszthetsz. Ha valamit magamtól javaslok, az a Javaslatok fülre kerül.
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
  // approvals by button show as a quiet system note
  if (m.role === "user" && m.text.startsWith("[OCP]")) {
    return <p className="mx-auto max-w-[90%] rounded-xl bg-surface-2 px-4 py-2 text-xs whitespace-pre-wrap text-muted">{m.text.replace(/^\[OCP\]\s*/, "")}</p>;
  }
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-2">
          {!!m.images?.length && (
            <div className="flex flex-wrap justify-end gap-2">
              {m.images.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="max-h-48 rounded-xl border border-line object-cover" />
                </a>
              ))}
            </div>
          )}
          {m.text && <div className="rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[15px] whitespace-pre-wrap text-bg">{m.text}</div>}
        </div>
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
                {s.state === "warn" && <TriangleAlert size={13} className="text-warn" />}
                {s.state === "note" && <span className="mx-[3px] size-1.5 rounded-full bg-muted/60" />}
                <span className={s.state === "note" ? "italic" : ""}>{s.label}</span>
                {s.note && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">{s.note}</span>}
              </li>
            ))}
          </ul>
        )}
        {m.text ? (
          <div className="prose-ocp text-[15px] leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ src, alt }) =>
                  typeof src === "string" ? (
                    <a href={src} target="_blank" rel="noreferrer" className="inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={alt ?? ""} className="my-1 max-h-[420px] rounded-xl border border-line" />
                    </a>
                  ) : null,
                a: ({ href, children }) => (
                  <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {m.text}
            </ReactMarkdown>
          </div>
        ) : (
          streaming && !m.steps?.length && <Loader2 size={16} className="animate-spin text-muted" />
        )}
        {m.error && <p className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{m.error}</p>}
      </div>
    </div>
  );
}
