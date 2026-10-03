import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyInvite, verifySession } from "@/lib/auth";
import { getUser, listUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Is anyone registered yet, can this visitor sign up, and who is signed in. */
export async function GET(req: Request) {
  const users = await listUsers();
  const id = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const me = id ? await getUser(id) : undefined;
  const invite = new URL(req.url).searchParams.get("invite") ?? undefined;
  return Response.json({
    hasUsers: users.length > 0,
    signupOpen: users.length === 0 || process.env.OCP_ALLOW_SIGNUP === "1" || !!verifyInvite(invite),
    user: me ? { id: me.id, email: me.email, name: me.name, role: me.role } : null,
  });
}
