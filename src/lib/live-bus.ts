import "server-only";
import { EventEmitter } from "events";
import type { LiveEvent } from "./types";

// In-process pub/sub for server → browser push (/api/live). Kept on globalThis so
// dev-mode hot reloads don't create a second bus that open streams never hear.

const g = globalThis as unknown as { __ocpBus?: EventEmitter; __ocpAdsCache?: Map<string, unknown> };
const bus = (g.__ocpBus ??= new EventEmitter().setMaxListeners(200));

/** Server-side ads cache per account (owned here so mutations can drop it without import cycles). */
export const adsCache = (g.__ocpAdsCache ??= new Map<string, unknown>());

/** After any change to ads: drop the cache and tell every browser to reload ads. */
export function adsChanged(accountId: string) {
  adsCache.delete(accountId);
  publish({ type: "invalidate", keys: ["ads"] });
}

export function publish(event: LiveEvent) {
  bus.emit("event", event);
}

export function subscribe(fn: (event: LiveEvent) => void): () => void {
  bus.on("event", fn);
  return () => bus.off("event", fn);
}

/** How many open browser streams are listening. */
export function listenerCount(): number {
  return bus.listenerCount("event");
}
