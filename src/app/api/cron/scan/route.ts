import { runScan } from "@/lib/engine/monitor";
import { runAsTenant } from "@/lib/tenant";
import { listTenants } from "@/lib/users";

export const dynamic = "force-dynamic";

// Optional external trigger (the built-in 0-24 engine already scans on its own).
// Call with `Authorization: Bearer $CRON_SECRET`; scans every workspace.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = [];
  for (const t of await listTenants()) results.push(await runAsTenant(t, () => runScan("cron").catch((e) => ({ error: String(e) }))));
  return Response.json({ workspaces: results.length, results });
}
