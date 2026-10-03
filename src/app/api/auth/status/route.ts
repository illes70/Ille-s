import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Is anyone registered yet, and who is signed in. */
export async function GET() {
  const { users } = await readStore();
  const id = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const me = users.find((u) => u.id === id);
  return Response.json({
    hasUsers: users.length > 0,
    signupOpen: users.length === 0 || process.env.OCP_ALLOW_SIGNUP === "1",
    user: me ? { id: me.id, email: me.email, name: me.name, role: me.role } : null,
  });
}
