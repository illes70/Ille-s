import { fixLeadgen, runHealthChecks } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.json(await runHealthChecks(new URL(req.url).origin));
}

export async function POST(req: Request) {
  const { action } = (await req.json()) as { action?: string };
  if (action === "subscribe_leadgen") return Response.json(await fixLeadgen());
  return Response.json({ error: "ismeretlen művelet" }, { status: 400 });
}
