import { chatTranscript, runAgentTurn } from "@/lib/agent/run";
import { updateStore } from "@/lib/store";
import type { ChatTurnEvent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return Response.json(await chatTranscript());
}

export async function DELETE() {
  await updateStore((d) => void (d.chat = []));
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const { message } = (await req.json()) as { message?: string };
  if (!message?.trim()) return Response.json({ error: "Üres üzenet" }, { status: 400 });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatTurnEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
          throw new Error("Hiányzik az ANTHROPIC_API_KEY – add meg a .env.local fájlban.");
        }
        await runAgentTurn(message.trim(), emit);
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
