import { createInvite } from "@/lib/auth";
import { currentUser } from "@/lib/tenant";

/** Sign-up link for a new customer (operator only): they get their own, isolated workspace. */
export async function POST(req: Request) {
  const me = await currentUser();
  if (me?.role !== "owner") return Response.json({ error: "Meghívót csak a tulajdonos küldhet." }, { status: 403 });
  const base = process.env.OCP_PUBLIC_URL ?? new URL(req.url).origin;
  return Response.json({ url: `${base}/register?invite=${createInvite(14)}`, validDays: 14 });
}
