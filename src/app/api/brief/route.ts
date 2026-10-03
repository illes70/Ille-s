import { getOverview } from "@/lib/live";
import { writeBrief, localDate } from "@/lib/engine/brief";
import { readStore, settingsWithDefaults, updateStore } from "@/lib/store";
import { currentUser } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** Latest morning brief (+ whether it's today's). */
export async function GET() {
  const store = await readStore();
  const brief = store.briefs?.[0] ?? null;
  const today = localDate(settingsWithDefaults(store.settings).schedule.timezone);
  return Response.json({ brief, isToday: brief?.date === today });
}

/** Write one right now (button "Összefoglaló most"). */
export async function POST() {
  try {
    const me = await currentUser();
    const brief = await writeBrief(await getOverview(0), me?.name.split(" ").pop());
    return Response.json({ brief, isToday: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

/** Mark as read (the card folds away). */
export async function PATCH() {
  await updateStore((d) => {
    if (d.briefs?.[0]) d.briefs[0].readAt = new Date().toISOString();
  }, ["brief"]);
  return Response.json({ ok: true });
}
