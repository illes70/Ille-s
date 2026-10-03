import { cookies } from "next/headers";
import { completeLogin } from "@/lib/meta/oauth";
import { logActivity, updateStore } from "@/lib/store";
import { adsCache } from "@/lib/live-bus";
import { startFullSync } from "@/lib/live";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("ocp_meta_state")?.value;
  jar.delete("ocp_meta_state");
  if (url.searchParams.get("error")) return Response.redirect(`${url.origin}/settings?meta=denied`, 302);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    return Response.redirect(`${url.origin}/settings?meta=bad_state`, 302);
  }
  try {
    const auth = await completeLogin(code, url.origin);
    await updateStore(
      (d) => {
        d.metaAuth = auth;
        d.activeAccountId = undefined;
        // fresh start with real data: drop the demo chat history
        d.chats = {};
      },
      ["accounts", "ads", "leads", "health", "company", "overview"],
    );
    adsCache.clear();
    const subscribed = auth.pages.filter((p) => p.leadgenSubscribed).length;
    await logActivity(
      "system",
      "action",
      `Facebook csatlakoztatva (${auth.userName}): ${auth.pages.length} oldal, ebből ${subscribed} azonnali leadekkel.`,
    );
    // numbers for every account in ~1-2 s, ads and images stream in after that
    startFullSync();
    return Response.redirect(`${url.origin}/overview?connected=1`, 302);
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : String(err));
    return Response.redirect(`${url.origin}/settings?meta=error&msg=${msg}`, 302);
  }
}
