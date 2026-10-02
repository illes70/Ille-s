import { KnowledgeInput } from "@/lib/schemas";
import { newId, readStore, updateStore } from "@/lib/store";
import type { KnowledgeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const k = (await readStore()).knowledge;
  // own experience first
  return Response.json([...k.filter((e) => e.kind === "own"), ...k.filter((e) => e.kind !== "own")]);
}

export async function POST(req: Request) {
  const parsed = KnowledgeInput.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const entry: KnowledgeEntry = { id: newId("kb"), kind: "own", createdAt: new Date().toISOString(), ...parsed.data };
  await updateStore((d) => void d.knowledge.unshift(entry), ["knowledge"]);
  return Response.json(entry);
}
