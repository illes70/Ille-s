import { chatTranscript, resetChat, runAgentTurn } from "@/lib/agent/run";
import type { ChatTurnEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return Response.json(await chatTranscript());
}

export async function DELETE() {
  await resetChat();
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const { message, images = [] } = (await req.json()) as { message?: string; images?: string[] };
  if (!message?.trim() && !images.length) return Response.json({ error: "Üres üzenet" }, { status: 400 });
  const safeImages = images.filter((u) => /^\/api\/media\/[\w-]+\.(png|jpe?g|webp|gif)$/.test(u)).slice(0, 6);

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatTurnEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
          throw new Error("Hiányzik az ANTHROPIC_API_KEY – add meg a .env.local fájlban.");
        }
        await runAgentTurn(message?.trim() || "Nézd meg a csatolt képe(ke)t.", safeImages, emit);
      } catch (err) {
        emit({ type: "error", text: err instanceof Error ? err.message : String(err) });
        emit({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
