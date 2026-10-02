import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { appCredentials, loginUrl } from "@/lib/meta/oauth";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  if (!appCredentials()) {
    return Response.redirect(`${origin}/settings?meta=missing_app`, 302);
  }
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("ocp_meta_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return Response.redirect(loginUrl(origin, state), 302);
}
