"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookOpen, Building2, Inbox, LayoutGrid, Lightbulb, MessageSquare, Settings, Users } from "lucide-react";
import { AccountSwitcher } from "./AccountSwitcher";
import { usePoll } from "./usePoll";
import { useLiveStatus } from "./live/LiveProvider";
import type { Proposal } from "@/lib/types";

const GROUPS = [
  {
    title: "Munka",
    items: [
      { href: "/", label: "Asszisztens", icon: MessageSquare },
      { href: "/inbox", label: "Javaslatok", icon: Inbox, badge: true },
      { href: "/ads", label: "Hirdetések", icon: LayoutGrid },
      { href: "/leads", label: "Leadek", icon: Users },
    ],
  },
  {
    title: "Tudás",
    items: [
      { href: "/company", label: "Cégprofil", icon: Building2 },
      { href: "/recipes", label: "Receptek", icon: BookOpen },
      { href: "/knowledge", label: "Tudásbázis", icon: Lightbulb },
    ],
  },
  {
    title: "Rendszer",
    items: [
      { href: "/activity", label: "Robot élőben", icon: Activity },
      { href: "/settings", label: "Beállítások", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();
  const proposals = usePoll<Proposal[]>("/api/proposals");
  const pending = proposals?.filter((p) => p.status === "pending").length ?? 0;

  return (
    <aside className="sticky top-0 z-20 flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3 py-2 md:h-dvh md:w-60 md:flex-col md:items-stretch md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-5">
      <Link href="/" className="mr-2 flex items-center gap-2 px-2 md:mb-4 md:mr-0">
        <span className="grid size-8 place-items-center rounded-lg bg-fg text-[13px] font-bold tracking-tight text-bg">O</span>
        <span className="hidden text-[15px] font-semibold tracking-tight md:inline">OCP</span>
      </Link>
      <AccountSwitcher />
      <nav className="flex flex-1 gap-1 overflow-x-auto md:flex-col md:gap-4 md:overflow-visible">
        {GROUPS.map((g) => (
          <div key={g.title} className="flex gap-1 md:flex-col">
            <p className="hidden px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted/80 uppercase md:block">{g.title}</p>
            {g.items.map(({ href, label, icon: Icon, badge }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span className="hidden md:inline">{label}</span>
                  {badge && pending > 0 && (
                    <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white">{pending}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <ConnectionPill />
    </aside>
  );
}

function ConnectionPill() {
  const status = useLiveStatus();
  const data = usePoll<{ mode: "demo" | "meta" }>("/api/accounts");
  if (!data) return null;
  const dot = status === "live" ? "bg-good live-dot" : status === "connecting" ? "bg-warn" : "bg-bad";
  return (
    <Link href="/settings" className="hidden items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs text-muted md:flex">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1 truncate">
        {status === "offline" ? "Újracsatlakozás…" : data.mode === "meta" ? "Élő · Meta" : "Élő · demó adatok"}
      </span>
    </Link>
  );
}
