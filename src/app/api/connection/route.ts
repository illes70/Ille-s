import { readStore } from "@/lib/store";
import { appCredentials } from "@/lib/meta/oauth";
import { envMetaToken } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Facebook connection summary for the settings page (no tokens leave the server). */
export async function GET() {
  const auth = (await readStore()).metaAuth;
  const envToken = !auth && !!(await envMetaToken());
  return Response.json({
    appConfigured: !!appCredentials(),
    envToken,
    connected: !!auth || envToken,
    userName: auth?.userName,
    expiresAt: auth?.expiresAt,
    connectedAt: auth?.connectedAt,
    pages: auth?.pages.map((p) => ({ id: p.id, name: p.name, leadgenSubscribed: !!p.leadgenSubscribed })) ?? [],
  });
}
