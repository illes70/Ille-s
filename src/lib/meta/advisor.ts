import "server-only";
import type { Ad } from "../types";

// The assistant's professional judgement, enforced in code (not only in the prompt):
// risky changes come back as "needs confirmation" with the reasons, policy problems
// come back as "refused". The model has to relay them to the user.

export interface Verdict {
  /** hard stop: policy / legal / guardrail – never executed */
  refuse: string[];
  /** professional concerns: executed only after the user confirms */
  warn: string[];
  /** better way to do it, shown with the warning/refusal */
  alternatives: string[];
}

export const emptyVerdict = (): Verdict => ({ refuse: [], warn: [], alternatives: [] });

export function merge(...vs: Verdict[]): Verdict {
  return {
    refuse: vs.flatMap((v) => v.refuse),
    warn: vs.flatMap((v) => v.warn),
    alternatives: [...new Set(vs.flatMap((v) => v.alternatives))],
  };
}

/** Tool result when a verdict stops the action. */
export function gate(v: Verdict, confirmed: boolean) {
  if (v.refuse.length) {
    return {
      status: "refused" as const,
      reasons: v.refuse,
      alternatives: v.alternatives,
      instruction: "NEM hajtottam végre. Mondd el a felhasználónak röviden, miért nem (szabály/kockázat), és ajánlj szabályos alternatívát. Ezt megerősítéssel sem lehet felülírni.",
    };
  }
  if (v.warn.length && !confirmed) {
    return {
      status: "needs_confirmation" as const,
      concerns: v.warn,
      alternatives: v.alternatives,
      instruction:
        "NEM hajtottam végre. Mondd el a felhasználónak a szakmai aggályt röviden („szerintem ez nem a legjobb ötlet, mert…”), javasold az alternatívát, és kérdezd meg, mégis csináljam-e. Csak kifejezett igen után hívd újra confirmed_after_warning: true-val.",
    };
  }
  return null;
}

// ---------------------------------------------------------------- ad copy

const SENSITIVE = [
  { re: /cukorbeteg|diab[eé]tesz|inzulin/, what: "egészségi állapot (cukorbetegség)" },
  { re: /depresszi|szorong|pánikroham|kiégés|kiégett/, what: "mentális egészség" },
  { re: /t[uú]ls[uú]ly|elh[ií]z|k[oö]v[eé]r|fogy[nj]|fogyás|hízás|testsúly|kil[oó]t (?:fogy|ad)/, what: "testsúly" },
  { re: /h[aá]tf[aá]j|ízületi|reum|migrén|aranyér|inkontinencia|impoten|merevedés|meddő|lombik|rák(?:os|beteg)|daganat/, what: "egészségi állapot" },
  { re: /adóss[aá]g|tartoz[aá]s|csőd|végrehajt[oó]|behajt[aá]s|negat[ií]v (?:kh|bar)|anyagi gond|nincs pénz/, what: "anyagi helyzet" },
  { re: /munkanélküli|elbocsát/, what: "munkahelyi helyzet" },
  { re: /váláso?d|elvált|egyedül[aá]ll[oó]|szingli/, what: "családi állapot" },
  { re: /meleg vagy|leszbikus|homoszexu|biszexu|transznem/, what: "szexuális irányultság / nem" },
  { re: /keresztény|katolikus|reformátu|muszlim|zsid[oó]|ateista/, what: "vallás" },
  { re: /\broma\b|cig[aá]ny|etnikum|nemzetiség/, what: "etnikum" },
  { re: /büntetett|börtön|priusz/, what: "büntetett előélet" },
];
// "you" signals in Hungarian: direct address or a question to the reader
const YOU = /\b(te|téged|neked|nálad|tied|vagy|vagy-e|szenvedsz|küzdesz|érzed|érzel|akarsz|szeretnél|unod|eleged)\b|[^.!]*\?/;

export function lintAdCopy(texts: { headline?: string; primaryText?: string; description?: string }[]): Verdict {
  const v = emptyVerdict();
  for (const t of texts) {
    const all = [t.headline, t.primaryText, t.description].filter(Boolean).join("\n");
    const sentences = all.split(/(?<=[.!?\n])/);
    for (const s of sentences) {
      const low = s.toLowerCase();
      for (const x of SENSITIVE) {
        if (!x.re.test(low)) continue;
        if (YOU.test(low)) {
          v.refuse.push(`Személyes tulajdonságra utal (${x.what}): „${s.trim()}” – a Meta ezt elutasítja.`);
          v.alternatives.push("Fogalmazd át harmadik személyben vagy a szolgáltatásra fókuszálva, pl. „Hátfájás? Gyógytorna Budaörsön.”");
        } else {
          v.warn.push(`Érzékeny téma (${x.what}): „${s.trim()}” – ügyelj, hogy ne a nézőről állítsd.`);
        }
      }
    }
    const low = all.toLowerCase();
    if (/garant[aá]lt(?! ár)|100\s*%-?(?:os)?\s*(?:biztos|siker|garancia)|csodaszer|csodálatos eredmény/.test(low)) {
      v.warn.push("Túlzó/ígérő megfogalmazás („garantált”, „100%”): a Meta korlátozhatja, és bizalmatlanságot kelthet.");
      v.alternatives.push("Konkrét, igazolható állítás: „Fix ár, fix határidő”, „312 elégedett ügyfél”.");
    }
    if (/kattints ide|nem fogod elhinni|sokkoló|döbbenet/.test(low)) v.warn.push("Kattintásvadász kifejezés – rontja a hirdetés megjelenését.");
    const caps = (all.match(/\b[A-ZÁÉÍÓÖŐÚÜŰ]{4,}\b/g) ?? []).length;
    if (caps >= 3) v.warn.push("Sok csupa nagybetűs szó – a Meta alacsonyabb minőségűnek ítélheti.");
    if (/!{2,}/.test(all)) v.warn.push("Halmozott felkiáltójelek – rontják a minőségi rangsort.");
    if ((all.match(/\p{Extended_Pictographic}/gu) ?? []).length > 6) v.warn.push("Túl sok emoji.");
    if (t.headline && t.headline.length > 40) v.warn.push(`A címsor ${t.headline.length} karakter – kb. 40 felett mobilon levágódik.`);
  }
  // one warning of a kind is enough
  return { refuse: [...new Set(v.refuse)], warn: [...new Set(v.warn)], alternatives: [...new Set(v.alternatives)] };
}

export type SpecialCategory = "NONE" | "HOUSING" | "EMPLOYMENT" | "FINANCIAL_PRODUCTS_SERVICES" | "ISSUES_ELECTIONS_POLITICS";

/** Heuristic: does the text look like a special-category ad? */
export function detectSpecialCategory(text: string): SpecialCategory[] {
  const low = text.toLowerCase();
  const found: SpecialCategory[] = [];
  if (/eladó (?:lakás|ház|ingatlan|telek)|kiadó (?:lakás|ház|ingatlan|iroda)|albérlet|ingatlaniroda|ingatlanközvetít|lakáshitel|bérbeadó/.test(low)) found.push("HOUSING");
  if (/munkatársat keres|kollégát keres|felveszünk|állásajánlat|toboroz|toborz|jelentkezz (?:hozzánk|munkára)|nettó bér|bruttó bér|bérezés|munkalehetőség|szakembert keresünk/.test(low)) found.push("EMPLOYMENT");
  if (/\bhitel\b|hitelt|kölcsön|thm|biztosítás|befektet|lízing|hitelkiváltás|pénzügyi tanácsad/.test(low)) found.push("FINANCIAL_PRODUCTS_SERVICES");
  // only unmistakable signals – "Jó választás!" is everyday Hungarian, not politics
  if (/szavazz|szavazzon|szavazzatok|választási (?:kampány|program|ígéret)|képviselőjelölt|polgármesterjelölt|politikai (?:párt|kampány|hirdetés)|népszavazás/.test(low)) found.push("ISSUES_ELECTIONS_POLITICS");
  return found;
}

export function checkSpecialCategory(text: string, declared: SpecialCategory[]): Verdict {
  const v = emptyVerdict();
  const missing = detectSpecialCategory(text).filter((c) => !declared.includes(c));
  if (missing.includes("ISSUES_ELECTIONS_POLITICS")) {
    v.refuse.push("Politikai/társadalmi ügyhöz kapcsolódó szöveg – ilyen hirdetést a Meta az EU-ban nem enged (2025 ősze óta), az OCP nem indítja.");
  }
  if (!missing.includes("ISSUES_ELECTIONS_POLITICS") && /\bkormány|politik|\bpárt(?:ok|unk|ja)?\b/.test(text.toLowerCase())) {
    v.warn.push("A szövegben politikai/közéleti utalás van – ha ez társadalmi ügyről szól, a Meta az EU-ban nem engedi. Ellenőrizd, hogy tisztán szolgáltatásról szól-e.");
  }
  const rest = missing.filter((c) => c !== "ISSUES_ELECTIONS_POLITICS");
  if (rest.length) {
    const hu: Record<string, string> = { HOUSING: "lakhatás", EMPLOYMENT: "foglalkoztatás", FINANCIAL_PRODUCTS_SERVICES: "pénzügyi termékek" };
    v.warn.push(
      `A szöveg alapján ez speciális kategóriás hirdetésnek tűnik (${rest.map((c) => hu[c]).join(", ")}), de a kampányon nincs megjelölve. Jelölés nélkül a Meta elutasíthatja, és a fiók korlátozást kaphat.`,
    );
    v.alternatives.push(`Kampány speciális kategóriával: ${rest.join(", ")} (ilyenkor kor/nem szerinti célzás nem lehetséges).`);
  }
  return v;
}

// ---------------------------------------------------------------- changes

export function assessBudgetChange(p: {
  current: number;
  next: number;
  learning?: string;
  maxIncreasePct: number;
  userSaidAmount: boolean;
  targetCpl: number;
  name: string;
}): Verdict {
  const v = emptyVerdict();
  const pct = p.current ? ((p.next - p.current) / p.current) * 100 : 100;
  if (p.next > p.current && pct > p.maxIncreasePct && !p.userSaidAmount) {
    v.refuse.push(`${Math.round(pct)}%-os emelés a beállított ${p.maxIncreasePct}%-os korlát felett, és nem a felhasználó adta meg az összeget.`);
    v.alternatives.push(`Emelés legfeljebb ${p.maxIncreasePct}%-kal, vagy kérdezd meg a felhasználót a pontos összegről.`);
  }
  if (Math.abs(pct) > 30) {
    v.warn.push(`${pct > 0 ? "+" : ""}${Math.round(pct)}% egy lépésben („${p.name}”) – ekkora ugrás újraindíthatja a tanulási fázist, és átmenetileg drágább lehet a lead.`);
    v.alternatives.push("Lépcsőzetesen: 20–25% most, újabb 20–25% 2–3 nap múlva.");
  }
  if (p.learning === "LEARNING" && Math.abs(pct) > 10) {
    v.warn.push("A hirdetéscsoport tanulási fázisban van – most minden jelentős változtatás visszaállítja a tanulást.");
    v.alternatives.push("Várj, amíg kijön a tanulásból (kb. 50 lead/hét), utána módosíts.");
  }
  // only when cutting: raising a small budget is a step in the right direction
  if (p.next < p.current && p.next < p.targetCpl * 2) {
    v.warn.push(`Napi ${Math.round(p.next)} a cél CPL (${p.targetCpl}) 2-szeresénél kevesebb – így a csoport nem tud kijönni a tanulásból.`);
  }
  return v;
}

export function assessPause(ad: Ad, siblings: Ad[]): Verdict {
  const v = emptyVerdict();
  const active = siblings.filter((a) => a.status === "ACTIVE");
  if (active.length === 1 && active[0].id === ad.id) {
    v.warn.push(`„${ad.name}” a csoport egyetlen aktív hirdetése – leállítva a teljes hirdetéscsoport leáll.`);
    v.alternatives.push("Előbb tegyél be egy új variánst, és csak utána állítsd le ezt.");
  }
  const withLeads = active.filter((a) => (a.metrics.leads ?? 0) >= 3 && a.metrics.cpl !== null);
  const best = withLeads.sort((a, b) => (a.metrics.cpl ?? 0) - (b.metrics.cpl ?? 0))[0];
  if (best && best.id === ad.id && withLeads.length > 1) {
    v.warn.push(`„${ad.name}” hozza a legolcsóbb leadet a csoportban (CPL ${best.metrics.cpl}) – a legjobbat állítanád le.`);
    v.alternatives.push("Ha fáradt (magas frequency), inkább frissítsd új variánssal mellette, és hagyd futni, amíg az új be nem jön.");
  }
  return v;
}

export function assessLearningEdit(learning: string | undefined, what: string): Verdict {
  const v = emptyVerdict();
  if (learning === "LEARNING") {
    v.warn.push(`A hirdetéscsoport tanulási fázisban van – ${what} most újraindítja a tanulást.`);
    v.alternatives.push("Hagyd még pár napig, vagy tedd az újat egy új hirdetéscsoportba.");
  }
  return v;
}

export function assessNewAdSet(p: {
  objective?: string;
  optimizationGoal: string;
  dailyBudget?: number;
  targetCpl: number;
  ageMin?: number;
  ageMax?: number;
  radiusKm?: number;
  interestCount: number;
  advantageAudience: boolean;
  manualPositions: number;
  siblingsWithOwnBudget: number;
  bidStrategy?: string;
  hasHistory: boolean;
}): Verdict {
  const v = emptyVerdict();
  if (p.objective === "OUTCOME_LEADS" && ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "REACH", "IMPRESSIONS"].includes(p.optimizationGoal)) {
    v.warn.push(`Leadkampányban ${p.optimizationGoal} optimalizálás: a Meta kattintókat/elérést keres, nem kitöltőket – a lead drágább lesz.`);
    v.alternatives.push("optimization_goal: LEAD_GENERATION (instant űrlap) vagy OFFSITE_CONVERSIONS Lead eseménnyel (weboldal).");
  }
  if (p.dailyBudget !== undefined && p.dailyBudget < p.targetCpl * 2) {
    v.warn.push(`Napi ${p.dailyBudget} kevesebb, mint a cél CPL (${p.targetCpl}) kétszerese – nem lesz elég eredmény a tanuláshoz.`);
    v.alternatives.push(`Legalább napi ${p.targetCpl * 2}–${p.targetCpl * 3}, vagy kevesebb csoport nagyobb büdzsével.`);
  }
  const ageSpan = (p.ageMax ?? 65) - (p.ageMin ?? 18);
  if (!p.advantageAudience && ((p.radiusKm !== undefined && p.radiusKm < 15 && (ageSpan < 15 || p.interestCount > 0)) || (ageSpan < 10 && p.interestCount > 2))) {
    v.warn.push("Nagyon szűk közönség (kis sugár + szűk kor/érdeklődés) – Magyarországon ez gyorsan drága és alig fut.");
    v.alternatives.push("Szélesebb kor és terület, vagy Advantage+ közönség a megadott jelekkel javaslatként.");
  }
  if (p.manualPositions === 1) {
    v.warn.push("Egyetlen elhelyezés: a Meta nem tud olcsóbb helyre tenni – jellemzően drágább eredmény.");
    v.alternatives.push("Advantage+ elhelyezések, vagy legalább Feed + Stories + Reels.");
  }
  if (p.siblingsWithOwnBudget >= 3 && (p.dailyBudget ?? 0) < p.targetCpl * 5) {
    v.warn.push(`Már ${p.siblingsWithOwnBudget} saját büdzsés csoport van a kampányban – tovább aprózódik a pénz.`);
    v.alternatives.push("Advantage kampánybüdzsé (CBO), vagy a gyenge csoportok összevonása.");
  }
  if ((p.bidStrategy === "COST_CAP" || p.bidStrategy === "LOWEST_COST_WITH_BID_CAP") && !p.hasHistory) {
    v.warn.push("Költségcél/licitplafon mérés nélküli, új kampánynál: könnyen alig költ semmit.");
    v.alternatives.push("Kezdd „Legnagyobb volumen” licittel, és 1–2 hét adat után állíts költségcélt.");
  }
  return v;
}
