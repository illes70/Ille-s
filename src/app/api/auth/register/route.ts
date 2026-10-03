import { cookies } from "next/headers";
import { z } from "zod";
import { cookieOptions, createSession, hashPassword, SESSION_COOKIE } from "@/lib/auth";
import { logActivity, newId, readStore, updateStore } from "@/lib/store";
import type { User } from "@/lib/types";

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "A jelszó legalább 8 karakter legyen").max(200),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Hibás adatok" }, { status: 400 });
  const { users } = await readStore();
  // for now OCP is single-owner: sign-up closes after the first account (OCP_ALLOW_SIGNUP=1 reopens it)
  if (users.length && process.env.OCP_ALLOW_SIGNUP !== "1") {
    return Response.json({ error: "A regisztráció zárva – lépj be." }, { status: 403 });
  }
  if (users.some((u) => u.email === parsed.data.email)) {
    return Response.json({ error: "Ezzel az e-mail címmel már van fiók." }, { status: 409 });
  }
  const user: User = {
    id: newId("usr"),
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
    role: users.length ? "member" : "owner",
    createdAt: new Date().toISOString(),
  };
  await updateStore((d) => void d.users.push(user));
  const session = createSession(user.id);
  (await cookies()).set(SESSION_COOKIE, session.value, cookieOptions(session.maxAge));
  await logActivity("user", "action", `Új fiók: ${user.name}`);
  return Response.json({ ok: true });
}
