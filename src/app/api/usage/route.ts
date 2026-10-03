import { usageSummary } from "@/lib/ai-usage";
import { imageProviders } from "@/lib/creative/generate";

export const dynamic = "force-dynamic";

/** This month's AI spend of the workspace + which image providers are switched on. */
export async function GET() {
  return Response.json({ ...(await usageSummary()), imageProviders: imageProviders() });
}
