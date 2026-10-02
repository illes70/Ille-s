"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveKey } from "@/lib/types";

const KEY_BY_PATH: Record<string, LiveKey> = {
  "/api/ads": "ads",
  "/api/leads": "leads",
  "/api/activity": "activity",
  "/api/proposals": "proposals",
  "/api/accounts": "accounts",
  "/api/company": "company",
  "/api/knowledge": "knowledge",
  "/api/recipes": "recipes",
  "/api/health": "health",
  "/api/media": "company",
};

/**
 * Live JSON: refetches the moment the server pushes a change for this data
 * (see LiveProvider), plus a slow safety-net poll. Old data stays on screen until
 * the new arrives, so values switch in place without flicker.
 */
export function usePoll<T>(url: string, safetyMs = 60_000): T | undefined {
  return usePollWithRefresh<T>(url, safetyMs)[0];
}

export function usePollWithRefresh<T>(url: string, safetyMs = 60_000): [T | undefined, () => void] {
  const [data, setData] = useState<T>();
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : undefined))
      // ignore responses that come back after a newer request
      .then((d) => d !== undefined && n === seq.current && setData(d))
      .catch(() => undefined);
  }, [url]);

  useEffect(() => {
    load();
    const key = KEY_BY_PATH[url.split("?")[0]];
    const t = setInterval(load, safetyMs);
    const onInvalidate = (e: Event) => {
      const keys = (e as CustomEvent<LiveKey[]>).detail;
      if (!key || keys.includes(key) || keys.includes("accounts")) load();
    };
    const onRefresh = () => load();
    window.addEventListener("ocp:invalidate", onInvalidate);
    window.addEventListener("ocp:refresh", onRefresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("ocp:invalidate", onInvalidate);
      window.removeEventListener("ocp:refresh", onRefresh);
    };
  }, [load, url, safetyMs]);

  return [data, load];
}

/** Ask every live hook on the page to refresh now (after an action). */
export const refreshAll = () => window.dispatchEvent(new Event("ocp:refresh"));
