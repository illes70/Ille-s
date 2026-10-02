import { logActivity, updateStore } from "@/lib/store";
import { adsCache } from "@/lib/live-bus";

export async function POST() {
  await updateStore((d) => {
    d.metaAuth = undefined;
    d.activeAccountId = undefined;
  }, ["accounts", "ads", "leads", "health"]);
  adsCache.clear();
  await logActivity("user", "action", "Facebook-kapcsolat bontva – demó mód.");
  return Response.json({ ok: true });
}
