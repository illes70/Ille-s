import { logActivity, updateStore } from "@/lib/store";
import { adsCacheOf } from "@/lib/live-bus";
import { currentTenant } from "@/lib/tenant";
import { invalidateAccounts } from "@/lib/meta/provider";

export async function POST() {
  await updateStore((d) => {
    d.metaAuth = undefined;
    d.activeAccountId = undefined;
  }, ["accounts", "ads", "leads", "health"]);
  adsCacheOf(await currentTenant()).clear();
  await invalidateAccounts();
  await logActivity("user", "action", "Facebook-kapcsolat bontva – demó mód.");
  return Response.json({ ok: true });
}
