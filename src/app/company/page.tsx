"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import type { Company, MediaItem } from "@/lib/types";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePoll, usePollWithRefresh } from "@/components/usePoll";
import { timeAgo } from "@/lib/format";

interface CompanyResponse {
  company: Company;
  pages: { id: string; name: string }[];
  mode: "demo" | "meta";
}

export default function CompanyPage() {
  const data = usePoll<CompanyResponse>("/api/company");
  const [c, setC] = useState<Company>();
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [prefilling, setPrefilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load (and reload when the active company changes), but never overwrite unsaved edits of the same company
  useEffect(() => {
    if (data && (!c || c.accountId !== data.company.accountId)) setC(data.company);
  }, [data, c]);

  if (!c || !data) return <Page><p className="text-sm text-muted">Betöltés…</p></Page>;
  const set = (patch: Partial<Company>) => setC({ ...c, ...patch });

  async function save() {
    setSaving("saving");
    setError(null);
    const res = await fetch("/api/company", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    if (!res.ok) {
      setError((await res.json()).error ?? "Mentési hiba");
      setSaving("idle");
      return;
    }
    setC(await res.json());
    setSaving("saved");
    setTimeout(() => setSaving("idle"), 1800);
  }

  async function prefill() {
    setPrefilling(true);
    setError(null);
    const res = await fetch("/api/company", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: c?.pageId }) });
    const json = await res.json();
    if (res.ok) setC(json);
    else setError(json.error);
    setPrefilling(false);
  }

  return (
    <Page>
      <PageHeader
        title="Cégprofil"
        sub="Minden, amit az asszisztens a cégről tud. Ebből írja a szövegeket és készíti a képeket – cégenként külön."
        right={
          data.mode === "meta" ? (
            <button onClick={prefill} disabled={prefilling} className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium hover:border-accent/50 disabled:opacity-60">
              {prefilling ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Kitöltés a Facebook-oldalról
            </button>
          ) : null
        }
      />
      {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

      <div className="grid max-w-6xl items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card grid gap-4 p-6 sm:grid-cols-2">
            <Field label="Cégnév">
              <input className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Tevékenység">
              <input className="input" value={c.industry} onChange={(e) => set({ industry: e.target.value })} placeholder="pl. térkövezés, kerítésépítés" />
            </Field>
            <Field label="Telefonszám (a hirdetésekre)">
              <input className="input" value={c.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+36 30 …" />
            </Field>
            <Field label="Terület">
              <input className="input" value={c.area} onChange={(e) => set({ area: e.target.value })} placeholder="pl. Békés megye" />
            </Field>
            <Field label="Weboldal">
              <input className="input" value={c.website} onChange={(e) => set({ website: e.target.value })} />
            </Field>
            <Field label="Cél CPL (üresen: az alapértelmezett)">
              <input
                className="input"
                type="number"
                value={c.targetCpl ?? ""}
                onChange={(e) => set({ targetCpl: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
            <Field label="Napi költési plafon (felette minden hirdetést leállítok)">
              <input
                className="input"
                type="number"
                value={c.dailySpendCap ?? ""}
                placeholder="nincs plafon"
                onChange={(e) => set({ dailySpendCap: e.target.value ? Number(e.target.value) : undefined })}
              />
            </Field>
            {data.mode === "meta" && (
              <Field label="Facebook-oldal (hirdetések, instant formok)">
                <select className="input" value={c.pageId ?? ""} onChange={(e) => set({ pageId: e.target.value || undefined })}>
                  <option value="">Automatikus</option>
                  {data.pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Márkaszínek (kiemelő / sötét)">
              <div className="flex items-center gap-3">
                {[0, 1].map((i) => (
                  <input
                    key={i}
                    type="color"
                    value={c.colors[i]}
                    onChange={(e) => set({ colors: (i ? [c.colors[0], e.target.value] : [e.target.value, c.colors[1]]) as [string, string] })}
                    className="h-10 w-16 cursor-pointer rounded-lg border border-line bg-transparent"
                  />
                ))}
                <span className="h-10 flex-1 rounded-lg" style={{ background: `linear-gradient(135deg, ${c.colors[0]}, ${c.colors[1]})` }} />
              </div>
            </Field>
          </section>

          <section className="card p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Szolgáltatások és árak</h2>
              <button
                onClick={() => set({ services: [...c.services, { name: "", price: "" }] })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:text-fg"
              >
                <Plus size={13} /> Új sor
              </button>
            </div>
            <div className="space-y-2">
              {c.services.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="input min-w-0 flex-[3]"
                    value={s.name}
                    placeholder="Szolgáltatás"
                    onChange={(e) => set({ services: c.services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  />
                  <input
                    className="input min-w-0 flex-[2]"
                    value={s.price ?? ""}
                    placeholder="Ár, pl. 17 000 Ft/m²-től"
                    onChange={(e) => set({ services: c.services.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })}
                  />
                  <button onClick={() => set({ services: c.services.filter((_, j) => j !== i) })} className="rounded-lg px-2 text-muted hover:text-bad" aria-label="Törlés">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {!c.services.length && <p className="text-[13px] text-muted">Még nincs szolgáltatás. Az árak a hirdetésekben szűrnek és bizalmat építenek.</p>}
            </div>
          </section>

          <section className="card grid gap-4 p-6">
            <Field label="Miért őket? (garancia, gyorsaság, vélemények, darabszámok)">
              <textarea rows={3} className="input resize-y" value={c.usp} onChange={(e) => set({ usp: e.target.value })} />
            </Field>
            <Field label="Hangnem – így írjon az asszisztens">
              <textarea rows={2} className="input resize-y" value={c.brandVoice} onChange={(e) => set({ brandVoice: e.target.value })} />
            </Field>
            <Field label="Megjegyzések (amit nem vállalnak, szűrők, ügyfél kérései)">
              <textarea rows={3} className="input resize-y" value={c.notes} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </section>

          <div className="sticky bottom-4 flex justify-end">
            <button onClick={save} disabled={saving === "saving"} className="inline-flex items-center gap-2 rounded-xl bg-fg px-5 py-2.5 text-sm font-semibold text-bg shadow-lg disabled:opacity-60">
              {saving === "saving" ? <Loader2 size={16} className="animate-spin" /> : saving === "saved" ? <Check size={16} /> : null}
              {saving === "saved" ? "Elmentve" : "Mentés"}
            </button>
          </div>
        </div>

        <MediaLibrary />
      </div>
    </Page>
  );
}

function MediaLibrary() {
  const [media, reload] = usePollWithRefresh<MediaItem[]>("/api/media");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  async function upload(files: FileList) {
    setBusy(true);
    for (const f of [...files].filter((x) => x.type.startsWith("image/") || x.type.startsWith("video/"))) {
      const body = new FormData();
      body.append("file", f);
      await fetch("/api/media", { method: "POST", body });
    }
    setBusy(false);
    reload();
  }

  const KIND = { upload: "Feltöltött", generated: "AI fotó", composed: "Hirdetéskép" } as const;

  return (
    <section className="card p-5 lg:sticky lg:top-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Képtár</h2>
        <input ref={ref} type="file" accept="image/*,video/mp4,video/quicktime" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        <button onClick={() => ref.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Feltöltés
        </button>
      </div>
      <p className="mb-4 text-[13px] text-muted">
        Munkafotók, videók, logó, előtte/utána képek. Az asszisztens ezekből készít hirdetést – a chatben hivatkozhatsz rájuk.
      </p>
      {!media ? (
        <p className="text-sm text-muted">Betöltés…</p>
      ) : !media.length ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-muted">Még nincs kép.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {media.slice(0, 30).map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-lg border border-line" title={`${KIND[m.kind]} · ${timeAgo(m.createdAt)}`}>
              {/\.(mp4|mov)$/.test(m.file) ? (
                <video src={m.url} muted playsInline className="aspect-square w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="aspect-square w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              )}
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{KIND[m.kind]}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}
