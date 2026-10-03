import { z } from "zod";
import { readStore, updateStore, logActivity, settingsWithDefaults } from "@/lib/store";

const Settings = z.object({
  currency: z.string().length(3),
  targetCpl: z.number().positive(),
  autopilot: z.object({
    level: z.enum(["ask", "bounded", "full"]),
    autoPauseSpendMultiplier: z.number().min(1).max(10),
    maxBudgetIncreasePct: z.number().min(0).max(100),
    frequencyLimit: z.number().min(1).max(10),
  }),
  schedule: z.object({
    scanEveryMinutes: z.number().int().min(0).max(1440),
    briefEnabled: z.boolean(),
    briefTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Időpont: ÓÓ:PP"),
    timezone: z.string().min(1).max(64),
  }),
  notify: z.object({
    email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
    leadsEmail: z.boolean(),
    leadsPush: z.boolean(),
    briefEmail: z.boolean(),
    briefPush: z.boolean(),
    alertsEmail: z.boolean(),
    alertsPush: z.boolean(),
  }),
});

export async function GET() {
  return Response.json(settingsWithDefaults((await readStore()).settings));
}

/** Partial update: each card sends only its own part. */
export async function PUT(req: Request) {
  const parsed = Settings.partial().safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Hibás adatok" }, { status: 400 });
  if (parsed.data.schedule) {
    try {
      new Intl.DateTimeFormat("hu-HU", { timeZone: parsed.data.schedule.timezone });
    } catch {
      return Response.json({ error: "Ismeretlen időzóna" }, { status: 400 });
    }
  }
  const next = await updateStore((d) => {
    d.settings = { ...settingsWithDefaults(d.settings), ...parsed.data };
    return settingsWithDefaults(d.settings);
  }, ["settings"]);
  await logActivity("user", "action", "Beállítások frissítve");
  return Response.json(next);
}
