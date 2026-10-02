import { z } from "zod";
import { getCompany, prefillFromPage, saveCompany } from "@/lib/company";
import { getProvider } from "@/lib/meta/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = await getProvider();
  let pages: { id: string; name: string }[] = [];
  if (provider.mode === "meta") {
    const { metaPages } = await import("@/lib/meta/graph");
    pages = (await metaPages().catch(() => [])).map(({ id, name }) => ({ id, name }));
  }
  return Response.json({ company: await getCompany(), pages, mode: provider.mode });
}

const Company = z.object({
  name: z.string().max(200),
  industry: z.string().max(300),
  services: z.array(z.object({ name: z.string().max(200), price: z.string().max(200).optional() })).max(50),
  phone: z.string().max(50),
  area: z.string().max(300),
  website: z.string().max(300),
  usp: z.string().max(2000),
  brandVoice: z.string().max(2000),
  targetCpl: z.number().positive().optional(),
  pageId: z.string().optional(),
  logoUrl: z.string().optional(),
  colors: z.tuple([z.string(), z.string()]),
  notes: z.string().max(5000),
});

export async function PUT(req: Request) {
  const parsed = Company.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const accountId = (await getProvider()).account.id;
  return Response.json(await saveCompany({ ...parsed.data, accountId }));
}

/** { action: "prefill", pageId? } → fill empty fields from the Facebook Page */
export async function POST(req: Request) {
  const { pageId } = (await req.json()) as { pageId?: string };
  try {
    const accountId = (await getProvider()).account.id;
    return Response.json(await prefillFromPage(accountId, pageId));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
