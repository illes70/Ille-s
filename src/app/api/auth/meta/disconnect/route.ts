import { logActivity, updateStore } from "@/lib/store";
import { adsCache } from "@/lib/live-bus";
import { invalidateAccounts } from "@/lib/meta/provider";

export async function POST() {
  await updateStore((d) => {
    d.metaAuth = undefined;
    d.activeAccountId = undefined;
  }, ["accounts", "ads", "leads", "health"]);
  adsCache.clear();
  invalidateAccounts();
  await logActivity("user", "action", "Facebook-kapcsolat bontva – demó mód.");
  return Response.json({ ok: true });
}
