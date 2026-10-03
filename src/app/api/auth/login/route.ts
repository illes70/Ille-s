import { cookies } from "next/headers";
import { checkPassword, cookieOptions, createSession, SESSION_COOKIE } from "@/lib/auth";
import { readStore } from "@/lib/store";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  const user = (await readStore()).users.find((u) => u.email === email?.trim().toLowerCase());
  const ok = !!user && !!password && (await checkPassword(password, user.passwordHash));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "Hibás e-mail cím vagy jelszó" }, { status: 401 });
  }
  const session = createSession(user!.id);
  (await cookies()).set(SESSION_COOKIE, session.value, cookieOptions(session.maxAge));
  return Response.json({ ok: true });
}
