"use client";

import Link from "next/link";
import { Lock, Pencil, Sparkles, UserCheck } from "lucide-react";
import type { Ad, Recipe } from "@/lib/types";
import { fmtMoney, fmtNum } from "@/lib/format";
import { CreativePreview } from "@/components/AdCard";
import { Page, PageHeader } from "@/components/PageHeader";
import { usePoll } from "@/components/usePoll";

type RecipeRow = Recipe & { example: Ad | null; adCount: number; spend: number; leads: number };

export default function RecipesPage() {
  const recipes = usePoll<RecipeRow[]>("/api/recipes", 60_000);
  const accounts = usePoll<{ active: { currency: string } }>("/api/accounts", 120_000);
  const cur = accounts?.active.currency ?? "HUF";

  return (
    <Page>
      <PageHeader
        title="Receptek"
        sub="Bevált hirdetésformák. Az asszisztens ezek alapján gyárt új kreatívot bármelyik ajánlatra."
      />
      {!recipes ? (
        <p className="text-sm text-muted">Betöltés…</p>
      ) : (
        <div className="space-y-6">
          {recipes.map((r) => {
            const cpl = r.leads ? r.spend / r.leads : null;
            const use = encodeURIComponent(`Készíts 3 új hirdetést a „${r.name}” recept alapján (${r.id}), és töltsd fel szüneteltetve.`);
            const edit = encodeURIComponent(`Szeretném módosítani a „${r.name}” receptet (${r.id}): `);
            return (
              <article key={r.id} className="card overflow-hidden">
                <div className="grid gap-6 p-5 md:grid-cols-[200px_1fr] md:p-6">
                  <div>
                    {r.example ? (
                      <CreativePreview ad={r.example} className="rounded-xl" />
                    ) : (
                      <div className="aspect-[4/5] rounded-xl" style={{ background: `linear-gradient(135deg, ${r.palette[0]}, ${r.palette[1]})` }} />
                    )}
                    <dl className="tabular mt-3 grid grid-cols-3 gap-2 text-[12px]">
                      <Mini label="Hirdetés" value={fmtNum(r.adCount)} />
                      <Mini label="Lead (7n)" value={fmtNum(r.leads)} />
                      <Mini label="CPL" value={cpl === null ? "–" : fmtMoney(cpl, cur)} />
                    </dl>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold tracking-tight">{r.name}</h2>
                        <p className="mt-1 max-w-2xl text-[13px] text-muted">{r.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/?q=${edit}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[13px] font-medium hover:border-accent/50">
                          <Pencil size={14} /> Szerkesztés az asszisztenssel
                        </Link>
                        <Link href={`/?q=${use}`} className="inline-flex items-center gap-1.5 rounded-xl bg-good px-3 py-2 text-[13px] font-semibold text-white">
                          <Sparkles size={14} /> Használd
                        </Link>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                      <Rules icon={<Lock size={14} />} title="Nem változhat" items={r.fixed} tone="text-bad" />
                      <Rules icon={<UserCheck size={14} />} title="Kötelező, az ajánlatra igazítva" items={r.required} tone="text-warn" />
                      <Rules icon={<Pencil size={14} />} title="Szabad" items={r.free} tone="text-good" />
                    </div>
                    <div className="mt-4 rounded-xl border border-dashed border-line bg-surface-2/60 p-3">
                      <p className="text-[11px] text-muted">Szövegsablon</p>
                      <p className="mt-1 text-[13px] whitespace-pre-wrap">{r.textTemplate}</p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          <p className="text-[13px] text-muted">
            Új receptet a chatben menthetsz: „Mentsd el receptként a legjobb hirdetésünket.”
          </p>
        </div>
      )}
    </Page>
  );
}

function Rules({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: string }) {
  return (
    <div>
      <p className={`mb-2 flex items-center gap-1.5 text-[13px] font-semibold ${tone}`}>
        {icon} <span className="text-fg">{title}</span>
      </p>
      <ul className="space-y-1.5 text-[13px] text-muted">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
            <span>{x}</span>
          </li>
        ))}
        {!items.length && <li>–</li>}
      </ul>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
    </div>
  );
}
