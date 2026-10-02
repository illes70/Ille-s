import "server-only";
import type { MetaAuth, MetaPage } from "../types";
import { GRAPH_VERSION, all, graph } from "./graph";

// One-click connect: Facebook Login → long-lived token → pages + leadgen webhook subscription.

export const META_SCOPES = [
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_ads",
  "pages_manage_metadata",
  "leads_retrieval",
];

export function appCredentials() {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

export const redirectUri = (origin: string) => `${process.env.OCP_PUBLIC_URL ?? origin}/api/auth/meta/callback`;

export function loginUrl(origin: string, state: string) {
  const app = appCredentials()!;
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", app.id);
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", state);
  u.searchParams.set("scope", META_SCOPES.join(","));
  return u.toString();
}

/** code → short-lived token → long-lived (≈60 day) token, pages, and webhook subscriptions. */
export async function completeLogin(code: string, origin: string): Promise<MetaAuth> {
  const app = appCredentials()!;
  const short = await graph<{ access_token: string }>("oauth/access_token", {
    noAuth: true,
    params: { client_id: app.id, client_secret: app.secret, redirect_uri: redirectUri(origin), code },
  });
  const long = await graph<{ access_token: string; expires_in?: number }>("oauth/access_token", {
    noAuth: true,
    params: { grant_type: "fb_exchange_token", client_id: app.id, client_secret: app.secret, fb_exchange_token: short.access_token },
  });
  const token = long.access_token;
  const [me, perms, pages] = await Promise.all([
    graph<{ id: string; name: string }>("me", { token, params: { fields: "id,name" } }),
    graph<{ data: { permission: string; status: string }[] }>("me/permissions", { token }),
    all<{ id: string; name: string; access_token: string }>("me/accounts", { fields: "id,name,access_token", limit: "100" }, 500, token),
  ]);
  const withSubs: MetaPage[] = [];
  for (const p of pages) withSubs.push({ id: p.id, name: p.name, token: p.access_token, leadgenSubscribed: await subscribeLeadgen(p.id, p.access_token) });
  return {
    userId: me.id,
    userName: me.name,
    token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : undefined,
    scopes: perms.data.filter((x) => x.status === "granted").map((x) => x.permission),
    pages: withSubs,
    connectedAt: new Date().toISOString(),
  };
}

/** Subscribes the app to the page's leadgen events (instant leads via /api/webhooks/meta). */
export async function subscribeLeadgen(pageId: string, pageToken: string): Promise<boolean> {
  try {
    await graph(`${pageId}/subscribed_apps`, { method: "POST", token: pageToken, params: { subscribed_fields: "leadgen" } });
    return true;
  } catch {
    return false;
  }
}
