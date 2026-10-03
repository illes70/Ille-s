import type { KnowledgeEntry } from "./types";

// Meta Ads feature guide for the assistant: what each feature is, when to recommend it,
// when not to, and the traps. Written in our own words. Meta changes details often –
// entries marked "(ellenőrizd)" should be double-checked with web search before relying
// on them, and the Meta API's own error message is always the final word.

const at = new Date(0).toISOString();
const k = (id: string, title: string, tags: string[], body: string, source = "OCP Meta funkciókalauz"): KnowledgeEntry => ({
  id,
  title,
  body: body.trim(),
  tags: ["meta-funkció", ...tags],
  source,
  kind: "playbook",
  createdAt: at,
});

export const metaGuide: KnowledgeEntry[] = [
  k(
    "kbm_objectives",
    "Kampánycélok: melyiket mikor",
    ["cél", "objective", "kampány", "leads", "sales", "traffic"],
    `
A Meta 6 kampánycélt ismer (API: OUTCOME_…):
- **Leads (OUTCOME_LEADS)** – érdeklődők gyűjtése: instant űrlap, weboldali űrlap, Messenger/WhatsApp, hívás. Helyi szolgáltatóknak (felújítás, szaki, klíma, oktatás) EZ az alapértelmezés.
- **Sales (OUTCOME_SALES)** – webshop vásárlás vagy weboldali konverzió optimalizálás, működő Pixel + Conversions API kell hozzá.
- **Traffic (OUTCOME_TRAFFIC)** – kattintások / landing oldal megtekintések. Leadgyűjtésre NE: a Meta olcsó kattintókat hoz, nem kitöltőket.
- **Engagement (OUTCOME_ENGAGEMENT)** – reakciók, üzenetek, videómegtekintés, eseményrészvétel. Leadre csak üzenetes (Messenger/WhatsApp) formában.
- **Awareness (OUTCOME_AWARENESS)** – elérés, márkaismertség; helyi szolgáltatónál csak ritkán, nagy piacon.
- **App promotion** – alkalmazás telepítés.

Szabály: a cél azt mondja meg a Metának, kit keressen. Ha a valódi cél a lead, a kampánycél is Leads legyen. „Olcsóbb a kattintás traffic céllal” → igen, de a lead drágább lesz.`,
  ),
  k(
    "kbm_lead_locations",
    "Leadkampány: hova érkezzen a lead (konverziós hely)",
    ["lead", "instant űrlap", "messenger", "whatsapp", "hívás", "weboldal", "conversion leads"],
    `
- **Instant űrlap (destination_type: ON_AD, optimization_goal: LEAD_GENERATION)** – a felhasználó a Facebookon/Instagramon belül tölti ki, előtöltött adatokkal. Legolcsóbb lead, de gyengébb minőségű lehet → minősítő kérdés, „magasabb szándék” űrlap, gyors visszahívás.
- **Weboldal (WEBSITE + Pixel esemény, pl. Lead)** – drágább, de szándékosabb lead. Csak ha a landing oldal gyors, mobilbarát, és a Pixel/CAPI rendesen méri.
- **Weboldal + instant űrlap** – a Meta dönti el, hol jobb; ha mindkettő jól mér, jó választás.
- **Messenger / Instagram Direct / WhatsApp** – beszélgetés indul; jó, ha valaki gyorsan válaszol (vagy automata kérdéssor van). Szaki-piacon gyakran nagyon jó minőség.
- **Hívás (PHONE_CALL)** – azonnali telefon; csak ha nyitvatartásban mindig felveszi valaki.
- **Conversion leads optimalizálás (QUALITY_LEAD)** – a Meta azokra optimalizál, akikből a CRM szerint tényleges ügyfél lett. Ehhez a lead státuszokat vissza kell küldeni a Metának (CRM-integráció / Conversions API) – nagy lépés a minőségben, ha van legalább pár tucat lezárt lead havonta.`,
  ),
  k(
    "kbm_instant_forms",
    "Instant űrlap beállításai részletesen",
    ["űrlap", "instant form", "magasabb szándék", "kérdés", "köszönőoldal"],
    `
- **Típus:** „Nagyobb mennyiség” (gyors, olcsóbb) vagy **„Magasabb szándék”** (is_optimized_for_quality: a beküldés előtt át kell néznie az adatait – kevesebb, de jobb lead). Ha sok a kamu vagy el nem érhető lead → magasabb szándék.
- **Bevezető (context card):** 1–3 mondat: mit kap, mennyi idő alatt, mi a következő lépés. Lehet benne felsorolás.
- **Kérdések:**
  - Előtöltött mezők: név, telefon, e-mail, város stb. – minél kevesebb, annál több lead.
  - **Egyéni feleletválasztós kérdés** (pl. „Mekkora a terület?” 0–50 / 51–100 / 100 m² felett) – a legjobb minőségszűrő, és az OCP ebből automatikusan szűrni tud.
  - Rövid szöveges válasz – csak ha tényleg kell (csökkenti a kitöltést).
  - Feltételes kérdések, időpontfoglalás – haladó, szaki-piacon ritkán kell.
- **Adatvédelmi szabályzat URL kötelező.**
- **Köszönőoldal:** mondja meg, mi történik („24 órán belül hívunk a +36… számról”), gomb: weboldal vagy **hívás** (business_phone_number).
- **Nyelv:** magyar (locale HU_HU).
- Közzététel után az űrlap nem szerkeszthető → új változatot kell készíteni (az OCP verziózza).
- Az Ads Managerből a leadek csak korlátozott ideig (kb. 90 nap) tölthetők le – ezért fontos, hogy az OCP/CRM azonnal behúzza őket.`,
  ),
  k(
    "kbm_budget",
    "Büdzsé: CBO vs. ABO, napi vs. teljes, mennyi kell",
    ["büdzsé", "cbo", "abo", "advantage campaign budget", "költési korlát"],
    `
- **Advantage kampánybüdzsé (CBO)** – a büdzsé a kampányon van, a Meta osztja szét a hirdetéscsoportok között. Ajánlott, ha 2+ csoport ugyanazt a célt szolgálja: kevesebb kézi munka, jobb összköltség.
- **Hirdetéscsoport-büdzsé (ABO)** – minden csoport saját büdzsét kap. Akkor jó, ha egy tesztnek garantált költés kell, vagy két teljesen más ajánlatot/területet hirdetsz.
- **Napi vs. teljes (lifetime) büdzsé:** napi az alap. Teljes büdzsé kell az **ütemezéshez** (csak bizonyos órákban/napokon fusson) és fix időtartamú akciókhoz.
- **Mennyi kell?** A tanulási fázishoz kb. 50 eredmény/hét/csoport kell → ideális napi büdzsé ≈ 7 × cél CPL. Minimum ésszerű: napi 2–3 × cél CPL csoportonként; ennél kevesebből a csoport „Kevés eredmény” állapotban ragad.
- **Szétaprózás:** 5 csoport × 2000 Ft rosszabb, mint 1 csoport × 10 000 Ft. Kevés pénznél kevés csoport.
- **Költési korlát (spend_cap)** a kampányon vagy a fiókon: védelem a túlköltés ellen.
- Büdzsémódosításnál egy lépés max. ~20–25%, 2–3 naponta; nagy ugrás újraindíthatja a tanulást.`,
  ),
  k(
    "kbm_bidding",
    "Licitstratégiák",
    ["licit", "bid", "cost cap", "bid cap", "roas"],
    `
- **Legnagyobb volumen (LOWEST_COST_WITHOUT_CAP)** – alapértelmezés. Új kampánynál mindig ezzel kezdj.
- **Eredményenkénti költségcél (COST_CAP)** – a Meta igyekszik az átlag CPL-t a cél körül tartani. Ha túl alacsonyra állítod, alig költ. Csak ha már ismert a reális CPL, és stabil a volumen.
- **Licitplafon (LOWEST_COST_WITH_BID_CAP)** – aukciónkénti maximum; haladó, könnyű vele „megfojtani” a kampányt.
- **ROAS-cél (LOWEST_COST_WITH_MIN_ROAS)** – webshopnál, értékalapú optimalizálással.
Ha a felhasználó „olcsóbb leadet” akar és cost capet kér, figyelmeztess: a cost cap nem csinál olcsóbb leadet a semmiből, inkább kevesebbet költ.`,
  ),
  k(
    "kbm_audience",
    "Célzás: Advantage+ közönség, széles, érdeklődés, egyéni és hasonmás közönség",
    ["célzás", "közönség", "advantage+", "lookalike", "hasonmás", "érdeklődés", "helyszín"],
    `
- **Advantage+ közönség (targeting_automation.advantage_audience = 1)** – a Meta a megadott jeleket csak javaslatként kezeli, és túl is léphet rajtuk, ha ott jobb az eredmény. Helyi leadgenerálásnál általában ez vagy a széles célzás teljesít a legjobban.
  - Kemény korlátként működik: a **helyszín**, a **minimális életkor** és a **kizárt egyéni közönségek**; a többi (érdeklődés, felső korhatár, nem) javaslat (ellenőrizd az aktuális szabályt).
- **Széles célzás** (csak hely + kor) – nagyon gyakran jobb, mint a szűk érdeklődés; a kreatív végzi a célzást.
- **Részletes célzás (érdeklődés/viselkedés)** – kis piacon könnyen túl szűk lesz; ha mégis, több rokon érdeklődést tegyél egy csoportba. A részletes célzás *kizárása* már nem használható (ellenőrizd).
- **Helyszín:** ország, megye/régió, város + sugár (km), vagy egyéni pont (lat/lng + sugár). Helyi szolgáltatónál: a kiszállási terület. Túl kis sugár → drága, alig fut.
- **Egyéni közönség (Custom Audience):** weboldal-látogatók (Pixel), instant űrlapot megnyitók/kitöltők, oldal- és Instagram-aktívak, videónézők, **ügyféllista** (telefon/e-mail, a Meta hash-elve kapja).
- **Hasonmás közönség (Lookalike):** a legjobb forrás a *megnyert ügyfelek* listája (min. ~100 fő); 1% = leghasonlóbb, 1–3% a jó kiindulás Magyarországon. Leadekből is működik, de az ügyfelekből jobb.
- **Kizárás:** a már ügyfeleket/kitöltőket zárd ki a megszerző kampányból.
- Ne bontsd szét a közönséget kor/nem szerint külön csoportokba – a Meta ezt maga megoldja.`,
  ),
  k(
    "kbm_placements",
    "Elhelyezések és méretek",
    ["elhelyezés", "placement", "reels", "story", "méret", "képarány"],
    `
- **Advantage+ elhelyezések** (minden elhelyezés) – alapértelmezés; a Meta oda tesz, ahol olcsóbb az eredmény. Ajánlott, ha van 4:5 és 9:16 változat is.
- **Kézi elhelyezés** akkor, ha: a kreatív csak egy formátumban van, vagy az Audience Network rossz minőségű leadet hoz (ilyenkor zárd ki).
- **Képarányok:** Feed 4:5 (1080×1350) vagy 1:1 (1080×1080); Stories/Reels 9:16 (1080×1920); jobb oldali hasáb 1,91:1.
- **Biztonsági zóna (Reels/Stories):** a felső ~14% és az alsó ~35% sávban ne legyen fontos szöveg/logó (ott van a profil, a felirat és a gomb).
- **Szöveghossz:** a fő szövegből kb. az első 125 karakter látszik „Továbbiak” nélkül → a lényeg az elejére. Címsor ~40 karakter, leírás ~30.
- **Videó:** az első 3 másodperc a horog; legyen felirat (sokan hang nélkül nézik); Reelsre 15–30 mp, álló formátum.`,
  ),
  k(
    "kbm_creative_formats",
    "Kreatívformátumok és Advantage+ kreatív",
    ["kreatív", "formátum", "karusszel", "videó", "advantage+ creative", "szövegváltozatok"],
    `
- **Egyképes** – helyi szolgáltatónál a legjobb kiindulás (pl. zöld dobozos recept).
- **Videó** – munka közben, előtte/utána, ügyfélvélemény; olcsóbb figyelem, jó Reelsre.
- **Karusszel (2–10 kártya)** – több munka/szolgáltatás egymás után, vagy lépésről lépésre folyamat.
- **Advantage+ kreatív fejlesztések** – a Meta automatikusan módosíthatja a hirdetést (szövegvariálás, kép világosítás/kivágás, animáció, zene, CTA kiemelés). Előnye: olcsóbb eredmény lehet. Kockázata: **átírhatja a szöveget és az árat érintő mondatokat**, a kép kivágása levághatja a szöveget. Áras, pontos szöveges képeknél (zöld dobozos) a **szöveg- és képmódosítást kapcsold ki**, a többit lehet tesztelni.
- **Több szövegváltozat** (több fő szöveg / címsor egy hirdetésben) – a Meta kombinálja őket; jó gyors teszteléshez, de nehezebb megmondani, melyik nyert.
- **Partnerhirdetés** – egy másik profil (pl. elégedett ügyfél, influenszer) nevében fut; erős bizalmi jel.
- **Instagram-megjelenés:** a hirdetés a cég Instagram-fiókjával fusson (instagram_user_id), ne az oldal nevével – hitelesebb.
- **URL paraméterek (url_tags):** weboldalas kampánynál mindig legyen UTM (utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}).`,
  ),
  k(
    "kbm_special_categories",
    "Speciális hirdetési kategóriák, EU-s szabályok (DSA, politikai hirdetés)",
    ["speciális kategória", "ingatlan", "állás", "hitel", "politika", "dsa", "eu"],
    `
- **Speciális kategória** kötelező, ha a hirdetés: **lakhatás** (ingatlan eladás/kiadás, albérlet, lakáshitel), **foglalkoztatás** (állásajánlat, toborzás), **pénzügyi termékek/szolgáltatások** (hitel, kölcsön, biztosítás, befektetés), vagy **társadalmi/politikai ügy**.
- Ilyenkor a Meta korlátozza a célzást: nem lehet kor/nem szerint szűkíteni, a helyszín sugara korlátozott, a részletes célzás és a hasonmás közönség korlátozott.
- Ha nem jelölöd meg, a hirdetést elutasíthatják, és ismétlődésnél a fiók korlátozást kaphat → **ilyet nem indítunk el kategória nélkül.**
- **Toborzás szaki-cégnél** (pl. „Villanyszerelőt keresünk”) = foglalkoztatás kategória.
- **EU – DSA:** EU-ban célzott hirdetéscsoportnál kötelező megadni a **kedvezményezettet (dsa_beneficiary)** és a **fizetőt (dsa_payor)** – az OCP alapból a cég nevét írja be.
- **Politikai/választási/társadalmi ügyek:** a Meta 2025 ősze óta nem enged ilyen hirdetést az EU-ban (ellenőrizd).`,
  ),
  k(
    "kbm_policy",
    "Hirdetési irányelvek: mi miatt utasít el a Meta",
    ["irányelv", "elutasítás", "policy", "személyes tulajdonság", "előtte-utána"],
    `
- **Személyes tulajdonság állítása:** nem utalhat a szöveg arra, hogy a néző *ilyen-olyan* (egészség, súly, betegség, anyagi helyzet, adósság, vallás, etnikum, szexuális irányultság, büntetett előélet). ✗ „Te is szenvedsz a hátfájástól?” ✓ „Hátfájás? Segítünk.” / „Gyógytorna hátfájásra Budaörsön.”
- **Előtte/utána** testről (fogyás, kozmetika) tilos vagy erősen korlátozott; felújításnál (fürdőszoba, udvar) rendben van.
- **Túlzó/valótlan ígéret:** „garantált”, „100% biztos”, „orvosok utálják” – kerülendő; a garancia csak valós, feltételekkel.
- **Megtévesztő ár:** az ár a hirdetésben feleljen meg a valóságnak („-tól” rendben).
- **Kattintásvadászat:** „Kattints ide!”, „Nem fogod elhinni” – rontja a megjelenést.
- **Csupa nagybetű, túl sok felkiáltójel, emoji-özön** – rontja a minőséget.
- **Landing oldal:** működjön, egyezzen a hirdetéssel, legyen adatvédelmi tájékoztató.
- **Elutasításkor:** az ok a Fiókminőség (Account Quality) oldalon látszik; javítsd a hirdetést (új kreatív), vagy ha tévedés, kérj felülvizsgálatot. Sorozatos elutasítás a fiókot veszélyezteti.`,
  ),
  k(
    "kbm_tracking",
    "Mérés: Pixel, Conversions API, attribúció, UTM",
    ["pixel", "capi", "conversions api", "attribúció", "mérés", "utm"],
    `
- **Pixel + Conversions API (CAPI)** együtt: a böngészős Pixel sok eseményt elveszít (iOS, reklámblokkolók), a szerveroldali CAPI pótolja. Weboldalas kampányhoz mindkettő kell.
- **Eseményminőség (Event Match Quality):** minél több egyeztető adat (e-mail, telefon hash-elve), annál jobb az optimalizálás.
- **Attribúció:** alapból 7 napos kattintás + 1 napos megtekintés. Instant űrlapnál ez kevésbé számít; weboldalnál ezzel értékeld az eredményt, és ne hasonlítsd a Google Analytics számaival egy az egyben.
- **UTM paraméterek** minden weboldalas hirdetésen, hogy a weboldali analitikában is látszódjon.
- **CRM-visszacsatolás (conversion leads):** ha a lead státusza (felhívva, megnyert) visszamegy a Metának, a Meta a jó leadekre tud optimalizálni.`,
  ),
  k(
    "kbm_testing",
    "Tesztelés: hogyan teszteljünk jól",
    ["teszt", "a/b", "kísérlet", "kreatívteszt"],
    `
- **Egyszerre egy változót tesztelj** (kép VAGY horog VAGY ajánlat), különben nem tudod, mi hatott.
- **Kreatívteszt** a legegyszerűbben: új hirdetések a már működő csoportba (nem indul újra a csoport tanulása). A Meta gyorsan a nyerő felé tolja a költést – ez nem „igazságos” teszt, de a gyakorlatban jó.
- **Tiszta A/B teszt** (Meta Kísérletek / A/B teszt) – a közönséget kettéosztja, statisztikai eredményt ad. Akkor érdemes, ha nagy a tét (pl. Leads vs. Messenger cél, űrlaptípus), és van rá elég pénz (legalább ~7 nap, csoportonként több tucat eredmény).
- **Döntés:** legalább 3–7 nap és értelmes számú lead után; egy nap alapján ne dönts.
- Egy ismert módszer: 3 kép × 2 fő szöveg × 2 címsor dinamikus kombinációban – gyorsan megmutatja az irányt.`,
  ),
  k(
    "kbm_structure",
    "Fiókstruktúra helyi leadgeneráláshoz",
    ["struktúra", "kampány", "hirdetéscsoport", "konszolidáció"],
    `
- **Konszolidálj:** 1 kampány szolgáltatásonként / ajánlatonként, benne 1–3 hirdetéscsoport, csoportonként 3–6 aktív hirdetés.
- Ne legyen két csoport ugyanarra a közönségre (átfedés → egymás ellen licitálnak).
- Retargeting (űrlapot megnyitók, weboldal-látogatók) csak akkor külön, ha van elég méretű közönség (néhány ezer fő); kis piacon gyakran felesleges.
- A nyerő hirdetéseket ne másold szét sok helyre; inkább emeld a csoport büdzséjét fokozatosan.
- Elnevezés legyen beszédes: „Lead – Térkövezés – Békés – Széles”.`,
  ),
  k(
    "kbm_delivery",
    "Szállítási problémák: kevés költés, drága CPM, kevés eredmény",
    ["szállítás", "cpm", "kevés eredmény", "learning limited", "diagnosztika", "szezon"],
    `
- **Alig költ:** túl kicsi közönség, túl alacsony cost cap/bid cap, elutasított/ellenőrzés alatti hirdetés, fizetési probléma, költési korlát elérve.
- **Kevés eredmény (learning limited):** nincs meg a heti ~50 eredmény → csoportok összevonása, szélesebb célzás, nagyobb büdzsé, vagy könnyebb esemény.
- **Drága CPM:** szűk közönség, gyenge kreatív (alacsony minőségi rangsor), szezon (Q4, Black Friday, karácsony előtt mindenki hirdet), magas frequency.
- **Hirdetés-relevancia diagnosztika:** minőségi, interakciós és konverziós rangsor – az átlag alatti érték a kreatív vagy az űrlap/landing problémáját jelzi.
- **Szezonalitás:** november–december elején drágább az elérés; januárban, nyár közepén gyakran olcsóbb. Helyi szolgáltatásoknak saját szezonjuk van (klíma: tavasz–nyár, fűtés: ősz).`,
  ),
  k(
    "kbm_messaging_calls",
    "Üzenetes és hívásos hirdetések",
    ["messenger", "whatsapp", "hívás", "üzenet"],
    `
- **Kattintás Messengerre/WhatsAppra:** a felhasználó egy előre megírt kérdéssel indít beszélgetést. Akkor erős, ha 5–15 percen belül válaszol valaki; egyébként a lead kihűl.
- Érdemes **automatikus kérdéssort** beállítani (szolgáltatás, terület, időpont), így a beszélgetés eleve minősített.
- **Hívásos hirdetés:** a gomb azonnal tárcsáz; csak nyitvatartásban futtasd (ütemezés = teljes büdzsé kell hozzá).
- Mérés: üzenetes kampánynál a „beszélgetés indult” nem lead – az OCP-ben a ténylegesen minősített beszélgetést rögzítsd leadként.`,
  ),
  k(
    "kbm_retargeting",
    "Újracélzás (meleg közönségek)",
    ["retargeting", "újracélzás", "meleg közönség", "egyéni közönség"],
    `
- Jó források: **űrlapot megnyitók, de be nem küldők** (30 nap), weboldal-látogatók (14–30 nap), videót 50%+ megnézők, oldal/Instagram aktívak (90 nap).
- Üzenet: bizalom és sürgetés – vélemények, előtte/utána, „még van szabad időpont szeptemberre”.
- Kis piacon a közönség pár száz–pár ezer fő → magas frequency gyorsan; kis büdzsé, és a frequency figyelése.
- Zárd ki a már leadet adókat és ügyfeleket.`,
  ),
  k(
    "kbm_ad_library",
    "Hirdetéstár: versenytárs- és trendfigyelés",
    ["hirdetéstár", "ad library", "versenytárs", "trend"],
    `
- Az EU-ban (DSA miatt) a Meta Hirdetéstárában minden futó hirdetés látszik, nem csak a politikai.
- **Amit nézz:** mióta fut (a hónapok óta futó hirdetés szinte biztosan nyerő), milyen formátum, milyen ajánlat/ár, milyen horog.
- Ne másolj: a nyerő *mintát* (ár a képen, előtte/utána, vélemény) vedd át, a saját munkafotóval és ajánlattal.`,
  ),
  k(
    "kbm_account_health",
    "Fiók egészsége: korlátozás, fizetés, biztonság",
    ["fiók", "fizetés", "korlátozás", "account quality", "biztonság"],
    `
- **Fizetési hiba** → a hirdetések leállnak; a kártyát/egyenleget a Számlázás oldalon kell rendezni.
- **Költési korlát a fiókon (spend_cap)** → ha eléri, minden leáll; emeld vagy nullázd a Számlázásnál.
- **Fiókminőség (Account Quality)** oldalon látszanak az elutasítások, korlátozások és a felülvizsgálat kérése.
- **Biztonság:** kétlépcsős azonosítás minden adminon, Business Manager ellenőrzés (business verification) – nélküle egyes funkciók (pl. bizonyos API-hozzáférések) nem érhetők el.
- Új fióknál a Meta eleinte napi költési limitet alkalmazhat; ez fokozatosan nő.`,
  ),
  k(
    "kbm_advisor",
    "Mikor szóljon vissza az asszisztens (szakmai vélemény)",
    ["vélemény", "kockázat", "megerősítés", "elutasítás"],
    `
**Figyelmeztet és megerősítést kér, ha:**
- tanulási fázisban lévő csoportot szerkesztenél (célzás, kreatív, nagy büdzsé, optimalizálás) – újraindul a tanulás;
- egy lépésben 25–30%-nál nagyobb büdzsémódosítás;
- a csoport egyetlen vagy legjobb (legolcsóbb leadet hozó) hirdetését állítanád le;
- a napi büdzsé a cél CPL 2-szeresénél kevesebb (nem fog kijönni a tanulásból);
- túl szűk a közönség (kis sugár + szűk kor + érdeklődés), vagy egyetlen elhelyezés;
- leadcélhoz kattintás/elérés optimalizálást választanál;
- cost cap-et/bid cap-et kérnél új, még mérés nélküli kampánynál;
- túl sok kis csoportra aprózod a büdzsét;
- Advantage+ szövegmódosítás áras/pontos szövegű kreatívon.

**Megtagadja (nem csinálja meg), ha:**
- a szöveg személyes tulajdonságot állít (egészség, anyagi helyzet stb.), megtévesztő vagy diszkriminatív;
- lakhatás/állás/hitel témájú hirdetés speciális kategória nélkül;
- a büdzsé emelése a felhasználó által megadott keret felett van, és nem ő mondta az összeget;
- valótlan állítás, más márkájának/arcának jogosulatlan használata.
Ilyenkor elmondja, miért nem, és ad egy szabályos alternatívát.`,
  ),
];
