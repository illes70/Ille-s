import { cookies } from "next/headers";
import { completeLogin } from "@/lib/meta/oauth";
import { logActivity, updateStore } from "@/lib/store";
import { adsCacheOf } from "@/lib/live-bus";
import { currentTenant } from "@/lib/tenant";
import { invalidateAccounts } from "@/lib/meta/provider";
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
    const firstConnect = await updateStore(
      (d) => {
        const first = !d.metaAuth;
        // real money from now on: the autopilot starts in "always ask" – the user turns it up
        if (first) d.settings.autopilot.level = "ask";
        d.metaAuth = auth;
        d.activeAccountId = undefined;
        // fresh start with real data: drop the demo chat history
        d.chats = {};
        return first;
      },
      ["accounts", "ads", "leads", "health", "company", "overview"],
    );
    adsCacheOf(await currentTenant()).clear();
    await invalidateAccounts();
    const subscribed = auth.pages.filter((p) => p.leadgenSubscribed).length;
    await logActivity(
      "system",
      "action",
      `Facebook csatlakoztatva (${auth.userName}): ${auth.pages.length} oldal${subscribed ? `, ebből ${subscribed} azonnali leadekkel` : ""}.${firstConnect ? " A robotpilóta „mindig kérdez” módban indul – a Beállításokban lazíthatsz rajta." : ""}`,
    );
    // numbers for every account in ~1-2 s, ads and images stream in after that
    await startFullSync();
    return Response.redirect(`${url.origin}/overview?connected=1`, 302);
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : String(err));
    return Response.redirect(`${url.origin}/settings?meta=error&msg=${msg}`, 302);
  }
}
