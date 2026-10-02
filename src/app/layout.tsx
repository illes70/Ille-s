import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { LiveProvider } from "@/components/live/LiveProvider";
import { LeadToasts } from "@/components/live/LeadToasts";

export const metadata: Metadata = {
  title: "OCP",
  description: "AI hirdetéskezelő – a Meta fiókjaid élőben, chatből irányítva.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu">
      <body className="min-h-dvh">
        <LiveProvider>
          <div className="flex min-h-dvh flex-col md:flex-row">
            <Sidebar />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
          <LeadToasts />
        </LiveProvider>
      </body>
    </html>
  );
}
