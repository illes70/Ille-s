import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { sessionToken } from "@/lib/session";

export async function POST(req: Request) {
  const password = process.env.OCP_PASSWORD;
  const { password: given } = (await req.json()) as { password?: string };
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(password ?? "");
  if (!password || a.length !== b.length || !timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "Hibás jelszó" }, { status: 401 });
  }
  (await cookies()).set("ocp_session", await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !!process.env.OCP_PUBLIC_URL?.startsWith("https"),
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return Response.json({ ok: true });
}
