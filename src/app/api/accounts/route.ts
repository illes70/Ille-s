import { getProvider, listAccounts } from "@/lib/meta/provider";
import { logActivity, updateStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = await getProvider();
    return Response.json({ mode: provider.mode, active: provider.account, accounts: await listAccounts() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const { id } = (await req.json()) as { id?: string };
  const account = (await listAccounts()).find((a) => a.id === id);
  if (!account) return Response.json({ error: "Nincs ilyen fiók" }, { status: 404 });
  await updateStore((d) => void (d.activeAccountId = account.id));
  await logActivity("user", "action", `Fiók váltás: ${account.name}`);
  return Response.json(account);
}
