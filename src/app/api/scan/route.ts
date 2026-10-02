import { runScan } from "@/lib/engine/monitor";

export async function POST() {
  try {
    return Response.json(await runScan("manual"));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
