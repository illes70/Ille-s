import { emailConfigured, notifyTest } from "@/lib/notify";

export async function POST() {
  const r = await notifyTest();
  return Response.json({ ...r, emailConfigured: emailConfigured() });
}
