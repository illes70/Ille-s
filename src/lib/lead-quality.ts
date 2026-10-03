import type { Lead } from "./types";

// Cheap, explainable checks on every incoming lead: fake names, broken phone numbers,
// throwaway e-mails and repeat submissions. Spam leads are kept (nothing is deleted)
// but don't ring the phone, and the assistant sees them as low quality.

export interface LeadQuality {
  verdict: "ok" | "suspect" | "spam";
  flags: string[];
  duplicateOf?: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

/** +36301234567 form of a Hungarian number, or the bare digits when it isn't one. */
export function normalizePhone(raw: string): string {
  let d = digits(raw);
  if (d.startsWith("0036")) d = d.slice(2);
  if (d.startsWith("06")) d = `36${d.slice(2)}`;
  if (d.length === 9 && !d.startsWith("36")) d = `36${d}`;
  return d;
}

function phoneProblem(raw: string): string | null {
  const d = normalizePhone(raw);
  if (d.length < 8) return "túl rövid telefonszám";
  const subscriber = d.slice(-7);
  if (/^(\d)\1+$/.test(d.slice(2)) || /^(\d)\1{6}$/.test(subscriber)) return "kamu telefonszám";
  if (["1234567", "7654321", "0123456"].includes(subscriber)) return "gyanús telefonszám";
  if (d.startsWith("36")) {
    const rest = d.slice(2);
    const mobile = /^(20|30|31|50|70)\d{7}$/.test(rest);
    const budapest = /^1\d{7}$/.test(rest);
    const rural = /^[2-9]\d{7}$/.test(rest);
    if (!mobile && !budapest && !rural) return "érvénytelen magyar telefonszám";
  }
  return null;
}

const FAKE_NAME = /^(test|teszt|asd|asdf|qwe|qwerty|xxx|aaa|abc|proba|próba|nincs|senki|anonymous|anonim|valaki|na|-|\.)+$/i;
const THROWAWAY = /@(example\.(com|org)|test\.com|mailinator\.com|guerrillamail\.|10minutemail\.|yopmail\.com|tempmail\.)/i;

export function assessLead(lead: Lead, previous: Lead[]): LeadQuality {
  const flags: string[] = [];
  let spam = false;

  const name = lead.name.trim();
  const compact = name.toLowerCase().replace(/\s+/g, "");
  if (!name || FAKE_NAME.test(compact) || /^(.)\1{2,}$/.test(compact)) {
    flags.push("kamu név");
    spam = true;
  } else if (name.length < 3 || !/\s/.test(name)) {
    flags.push("csak egy szavas név");
  }

  if (lead.phone) {
    const p = phoneProblem(lead.phone);
    if (p) {
      flags.push(p);
      if (p === "kamu telefonszám") spam = true;
    }
  } else if (!lead.email) {
    flags.push("nincs elérhetőség");
    spam = true;
  }

  if (lead.email && THROWAWAY.test(lead.email)) {
    flags.push("eldobható e-mail");
    spam = true;
  }

  // the same person again within 30 days (same phone or e-mail)
  const since = Date.now() - 30 * 86_400_000;
  const phone = lead.phone ? normalizePhone(lead.phone) : "";
  const email = lead.email?.trim().toLowerCase();
  const dup = previous.find(
    (l) =>
      l.id !== lead.id &&
      new Date(l.createdAt).getTime() > since &&
      ((phone.length >= 8 && l.phone && normalizePhone(l.phone) === phone) || (email && l.email?.trim().toLowerCase() === email)),
  );
  if (dup) flags.push(`ismételt jelentkezés (${dup.name}, ${dup.createdAt.slice(0, 10)})`);

  return { verdict: spam ? "spam" : flags.length ? "suspect" : "ok", flags, duplicateOf: dup?.id };
}
