import { discoverAccounts } from "@/lib/live";
import { assignLink, claimAccount, MetaApiError } from "@/lib/meta/graph";
import { invalidateAccounts } from "@/lib/meta/provider";
import { logActivity } from "@/lib/store";

/** One click: assign the signed-in user to a Business Manager ad account, then load it. */
export async function POST(req: Request) {
  const { id, businessId, name } = (await req.json()) as { id?: string; businessId?: string; name?: string };
  if (!id || !businessId) return Response.json({ error: "Hiányzó fiók" }, { status: 400 });
  try {
    await claimAccount(id, businessId);
    invalidateAccounts();
    await logActivity("user", "action", `Hozzáférés beállítva: ${name ?? id}`);
    void discoverAccounts();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : String(err), link: assignLink(id, businessId) },
      { status: 400 },
    );
  }
}

/** "Kész, frissítés": look again after the user assigned themselves in Business Manager. */
export async function PUT() {
  await discoverAccounts();
  return Response.json({ ok: true });
}
