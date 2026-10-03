import { z } from "zod";
import { vapidKeys } from "@/lib/notify";
import { readStore, updateStore } from "@/lib/store";
import { currentUser } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Public key for the browser + how many devices of this workspace get notifications. */
export async function GET() {
  const [{ publicKey }, store] = await Promise.all([vapidKeys(), readStore()]);
  return Response.json({ publicKey, devices: (store.pushSubs ?? []).length });
}

const Sub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  label: z.string().max(100).optional(),
});

/** This device wants notifications. */
export async function POST(req: Request) {
  const parsed = Sub.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Hibás feliratkozás" }, { status: 400 });
  const me = await currentUser();
  if (!me) return Response.json({ error: "Belépés szükséges" }, { status: 401 });
  await updateStore((d) => {
    const others = (d.pushSubs ?? []).filter((s) => s.endpoint !== parsed.data.endpoint);
    d.pushSubs = [...others, { ...parsed.data, userId: me.id, createdAt: new Date().toISOString() }].slice(-30);
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  await updateStore((d) => void (d.pushSubs = (d.pushSubs ?? []).filter((s) => s.endpoint !== endpoint)));
  return Response.json({ ok: true });
}
