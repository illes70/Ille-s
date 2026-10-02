import { runScan } from "@/lib/engine/monitor";

export const dynamic = "force-dynamic";

// Called by a scheduler (e.g. Vercel Cron) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await runScan("cron"));
}
