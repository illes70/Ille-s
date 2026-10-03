import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { forgetTenant, updateStore } from "@/lib/store";
import { currentUser } from "@/lib/tenant";
import { deleteUser } from "@/lib/users";

/** "Fiók és adatok törlése" (GDPR): the person, and their workspace if nobody else uses it. */
export async function DELETE(req: Request) {
  const me = await currentUser();
  if (!me) return Response.json({ error: "Belépés szükséges" }, { status: 401 });
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (confirm !== me.email) return Response.json({ error: "A megerősítéshez írd be az e-mail címedet." }, { status: 400 });
  if (me.role === "owner") return Response.json({ error: "A tulajdonosi fiók nem törölhető innen (ő üzemelteti az OCP-t)." }, { status: 403 });
  await updateStore((d) => void (d.pushSubs = (d.pushSubs ?? []).filter((s) => s.userId !== me.id)));
  const { tenantDeleted } = await deleteUser(me.id);
  if (tenantDeleted) forgetTenant(tenantDeleted);
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
