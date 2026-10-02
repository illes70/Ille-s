import type { KnowledgeEntry } from "./types";

// OCP decision playbook. Written in our own words; the "source" field says where an idea comes from.
// The user's own entries (kind: "own") always take priority over these.

const at = new Date(0).toISOString();
const k = (id: string, title: string, tags: string[], body: string, source?: string): KnowledgeEntry => ({
  id,
  title,
  body: body.trim(),
  tags,
  source,
  kind: "playbook",
  createdAt: at,
});

export const knowledgeSeed: KnowledgeEntry[] = [
  k(
    "kb_learning",
    "Tanulási fázis: mikor ne nyúlj hozzá",
    ["meta", "tanulási fázis", "büdzsé", "szerkesztés"],
    `
- A Meta egy hirdetéscsoportot akkor tekint „stabilnak”, ha kb. 50 optimalizálási eseményt (nálunk: leadet) kap 7 nap alatt. Addig tanulási fázisban van, az eredmények ingadoznak.
- Tanulás alatt NE módosíts jelentősen: célzás, optimalizálási cél, licitstratégia, kreatívcsere vagy nagy büdzsémódosítás újraindítja a tanulást.
- Ha egy csoport „Kevés eredmény” (learning limited) állapotban ragad: vond össze a hasonló csoportokat, bővítsd a közönséget, vagy emeld a büdzsét annyira, hogy elérhető legyen a heti ~50 lead.
- Döntést tanulás alatt csak egyértelmű pénzégetésnél hozz (lásd: Leállítási szabályok).`,
    "Meta Business Help Center – Learning phase",
  ),
  k(
    "kb_kill",
    "Leállítási szabályok (mikor kapcsolj le egy hirdetést)",
    ["leállítás", "döntés", "cpl"],
    `
- 0 lead, és a költés elérte a cél CPL 2–3-szorosát → leállítás. Ennél tovább várni ritkán éri meg.
- Van lead, de a CPL tartósan a cél 1,5–1,6-szorosa felett van, és legalább 4× cél CPL-nyi költés mögötte → leállítás vagy kreatívcsere.
- Egy nap rossz eredménye nem ok a leállításra: legalább 3 nap adatot nézz, hacsak nem pénzégetés.
- Mielőtt leállítasz egy csoportban egy hirdetést, nézd meg, hogy nem ez-e az egyetlen, ami hoz – a csoport egészének CPL-je számít.`,
  ),
  k(
    "kb_scale",
    "Skálázás: hogyan emelj büdzsét biztonságosan",
    ["skálázás", "büdzsé"],
    `
- Csak stabil (nem tanulási fázisú) csoportot skálázz, amelyik legalább 10 leadet hozott a cél CPL 75%-a alatt.
- Egy lépésben kb. 15–25% emelés, 2–3 naponta. Nagyobb ugrás gyakran visszaüti a tanulást és drágítja a leadet.
- Gyors skálázáshoz inkább duplikáld a nyerő csoportot új (vagy tágabb) közönségre, és hagyd az eredetit békén.
- Emelés után 48 óráig ne értékelj, a Meta ennyi idő alatt áll be.`,
    "Általános iparági gyakorlat",
  ),
  k(
    "kb_fatigue",
    "Kreatív fáradás és frissítés",
    ["kreatív", "frequency", "ctr"],
    `
- Jelek: 7 napos frequency 3–3,5 fölött, a CTR esik, a CPM és a CPL nő.
- Megoldás: ne a régit szerkeszd (az újraindítja a tanulást), hanem tegyél be 2–3 új variánst ugyanabba a csoportba.
- Variálás sorrendje: 1) kép/első képkocka, 2) első mondat (horog), 3) ajánlat megfogalmazása. Egyszerre egy dolgot változtass, hogy tudd, mi hatott.
- „Több, jobb, új”: a nyerőből csinálj többet (variánsok), tedd jobbá (kisebb javítások), és mindig legyen 1-2 teljesen új ötlet tesztben.`,
  ),
  k(
    "kb_value",
    "Ajánlatépítés: az értékegyenlet",
    ["ajánlat", "hormozi", "szöveg"],
    `
Az ajánlat észlelt értéke négy dologtól függ:
- Álomeredmény: mit kap a végén (pl. „új fürdőszoba”) – minél konkrétabb, annál erősebb.
- Valószínűség: mennyire hiszi el, hogy sikerül (vélemények, előtte/utána, garancia, darabszám: „312 elégedett ügyfél”).
- Időtartam: mennyi idő az eredményig (pl. „10 nap alatt”, „holnap már hívunk”) – a rövidebb értékesebb.
- Erőfeszítés: mennyi macera neki (pl. „30 másodperces űrlap”, „mindent intézünk”) – a kevesebb értékesebb.
Hirdetésszövegnél mind a négyet érintsd: az első kettőt növeld, az utolsó kettőt csökkentsd.`,
    "Alex Hormozi: $100M Offers (saját összefoglaló)",
  ),
  k(
    "kb_offer",
    "Ellenállhatatlan ajánlat elemei",
    ["ajánlat", "hormozi", "garancia", "sürgetés"],
    `
- Konkrét ár vagy „-tól” ár: a szolgáltatóknál az ár a hirdetésben szűr és bizalmat épít (lásd Zöld dobozos recept).
- Garancia: fix ár, fix határidő, „ha nem készül el, X% visszajár” – csökkenti a kockázatot.
- Bónusz: ingyenes felmérés, ingyenes tervezés, takarítás a munka után.
- Szűkösség/sürgetés csak valós lehet: „ősszel a legjobb az ár”, „heti 3 új munkát vállalunk”.
- Szűrő mondat (pl. „csak 50 m² feletti munka”) csökkenti a használhatatlan leadeket – inkább kevesebb, de jobb lead.`,
    "Alex Hormozi: $100M Offers (saját összefoglaló)",
  ),
  k(
    "kb_hooks",
    "Horgok és hirdetésszerkezet",
    ["horog", "szöveg", "hormozi"],
    `
Szerkezet: 1) megszólítás/horog, 2) érték/bizonyíték, 3) egyértelmű felszólítás.
Bevált horogtípusok helyi szolgáltatásra:
- Kit szólít meg: „Budapesti lakás, régi fürdőszoba?”
- Eredmény + idő: „Új fürdőszoba 10 nap alatt”
- Ár: „Térkövezés 17 000 Ft/m²-től, anyaggal”
- Probléma: „Áramszünet? 2 órán belül ott vagyunk”
- Bizonyíték: „4.9★ – 312 elégedett ügyfél”
A képen egyetlen felszólítás legyen. Az első mondat a hirdetés 80%-a: azt teszteld a legtöbbet.`,
    "Alex Hormozi: $100M Leads (saját összefoglaló) + saját gyakorlat",
  ),
  k(
    "kb_forms",
    "Instant form (lead űrlap) beállítás",
    ["űrlap", "lead minőség"],
    `
- Rövid űrlap (név, telefon, 1 minősítő kérdés) = több és olcsóbb lead. „Magasabb szándék” típus + egy minősítő kérdés (méret, időpont) = kevesebb, de jobb lead.
- A minősítő kérdés legyen egyszerű választós (pl. „Mekkora a terület?” 0–50 / 51–100 / 100 m² felett) – így a méret automatikusan szűrhető.
- Köszönőoldalon írd meg, mi a következő lépés („24 órán belül hívunk a +36… számról”).
- Telefonszám mezőnél a Meta előtölti a profilból – ezért fontos az azonnali visszahívás (5 percen belül a legjobb).`,
  ),
  k(
    "kb_local",
    "Helyi szolgáltatók hirdetései – magyar piac",
    ["helyi", "magyar", "kreatív"],
    `
- Valódi munkafotó jobban teljesít, mint a stockfotó vagy a túl „AI-s” kép.
- Az ár Ft/m², Ft/db vagy „-tól” formában, egységgel; sáv („7–9 ezer”) helyett egy szám.
- Terület megnevezése a szövegben vagy a képen („Békés megye”, „Budapest és környéke”) növeli a relevanciát.
- Tegeződő, közvetlen hang; rövid mondatok; nincs túlzó ígéret.`,
  ),
];
