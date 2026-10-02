import { ActivityFeed, LiveBadge } from "@/components/ActivityFeed";
import { Page, PageHeader } from "@/components/PageHeader";
import { ScanButton } from "@/components/ScanButton";

export default function ActivityPage() {
  return (
    <Page>
      <PageHeader
        title="Robot élőben"
        sub="Minden, amit az asszisztens néz, javasol vagy végrehajt – valós időben."
        right={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <ScanButton />
          </div>
        }
      />
      <div className="card max-w-3xl p-6">
        <ActivityFeed limit={100} />
      </div>
    </Page>
  );
}
