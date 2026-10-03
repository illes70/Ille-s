import { getProvider } from "@/lib/meta/provider";
import { pendingPlans } from "@/lib/agent/plans";

export const dynamic = "force-dynamic";

/** Plans of the active company that wait for the user's "Mehet". */
export async function GET() {
  const accountId = (await getProvider()).account.id;
  return Response.json(await pendingPlans(accountId));
}
