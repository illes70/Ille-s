"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Lead, LiveEvent, LiveKey } from "@/lib/types";

// One EventSource per tab. Server pushes → window events that hooks and widgets listen to.

type Status = "connecting" | "live" | "offline";
const LiveStatus = createContext<Status>("connecting");
export const useLiveStatus = () => useContext(LiveStatus);

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wasOffline = false;

    const open = () => {
      es = new EventSource("/api/live");
      es.onopen = () => {
        setStatus("live");
        // after a drop, everything might be stale
        if (wasOffline) invalidate(["ads", "leads", "activity", "proposals", "accounts", "overview"]);
        wasOffline = false;
      };
      es.onmessage = (msg) => {
        const e = JSON.parse(msg.data) as LiveEvent;
        if (e.type === "invalidate") invalidate(e.keys);
        if (e.type === "sync") window.dispatchEvent(new CustomEvent("ocp:sync", { detail: e.sync }));
        if (e.type === "lead") {
          window.dispatchEvent(new CustomEvent<{ lead: Lead; accountName?: string }>("ocp:lead", { detail: e }));
          invalidate(["leads", "ads", "activity"]);
        }
      };
      es.onerror = () => {
        setStatus("offline");
        wasOffline = true;
        es?.close();
        retry = setTimeout(open, 2000);
      };
    };
    open();
    const onVisible = () => document.visibilityState === "visible" && invalidate(["ads", "leads", "activity", "proposals"]);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(retry);
      es?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <LiveStatus.Provider value={status}>{children}</LiveStatus.Provider>;
}

export function invalidate(keys: LiveKey[]) {
  window.dispatchEvent(new CustomEvent<LiveKey[]>("ocp:invalidate", { detail: keys }));
}
