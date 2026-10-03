import "server-only";
import { AsyncLocalStorage } from "async_hooks";
import path from "path";
import { SESSION_COOKIE, verifySession } from "./auth";
import { DATA_DIR, getUser, ownerTenant, tenantOf } from "./users";

// Which workspace the current code runs for.
// - Requests: resolved from the session cookie.
// - Background work (poller, webhooks, cron): set explicitly with runAsTenant().

const g = globalThis as unknown as { __ocpTenantAls?: AsyncLocalStorage<string> };
const als = (g.__ocpTenantAls ??= new AsyncLocalStorage<string>());

export class NoTenantError extends Error {
  constructor() {
    super("Belépés szükséges");
  }
}

export function runAsTenant<T>(tenantId: string, fn: () => T): T {
  return als.run(tenantId, fn);
}

export async function currentTenant(): Promise<string> {
  const fromContext = als.getStore();
  if (fromContext) return fromContext;
  let cookie: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  } catch {
    throw new NoTenantError();
  }
  const userId = verifySession(cookie);
  const user = userId ? await getUser(userId) : undefined;
  if (!user) throw new NoTenantError();
  return tenantOf(user);
}

/** The signed-in person of this request (null in background jobs / when signed out). */
export async function currentUser() {
  try {
    const { cookies } = await import("next/headers");
    const id = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
    return (id && (await getUser(id))) || null;
  } catch {
    return null;
  }
}

/** Tenant if one is known, else undefined (never throws). */
export async function maybeTenant(): Promise<string | undefined> {
  return currentTenant().catch(() => undefined);
}

export const tenantDir = (tenantId: string) => path.join(DATA_DIR, "tenants", tenantId.replace(/[^\w-]/g, ""));

/**
 * Detached background work started from a request (e.g. the full sync after connecting)
 * keeps running after the response is sent – pin it to the tenant first.
 */
export async function inBackground(fn: () => Promise<unknown>) {
  const t = await currentTenant();
  void runAsTenant(t, () => fn().catch((err) => console.error("[ocp bg]", t, err)));
}

/** .env Meta token (META_ACCESS_TOKEN) – only ever used for the operator's own workspace. */
export async function envMetaToken(): Promise<string | undefined> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return undefined;
  const t = await maybeTenant();
  return t && t === (await ownerTenant()) ? token : undefined;
}
