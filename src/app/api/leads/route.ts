import { getLeads } from "@/lib/meta/provider";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Leads of the active account, or ?scope=all: every lead of the workspace (all pages, all accounts). */
export async function GET(req: Request) {
  try {
    if (new URL(req.url).searchParams.get("scope") === "all") {
      const store = await readStore();
      return Response.json(
        store.leads
          .map((l) => ({ ...l, status: store.leadStatus?.[l.id] ?? l.status ?? "new" }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    }
    return Response.json(await getLeads());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
