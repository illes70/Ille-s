import { readStore } from "@/lib/store";
import { appCredentials } from "@/lib/meta/oauth";

export const dynamic = "force-dynamic";

/** Facebook connection summary for the settings page (no tokens leave the server). */
export async function GET() {
  const auth = (await readStore()).metaAuth;
  return Response.json({
    appConfigured: !!appCredentials(),
    envToken: !!process.env.META_ACCESS_TOKEN,
    connected: !!auth || !!process.env.META_ACCESS_TOKEN,
    userName: auth?.userName,
    expiresAt: auth?.expiresAt,
    connectedAt: auth?.connectedAt,
    pages: auth?.pages.map((p) => ({ id: p.id, name: p.name, leadgenSubscribed: !!p.leadgenSubscribed })) ?? [],
  });
}
