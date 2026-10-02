import { createHmac, timingSafeEqual } from "crypto";
import { logActivity, updateStore } from "@/lib/store";

// Meta webhook for the Page `leadgen` field: new leads appear in OCP within seconds.
// Setup: Meta app → Webhooks → Page → leadgen, callback = <OCP URL>/api/webhooks/meta,
// verify token = META_VERIFY_TOKEN; then subscribe the Page to the app.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ok =
    url.searchParams.get("hub.mode") === "subscribe" &&
    !!process.env.META_VERIFY_TOKEN &&
    url.searchParams.get("hub.verify_token") === process.env.META_VERIFY_TOKEN;
  return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("forbidden", { status: 403 });
}

function validSignature(body: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const given = header.slice(7);
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

interface LeadgenPayload {
  entry?: { changes?: { field: string; value: { leadgen_id?: string } }[] }[];
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("invalid signature", { status: 401 });
  }
  const payload = JSON.parse(raw) as LeadgenPayload;
  const ids = (payload.entry ?? [])
    .flatMap((e) => e.changes ?? [])
    .filter((c) => c.field === "leadgen" && c.value.leadgen_id)
    .map((c) => c.value.leadgen_id!);

  const { fetchLead } = await import("@/lib/meta/graph");
  for (const id of ids) {
    try {
      const lead = await fetchLead(id);
      await updateStore((d) => {
        if (!d.leads.some((l) => l.id === lead.id)) d.leads.unshift(lead);
        d.leads = d.leads.slice(0, 2000);
      });
      await logActivity("system", "lead", `Új lead: ${lead.name}${lead.city ? ` (${lead.city})` : ""} – ${lead.formName}`);
    } catch (err) {
      await logActivity("system", "error", `Lead webhook hiba (${id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return Response.json({ received: ids.length });
}
