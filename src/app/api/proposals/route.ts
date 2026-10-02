import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json((await readStore()).proposals.slice(0, 100));
}
