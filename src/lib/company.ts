import "server-only";
import type { Company, KnowledgeEntry } from "./types";
import { readStore, updateStore } from "./store";
import { getProvider } from "./meta/provider";

/** Company profile of an ad account (an empty profile named after the account if none yet). */
export async function getCompany(accountId?: string): Promise<Company> {
  const provider = await getProvider(accountId);
  const store = await readStore();
  return (
    store.companies[provider.account.id] ?? {
      accountId: provider.account.id,
      name: provider.account.name,
      industry: "",
      services: [],
      phone: "",
      area: "",
      website: "",
      usp: "",
      brandVoice: "Közvetlen, tegeződő, rövid mondatok, konkrét előny az első sorban.",
      colors: ["#16a34a", "#14532d"],
      notes: "",
      updatedAt: new Date(0).toISOString(),
    }
  );
}

export async function saveCompany(patch: Partial<Company> & { accountId: string }) {
  const current = await getCompany(patch.accountId);
  const next: Company = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await updateStore((d) => void (d.companies[next.accountId] = next), ["company"]);
  return next;
}

/** Fill empty profile fields from the company's Facebook Page. */
export async function prefillFromPage(accountId: string, pageId?: string) {
  const { pageDetails, metaPages } = await import("./meta/graph");
  const company = await getCompany(accountId);
  const id = pageId ?? company.pageId ?? (await metaPages())[0]?.id;
  if (!id) throw new Error("Nincs kiválasztható Facebook-oldal.");
  const p = await pageDetails(id);
  return saveCompany({
    accountId,
    pageId: id,
    name: company.name || p.name,
    industry: company.industry || p.category || "",
    phone: company.phone || p.phone || "",
    website: company.website || p.website || "",
    area: company.area || p.single_line_address || "",
    usp: company.usp || p.about || "",
    logoUrl: company.logoUrl ?? p.picture?.data.url,
  });
}

/** Keyword search; the user's own experience ranks above the playbook. */
export async function searchKnowledge(query: string, limit = 6): Promise<KnowledgeEntry[]> {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2);
  const entries = (await readStore()).knowledge;
  const scored = entries.map((e) => {
    const hay = `${e.title} ${e.tags.join(" ")} ${e.body}`.toLowerCase();
    const title = `${e.title} ${e.tags.join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      const stem = w.slice(0, Math.max(4, w.length - 2)); // rough Hungarian suffix tolerance
      if (title.includes(stem)) score += 3;
      else if (hay.includes(stem)) score += 1;
    }
    if (e.kind === "own") score *= 1.5;
    return { e, score };
  });
  const hits = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length ? hits : scored.filter((x) => x.e.kind === "own")).slice(0, limit).map((x) => x.e);
}
