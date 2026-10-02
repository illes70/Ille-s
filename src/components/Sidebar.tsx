"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Inbox, LayoutGrid, MessageSquare, Settings, Users } from "lucide-react";
import { usePoll } from "./usePoll";
import type { Proposal } from "@/lib/types";

const NAV = [
  { href: "/", label: "Asszisztens", icon: MessageSquare },
  { href: "/inbox", label: "Javaslatok", icon: Inbox, badge: true },
  { href: "/ads", label: "Hirdetések", icon: LayoutGrid },
  { href: "/leads", label: "Leadek", icon: Users },
  { href: "/activity", label: "Robot élőben", icon: Activity },
  { href: "/settings", label: "Beállítások", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  const proposals = usePoll<Proposal[]>("/api/proposals", 10_000);
  const pending = proposals?.filter((p) => p.status === "pending").length ?? 0;

  return (
    <aside className="sticky top-0 z-20 flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3 py-2 md:h-dvh md:w-60 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-3 md:py-5">
      <Link href="/" className="mr-2 flex items-center gap-2 px-2 md:mb-6 md:mr-0">
        <span className="grid size-8 place-items-center rounded-lg bg-fg text-[13px] font-bold tracking-tight text-bg">
          O
        </span>
        <span className="hidden text-[15px] font-semibold tracking-tight md:inline">OCP</span>
      </Link>
      <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span className="hidden sm:inline">{label}</span>
              {badge && pending > 0 && (
                <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white">
                  {pending}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <ConnectionPill />
    </aside>
  );
}

function ConnectionPill() {
  const data = usePoll<{ mode: "demo" | "meta" }>("/api/ads", 60_000);
  if (!data) return null;
  return (
    <Link
      href="/settings"
      className="hidden items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-muted md:flex"
    >
      <span className={`size-2 rounded-full ${data.mode === "meta" ? "bg-good live-dot" : "bg-warn"}`} />
      {data.mode === "meta" ? "Meta fiók csatlakoztatva" : "Demó mód"}
    </Link>
  );
}
