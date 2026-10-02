import { z } from "zod";
import { readStore, updateStore, logActivity } from "@/lib/store";

const Settings = z.object({
  currency: z.string().length(3),
  targetCpl: z.number().positive(),
  brandVoice: z.string().max(2000),
  autopilot: z.object({
    autoPause: z.boolean(),
    autoPauseSpendMultiplier: z.number().min(1).max(10),
    maxBudgetIncreasePct: z.number().min(0).max(100),
    frequencyLimit: z.number().min(1).max(10),
  }),
});

export async function GET() {
  return Response.json((await readStore()).settings);
}

export async function PUT(req: Request) {
  const parsed = Settings.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  await updateStore((d) => void (d.settings = parsed.data));
  await logActivity("user", "action", "Beállítások frissítve");
  return Response.json(parsed.data);
}
