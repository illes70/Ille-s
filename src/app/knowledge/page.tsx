"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ExternalLink, Loader2, Plus, Trash2, UserRound, BookMarked } from "lucide-react";
import type { KnowledgeEntry } from "@/lib/types";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePollWithRefresh } from "@/components/usePoll";

// Optional sources the user can read and paste from (licences differ – we don't copy them in).
const SOURCES = [
  { name: "hormozi-skills (ajánlatépítő skill-könyvtár)", url: "https://github.com/alexsmedile/hormozi-skills" },
  { name: "founder-playbook: $100M Offers skill", url: "https://github.com/getagentseal/founder-playbook/blob/main/100m-offers/SKILL.md" },
  { name: "founder-playbook: $100M Leads skill", url: "https://github.com/getagentseal/founder-playbook/blob/main/100m-leads/SKILL.md" },
  { name: "alex-hormozi-gtm-skills", url: "https://github.com/andrescala/alex-hormozi-gtm-skills" },
];

export default function KnowledgePage() {
  const [entries, reload] = usePollWithRefresh<KnowledgeEntry[]>("/api/knowledge");
  const [draft, setDraft] = useState({ title: "", body: "", tags: "" });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "own" | "playbook">("all");
  const [q, setQ] = useState("");

  const shown = (entries ?? []).filter(
    (e) =>
      (filter === "all" || e.kind === filter) &&
      (!q || `${e.title} ${e.body} ${e.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())),
  );

  async function add() {
    setSaving(true);
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draft.title, body: draft.body, tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    });
    setSaving(false);
    setDraft({ title: "", body: "", tags: "" });
    setOpen(false);
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Biztosan törlöd ezt a bejegyzést?")) return;
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <Page>
      <PageHeader
        title="Tudásbázis"
        sub="Ebből dönt és javasol az asszisztens. A saját tapasztalataid mindig előbbre valók a kézikönyvnél."
        right={
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg">
            <Plus size={15} /> Saját tapasztalat
          </button>
        }
      />

      {open && (
        <section className="card mb-6 max-w-3xl space-y-3 p-5">
          <input className="input" placeholder="Cím – pl. „Térkövezésnél az ár a képen mindig nyer”" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <textarea
            rows={6}
            className="input resize-y"
            placeholder="Mit tapasztaltál, mikor igaz, mit csináljon ilyenkor az asszisztens? Ide beillesztheted a régi Claude-beszélgetéseid tanulságait is."
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <input className="input" placeholder="Címkék vesszővel – pl. kreatív, térkövezés, ár" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm text-muted">
              Mégse
            </button>
            <button onClick={add} disabled={saving || !draft.title.trim() || !draft.body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-fg px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
              {saving && <Loader2 size={14} className="animate-spin" />} Mentés
            </button>
          </div>
        </section>
      )}

      <div className="grid max-w-6xl items-start gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "Mind"],
                ["own", "Saját tapasztalat"],
                ["playbook", "Kézikönyv"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Keresés…" className="input ml-auto max-w-[220px] py-1.5" />
          </div>

          {!entries ? (
            <p className="text-sm text-muted">Betöltés…</p>
          ) : (
            <div className="space-y-3">
              {shown.map((e) => (
                <details key={e.id} className="card group p-0">
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
                    <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${e.kind === "own" ? "bg-good-soft text-good" : "bg-accent-soft text-accent"}`}>
                      {e.kind === "own" ? <UserRound size={14} /> : <BookMarked size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{e.title}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {e.tags.map((t) => (
                          <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                            {t}
                          </span>
                        ))}
                      </span>
                    </span>
                    {e.kind === "own" && (
                      <button
                        onClick={(ev) => {
                          ev.preventDefault();
                          void remove(e.id);
                        }}
                        className="rounded-lg p-1 text-muted hover:text-bad"
                        aria-label="Törlés"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </summary>
                  <div className="prose-ocp border-t border-line px-4 py-3 pl-14 text-[13px] leading-relaxed">
                    <ReactMarkdown>{e.body}</ReactMarkdown>
                    {e.source && <p className="text-[11px] text-muted">Forrás: {e.source}</p>}
                  </div>
                </details>
              ))}
              {!shown.length && <p className="card p-5 text-sm text-muted">Nincs találat.</p>}
            </div>
          )}
        </div>

        <aside className="card p-5 lg:sticky lg:top-6">
          <h2 className="mb-2 text-sm font-semibold">Honnan tanul még?</h2>
          <p className="mb-3 text-[13px] text-muted">
            Nyílt forrású Hormozi-alapú skillek. Olvasd át, és ami tetszik, illeszd be saját tapasztalatként – vagy írd a chatbe: „jegyezd meg, hogy…”.
          </p>
          <ul className="space-y-2">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 text-[13px] text-accent hover:underline">
                  <ExternalLink size={12} className="mt-1 shrink-0" /> {s.name}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Page>
  );
}
