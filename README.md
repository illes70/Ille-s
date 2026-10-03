# OCP

AI hirdetéskezelő: a Meta hirdetési fiókodat egy chat-asszisztens kezeli helyetted. Figyel, javasol, és amit kérsz, megcsinálja, így az Ads Managert nem kell megnyitnod.

## Mit tud most (v0.6)

**Mindenkinek saját, elzárt fiók.** Minden regisztráló (te is) külön munkaterületet kap: saját adatmappa, saját Facebook-kapcsolat, saját élő csatorna, képtár, leadek és chat. Egy ügyfél semmilyen úton nem látja a másikét – ezt automata teszt is ellenőrzi (más fiók képe: 404, más fiók eseményei nem érkeznek meg, más fiók lépése nem vonható vissza, a tulajdonos `.env` tokenje más fiókban soha nem használódik).

**Új ügyfél (pl. Kis József) útja:**
1. Beállítások → **Új ügyfél meghívása** → egyszer használható link (14 napig érvényes) → elküldöd neki.
2. Regisztrál, belép → **Csatlakoztatás Facebookkal** → a Facebook ablakban „Tovább”.
3. Feljön: **„Engedélyezed, hogy az összes leadet bekössem?”** → Igen → minden oldal leadje bejön (90 napra visszamenőleg), az újak másodpercek alatt; ahol a Meta nem engedi, pontos javítási lépés.
4. Minden fiókja élőben látszik. A robotpilóta valódi fióknál „mindig kérdez” módban indul.

**Minden módosítás a te igeneddel.** A Metán semmi nem indul, nem áll le és nem változik jóváhagyás nélkül – ezt a kód kényszeríti ki, nem csak az asszisztens utasítása. Az asszisztens a lépéseket egy **„Erre gondoltam – mehet?”** kártyán mutatja (mit, miért, mennyi); a lépéseket kipipálhatod, és a **Mehet** gombbal indítod – vagy írásban: „mehet, de a 2-t hagyd ki”, „a büdzsé legyen 5000”. Összefüggő lépések (kampány → csoport → hirdetések) egy kártyán mennek. Ha a szakmai fék egy lépésnél aggályt jelez, külön „Figyelmeztetés – mégis mehet?” kártya jön. A robot magától csak javasol.

**0–24 robot** (a szerveren fut, akkor is, ha senki nem nézi):
- **Reggeli összefoglaló** a beállított időben (alap 7:30): „Jó reggelt, … – tegnap ennyi lead jött ennyiért, ma ez a dolgod”, a teendők egy kattintással jóváhagyhatók. Telefonra és e-mailben is.
- **Óránkénti átvizsgálás** minden fiókra – javaslatok a Javaslatok fülre, egy kattintással jóváhagyhatók.
- **Napi költési plafon** fiókonként (Cégprofil): túllépéskor azonnali riasztás + egy kattintásos „minden leállítása” javaslat (magától nem állít le semmit).
- **Lejáró Facebook-kapcsolat** előtt egy héttel szól.

**Azonnali lead-értesítés (speed-to-lead):** új leadnél másodperceken belül push a telefonra (telepíthető app: iPhone-on „Főképernyőhöz adás”) és e-mail. **Spamszűrő:** kamu név, hibás vagy kamu telefonszám, eldobható e-mail, ismételt jelentkezés – a spam nem csörög, a Leadek oldalon jelölve.

**Visszavonás egy kattintással:** a Robot élőben oldalon minden státusz- és büdzséváltoztatás (asszisztens, robotpilóta, költési plafon, te) visszavonható.

**AI képek három szinten, költségkerettel:** *Ingyenes* (FLUX a Cloudflare napi ingyenes keretéből – vázlat, háttér), *Erős* (Google Gemini „Nano Banana”, ~0,04 $/kép, valódi munkafotót is feljavít), *Prémium* (OpenAI GPT Image magas minőség – a ChatGPT képmodellje, ~0,2 $/kép). Az asszisztens ingyenes vázlatokkal ötletel, és csak a kiválasztott végleges képet készíti erősben; ugyanaz a kérés másodszorra a képtárból jön (nem kerül pénzbe); a pontos szöveg a képen mindig ingyenes sablon. **Beállítások → AI és költségek:** havi költés élőben (chat, összefoglaló, képek), asszisztens mód (Maximális / Kiegyensúlyozott / Takarékos), havi keret 80%-os figyelmeztetéssel, kereten túl takarékos mód vagy leállás. A hosszú cégenkénti chatet a szerver automatikusan tömöríti, így nem drágul a beszélgetés hosszával.

**Adatvédelem:** nyilvános adatkezelési tájékoztató (`/privacy`, a Meta App Review-hoz is kell), lead-engedély naplózva (ki, mikor), visszavonható, fiók és minden adat törölhető.

### v0.5

**Az asszisztens = tapasztalt Meta-hirdetéskezelő + ajánlatstratéga.** Mindent meg tud csinálni chatből, amit egy leadgeneráló hirdető az Ads Managerben csinál:
- **Elemzés:** fiókállapot (fizetés, költési korlát, elutasított hirdetések okkal, Pixel), teljes kampánystruktúra érthetően, bontások (kor, nem, elhelyezés, régió, eszköz, napszak), Hirdetéstár (versenytársak, 30+ napja futó nyerők).
- **Építés:** kampány (cél, speciális kategória, CBO/ABO, licitstratégia, költési korlát) → hirdetéscsoport (optimalizálás, instant űrlap / weboldal / Messenger / WhatsApp / hívás, célzás, Advantage+ közönség és elhelyezések, ütemezés, attribúció, EU-s DSA) → hirdetések (kép, karusszel, videó, UTM, Instagram-profil, Advantage+ kreatív be/ki) → instant űrlap (magasabb szándék, feleletválasztós minősítő kérdés, köszönőoldal hívás-gombbal).
- **Közönségek:** célzáskeresés, közönségméret-becslés, egyéni közönség (weboldal, űrlapot megnyitók, oldal-/Instagram-aktívak, **ügyféllista az OCP megnyert leadjeiből**, hash-elve), hasonmás közönség.
- **Módosítás:** státusz és büdzsé minden szinten, célzás, másolás (kampány / csoport / hirdetés), kreatívcsere.
- **Tudás:** a tudásbázisban egy részletes Meta funkciókalauz (célok, konverziós helyek, űrlapok, büdzsé, licit, célzás, elhelyezések és méretek, formátumok, speciális kategóriák és EU-szabályok, irányelvek, mérés, tesztelés, struktúra, szállítási problémák, retargeting, fiókegészség) és Hormozi-féle ajánlatépítés – a saját tapasztalataid ezeket felülírják.

**Szakmai fék – kódban, nem csak a promptban.** A módosító eszközök kockázatos lépésnél nem hajtanak végre semmit:
- *Megerősítést kér* („szerintem ez nem jó ötlet, mert…”): tanulási fázis közbeni szerkesztés, 30% feletti büdzséugrás, a csoport egyetlen/legjobb hirdetésének leállítása, túl kicsi büdzsé vagy közönség, egyetlen elhelyezés, leadhez kattintás-optimalizálás, rossz kampánycél, cost cap mérés nélkül, aprózott büdzsé, gyanús speciális kategória.
- *Megtagadja*: személyes tulajdonságra utaló szöveg („Szenvedsz…?”, „Adósságod van?”), politikai hirdetés, speciális kategóriás kampány tiltott célzása (kor/nem/kis sugár), a megadott emelési keret túllépése, ha nem a felhasználó mondta az összeget.

**Új ügyfél = nulla beállítás.** Ha egy ügyfél hozzáférést ad, az OCP 5 percen belül magától észreveszi, értesít, kitölti a cégprofilt a Facebook-oldalról (név, telefon, weboldal, cím, logó, Instagram), és behúzza a hirdetéseket és képeket. A Business Managerben látható, de még hozzád nem rendelt ügyfélfiókoknál az Áttekintésen egy gomb: **Hozzáférés beállítása**.

**Előnézet:** a hirdetés részletnézetében a Meta saját előnézete Facebook / Instagram / Story / Reels formában.

### Korábbi verziók


**Regisztráció → egy gomb → minden fiók.** Regisztrálsz (e-mail + jelszó), az Áttekintés oldalon rányomsz a **Csatlakozás Facebookkal** gombra, és visszatérés után:
1. **1–2 másodperc:** minden hirdetési fiókod a mai és 7 napos számokkal (egyetlen Meta *batch* kérés, akár 50 fiók egyszerre).
2. **Utána, élő haladásjelzővel:** fiókonként a hirdetések, a 90 napos napi adatok és a kreatívok képei.
3. **Onnantól:** a háttérfigyelő percenként frissít minden fiókot, a leadek webhookon másodpercek alatt jönnek.

**A Metán futó képek.** Csatlakozás után nincs teendő: az OCP a Meta API-ból behúzza minden hirdetés képét. Mivel a Meta képlinkjei lejárnak, az OCP az **eredeti, teljes felbontású** képet egyszer letölti és eltárolja (`/api/creative/<id>`): képes hirdetésnél a feltöltött eredetit (kép-hash alapján), videónál a borítót, karusszelnél az első kártyát. A Meta kreatívjai nem változnak, így a tárolt kép mindig érvényes.

**Minden élő.** A szerver figyeli a Metát, és a változást azonnal kiküldi a böngészőnek (Server-Sent Events). Új lead esetén a szám rögtön átvált (animálva), és jobb felül megjelenik az értesítés. A leadek webhookon másodpercek alatt jönnek; a költés/megjelenés a Metánál is néhány perc késéssel frissül – az OCP alapból percenként kérdezi (`META_POLL_SECONDS`), és kiírja, mikor frissült utoljára.

| Oldal | Mire jó |
|---|---|
| **Áttekintés** (`/overview`) | Minden hirdetési fiók egy képernyőn, élő mai és 7 napos számokkal. Kattintásra az adott fiók hirdetései. |
| **Asszisztens** (`/`) | Cégenkénti chat. Hirdetések elemzése, leállítás/indítás, büdzsé, új hirdetések tömegesen, kép- és szövegcsere futó hirdetésen, hirdetéskép készítése, instant form, leadek, webes kutatás. Képet behúzhatsz, beilleszthetsz vagy csatolhatsz. |
| **Javaslatok** (`/inbox`) | Amit az asszisztens magától csinálna – „Mehet” → végrehajtja. |
| **Hirdetések** (`/ads`) | Szűrők, időszak, KPI-k (élő számok), grafikon, lead-tölcsér, kreatívok **valódi, teljes képpel** (1080 px, videónál borítókép), csoportonként vagy listában. Részletnézet: napi grafikon, leállítás, Ads Manager link. |
| **Leadek** (`/leads`) | Leadek státusszal (Új → Felhívva → Felmérés → Megnyert / Elveszett). |
| **Cégprofil** (`/company`) | Szolgáltatások és árak, telefon, terület, „miért mi”, hangnem, színek, Facebook-oldal, cég képtára. Ebből ír és tervez az asszisztens. Egy kattintással kitölthető a Facebook-oldalról. |
| **Receptek** (`/recipes`) | Bevált kreatívformák (Nem változhat / Kötelező / Szabad + szövegsablon). |
| **Tudásbázis** (`/knowledge`) | A saját tapasztalataid (elsőbbséget kapnak) + OCP döntési kézikönyv (tanulási fázis, leállítás, skálázás, kreatív fáradás, ajánlatépítés az értékegyenlettel, horgok, űrlapok). |
| **Robot élőben** (`/activity`) | Valós idejű napló mindenről, amit a robot néz és csinál. |
| **Beállítások** (`/settings`) | **Csatlakozás Facebookkal** (egy gomb), **Rendszerállapot** (minden kapcsolat ellenőrzése, pontos javítási lépések, javító gombok), robotpilóta. |

### Képek
- **Sablonos hirdetéskép – ingyenes:** a fotóra pontos szöveg kerül (ár, telefonszám, ő/ű hibátlanul). Sablonok: *Zöld dobozos*, *Fejléc-sáv*, *Előtte/utána*. A fotó lehet feltöltött, meglévő hirdetés képe vagy AI-fotó.
- **AI fotó – opcionális:** OpenAI Images API (`OPENAI_API_KEY`), képenként fizetős. Az ingyenes ChatGPT-nek nincs API-ja, azt nem lehet bekötni.

### Ha valami nem működik
A Beállítások → Rendszerállapot megmutatja, mi hibás, és hogyan javítsd. Ahol lehet, egy gombbal megjavítja (újracsatlakozás, azonnali leadek bekapcsolása az oldalakon). A chatben „Valami nem működik” → az asszisztens lefuttatja ugyanezt, és lépésről lépésre végigvezet. A Meta-hibák magyar „→ Teendő” leírással jönnek.

### Figyelő szabályok (robotpilóta)
- **Költ, nem hoz:** a cél CPL × N költés 0 leaddel → leállítás.
- **Drága lead:** CPL > cél × 1,6 → leállítási javaslat.
- **Kifáradt kreatív:** frequency ≥ limit → kreatív frissítési javaslat.
- **Nyerő:** CPL ≤ cél × 0,75, legalább 10 lead → +20% büdzsé (tanulási fázisban soha).
- **Gyenge horog:** CTR < 0,8% → új headline/első mondat teszt.

Engedélyszintek: *Mindig kérdez* / *Kereten belül automata* / *Teljes automata*. Az új hirdetések alapból szüneteltetve jönnek létre.

## Indítás

```bash
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

Első indításkor a `/register` oldalon hozd létre a fiókodat (az első regisztráló a tulajdonos). Utána csak meghívó linkkel lehet regisztrálni (Beállítások → Új ügyfél meghívása); `OCP_ALLOW_SIGNUP=1` mindenkinek megnyitja. Szerveren állíts be egy hosszú, véletlen `OCP_SECRET`-et.

### Saját gépen, Windowson
`scripts\windows\install-ocp.ps1` (jobb klikk → Run with PowerShell): telepít, lefordít, és az asztalra tesz egy **OCP START** és egy **OCP STOP** ikont (http://localhost:3456). Így csak addig fut, amíg a géped be van kapcsolva – a 0–24-hez szerver kell (lent).

### 0–24 szerveren (ajánlott: Railway, kb. 5 $/hó)
Az OCP egy folyamatosan futó szerver (a robot benne él), ezért **nem** Vercel/serverless, hanem tartós tárhely kell:
1. railway.com → New Project → Deploy from GitHub repo → ezt a repót választod (a `Dockerfile` és a `railway.json` alapján épül).
2. **Volume** hozzáadása, csatolási pont: `/app/.data` (ide kerül minden adat – enélkül újraindításkor elveszne).
3. **Variables:** `OCP_SECRET` (hosszú véletlen szöveg), `ANTHROPIC_API_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_VERIFY_TOKEN`, `OCP_PUBLIC_URL` (a Railway által adott https cím vagy saját domain), opcionálisan `RESEND_API_KEY` + `OCP_MAIL_FROM` az e-mailekhez.
4. Settings → Networking → Generate Domain (vagy saját domain). Ezt a címet add meg a Meta appban (átirányítás + webhook).

Bármely más Docker-tárhely is jó (Fly.io, Render, saját VPS): egy példány, `/app/.data` tartós kötetre csatolva, `PORT` környezeti változó.

Kulcsok nélkül az OCP **demó módban** fut (két kitalált cég, szimulált élő költés és leadek) – így minden kipróbálható.

### Élő Meta-fiók – egyszeri beállítás (kb. 15 perc)
1. **Claude:** console.anthropic.com → API Keys → `ANTHROPIC_API_KEY`.
2. **Meta app:** developers.facebook.com → My Apps → Create App (*Business*). Termékek: *Facebook Login for Business* és *Webhooks*. Az App ID / App Secret → `META_APP_ID`, `META_APP_SECRET`. A Facebook Login beállításainál engedélyezett átirányítási URL: `<OCP címe>/api/auth/meta/callback`.
3. **Facebook Login for Business konfiguráció:** a Meta appban Facebook Login for Business → Configurations → Create: típus *System-user access token* (nem jár le) vagy *User access token*; engedélyek: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `pages_manage_metadata`, `leads_retrieval`; eszközök: hirdetési fiókok + oldalak. A Configuration ID → `META_CONFIG_ID`.
4. **Csatlakozás:** OCP → **Csatlakozás Facebookkal** → a Facebook ablakban „Tovább”. Az összes hirdetési fiók és oldal bejön, utána az OCP megkérdezi, beköthet-e minden leadet.
5. **Azonnali leadek:** az OCP-nek nyilvános címen kell futnia (`OCP_PUBLIC_URL`). Meta app → Webhooks → *Page* → `leadgen`, callback: `<OCP címe>/api/webhooks/meta`, verify token: `META_VERIFY_TOKEN`. Amíg ez nincs, a leadek percenkénti lekérdezéssel jönnek.

Alternatíva fejlesztéshez: `META_ACCESS_TOKEN` a `.env.local`-ban – ez kizárólag a tulajdonos fiókjára érvényes, más ügyfélre soha.

> Saját használatra a Meta app *Development* módban is működik (a saját fiókjaiddal). Teszt-ügyfelet (pl. egy barátot) a Meta app → App roles → *Testers* alatt adhatsz hozzá – neki is azonnal működik. Bárki másnak a Meta **App Review** (`ads_management`, `leads_retrieval` stb.) és **Business Verification** kell – ez az eladható verzió előfeltétele. Adatkezelési tájékoztató URL: `<OCP címe>/privacy`, adattörlési útmutató: `<OCP címe>/privacy#torles`.

## Felépítés

```
src/
  app/                 oldalak + API végpontok (Next.js App Router)
    api/chat           asszisztens – streamelt válasz (NDJSON)
    api/scan, cron/    figyelő futtatása (kézi / ütemezett)
    api/proposals      javaslatok + jóváhagyás
  lib/
    agent/             Claude asszisztens: prompt, eszközök, futtató ciklus
    engine/monitor.ts  szabályok, javaslatok, robotpilóta végrehajtás
    meta/              AdsProvider → demo.ts | graph.ts (Meta Marketing API), oauth.ts (Facebook Login)
    live.ts, live-bus  élő réteg: szerveroldali cache, háttérfigyelő, SSE push, lead-egyeztetés
    creative/          sablonos hirdetéskép (next/og), AI fotó (OpenAI), médiatár, Claude Files
    meta/manage.ts     Ads Manager-szintű műveletek (struktúra, bontás, célzás, létrehozás, közönségek, videó, előnézet)
    meta/advisor.ts    szakmai fék: szöveg-ellenőrzés, speciális kategóriák, kockázatfelmérés
    agent/tools-meta.ts  az asszisztens Meta-eszközei
    knowledge-meta.ts  Meta funkciókalauz (tudásbázis)
    health.ts          rendszerállapot + javítások
    company.ts         cégprofil, tudásbázis-keresés
    store.ts           egyszerű JSON tároló (.data/) – MVP, egy felhasználó
```

Az asszisztens a Claude API-t használja (alapból `claude-opus-5-5`, felülírható: `OCP_MODEL`, `OCP_EFFORT`). Szerveroldali tartalék modell (`fallbacks: "default"`) is be van kapcsolva: ha a fő modell elutasít egy kérést, egy másik modell automatikusan átveszi.

## Ütemterv

1. **Napi összefoglaló értesítés** (email/push): „ma ezt csinálnám, mehet?”
2. **Telepítés nyilvános címre** (Vercel + tartós tárhely), hogy a webhook azonnal hozza a leadeket.
3. **Böngésző-ügynök** azokra a Meta-beállításokra, amelyekhez nincs API (szigorú engedélykéréssel).
4. **Többfelhasználós mód:** Postgres, bejelentkezés, ügyfélenként külön fiókok.
5. **Stripe előfizetés** (40–60 USD/hó): regisztráció → fizetés → fiók csatlakoztatás → minden automatikusan megy.
6. **Google Ads és LinkedIn Ads** provider ugyanarra az `AdsProvider` interfészre.
