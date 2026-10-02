"use client";

import { useCallback, useEffect, useState } from "react";

/** Fetch JSON and refresh it every `ms`. Returns undefined until the first load. */
export function usePoll<T>(url: string, ms: number): T | undefined {
  return usePollWithRefresh<T>(url, ms)[0];
}

export function usePollWithRefresh<T>(url: string, ms: number): [T | undefined, () => void] {
  const [data, setData] = useState<T>();
  const load = useCallback(() => {
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((d) => d !== undefined && setData(d))
      .catch(() => undefined);
  }, [url]);

  useEffect(() => {
    load();
    const t = setInterval(load, ms);
    const onFocus = () => load();
    window.addEventListener("ocp:refresh", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("ocp:refresh", onFocus);
    };
  }, [load, ms]);

  return [data, load];
}

/** Ask every poller on the page to refresh now (after an action). */
export const refreshAll = () => window.dispatchEvent(new Event("ocp:refresh"));
