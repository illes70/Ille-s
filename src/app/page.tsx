import { Chat } from "@/components/Chat";
import { PendingRail } from "@/components/PendingRail";

export default function Home() {
  return (
    <div className="flex h-[calc(100dvh-57px)] md:h-dvh">
      <section className="min-w-0 flex-1">
        <Chat />
      </section>
      <PendingRail />
    </div>
  );
}
