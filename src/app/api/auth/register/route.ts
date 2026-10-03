import { cookies } from "next/headers";
import { z } from "zod";
import { cookieOptions, createSession, hashPassword, SESSION_COOKIE, verifyInvite } from "@/lib/auth";
import { logActivity, newId } from "@/lib/store";
import { runAsTenant } from "@/lib/tenant";
import { listUsers, updateUsers } from "@/lib/users";
import type { User } from "@/lib/types";

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "A jelszó legalább 8 karakter legyen").max(200),
  invite: z.string().max(200).optional(),
});

/** Sign-up rules: the very first person, anyone with a valid invite link, or anyone when OCP_ALLOW_SIGNUP=1. */
async function signupAllowed(invite?: string) {
  if (!(await listUsers()).length) return true;
  if (process.env.OCP_ALLOW_SIGNUP === "1") return true;
  return !!verifyInvite(invite);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Hibás adatok" }, { status: 400 });
  const { name, email, password, invite } = parsed.data;
  if (!(await signupAllowed(invite))) {
    return Response.json({ error: "A regisztrációhoz meghívó link kell – kérj egyet attól, aki az OCP-t adta." }, { status: 403 });
  }
  const passwordHash = await hashPassword(password);
  const result = await updateUsers((users, file) => {
    if (users.some((u) => u.email === email)) return { error: "Ezzel az e-mail címmel már van fiók." } as const;
    const nonce = verifyInvite(invite);
    if (users.length && process.env.OCP_ALLOW_SIGNUP !== "1") {
      if (!nonce || file.usedInvites?.includes(nonce)) return { error: "Ezt a meghívó linket már felhasználták." } as const;
      file.usedInvites = [...(file.usedInvites ?? []), nonce];
    }
    const id = newId("usr");
    // every new customer gets an own, isolated workspace
    const user: User = { id, email, name, passwordHash, role: users.length ? "member" : "owner", tenantId: id, createdAt: new Date().toISOString() };
    users.push(user);
    return { user } as const;
  });
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });
  const session = createSession(result.user.id);
  (await cookies()).set(SESSION_COOKIE, session.value, cookieOptions(session.maxAge));
  await runAsTenant(result.user.tenantId!, () => logActivity("user", "action", `Új fiók: ${result.user.name}`));
  return Response.json({ ok: true });
}
