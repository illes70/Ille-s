import { ensureLivePoller } from "@/lib/live";
import { subscribe } from "@/lib/live-bus";
import type { LiveEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

// Server-Sent Events: one long-lived stream per open tab. The server pushes every change.
export async function GET(req: Request) {
  ensureLivePoller();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: LiveEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = subscribe(send);
      // keeps proxies from closing an idle connection
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
      send({ type: "hello", at: new Date().toISOString() });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
