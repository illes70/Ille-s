import "server-only";
import { EventEmitter } from "events";
import type { LiveEvent } from "./types";
import { currentTenant } from "./tenant";

// In-process pub/sub for server → browser push (/api/live), one channel per tenant.
// Kept on globalThis so dev-mode hot reloads don't create a second bus that open
// streams never hear.

const g = globalThis as unknown as { __ocpBus?: EventEmitter; __ocpAdsCache?: Map<string, Map<string, unknown>> };
const bus = (g.__ocpBus ??= new EventEmitter().setMaxListeners(1000));
const adsCaches = (g.__ocpAdsCache ??= new Map());

/** Server-side ads cache of one tenant, per ad account (owned here so mutations can drop it without import cycles). */
export function adsCacheOf(tenant: string): Map<string, unknown> {
  let c = adsCaches.get(tenant);
  if (!c) adsCaches.set(tenant, (c = new Map()));
  return c;
}

/** After any change to ads: drop the cache and tell every browser of this tenant to reload ads. */
export async function adsChanged(accountId: string) {
  const t = await currentTenant();
  adsCacheOf(t).delete(accountId);
  publish({ type: "invalidate", keys: ["ads"] }, t);
}

/** Push to the browsers of a tenant (default: the current one). */
export function publish(event: LiveEvent, tenant?: string) {
  if (tenant) {
    bus.emit(tenant, event);
    return;
  }
  currentTenant().then(
    (t) => bus.emit(t, event),
    () => console.warn("[ocp bus] event without tenant dropped:", event.type),
  );
}

export function subscribe(tenant: string, fn: (event: LiveEvent) => void): () => void {
  bus.on(tenant, fn);
  return () => bus.off(tenant, fn);
}

/** How many open browser streams of a tenant are listening. */
export function listenerCount(tenant: string): number {
  return bus.listenerCount(tenant);
}
