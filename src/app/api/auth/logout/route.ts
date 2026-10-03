import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { updateStore } from "@/lib/store";
import { currentUser } from "@/lib/tenant";

export async function POST() {
  // this person's devices stop getting the workspace's notifications (shared computers)
  const me = await currentUser();
  if (me) await updateStore((d) => void (d.pushSubs = (d.pushSubs ?? []).filter((s) => s.userId !== me.id))).catch(() => undefined);
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
