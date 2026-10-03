import { startFullSync } from "@/lib/live";

/** Re-load every account, its ads and creative images (progress is pushed live). */
export async function POST() {
  await startFullSync();
  return Response.json({ started: true });
}
