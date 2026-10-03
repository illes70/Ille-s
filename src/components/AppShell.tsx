"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { LiveProvider } from "./live/LiveProvider";
import { LeadToasts } from "./live/LeadToasts";

const BARE = ["/login", "/register"];

/** App chrome (sidebar, live stream, toasts) everywhere except the sign-in pages. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (BARE.includes(path)) return <>{children}</>;
  return (
    <LiveProvider>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <LeadToasts />
    </LiveProvider>
  );
}
