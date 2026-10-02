# OCP

AI hirdetéskezelő: a Meta hirdetési fiókodat egy chat-asszisztens kezeli helyetted. Figyel, javasol, és amit kérsz, megcsinálja, így az Ads Managert nem kell megnyitnod.

## Mit tud most (v0.3)

**Minden élő.** A szerver figyeli a Metát, és a változást azonnal kiküldi a böngészőnek (Server-Sent Events). Új lead esetén a szám rögtön átvált (animálva), és jobb felül megjelenik az értesítés. A leadek webhookon másodpercek alatt jönnek; a költés/megjelenés a Metánál is néhány perc késéssel frissül – az OCP alapból percenként kérdezi (`META_POLL_SECONDS`), és kiírja, mikor frissült utoljára.

| Oldal | Mire jó |
|---|---|
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

Kulcsok nélkül az OCP **demó módban** fut (két kitalált cég, szimulált élő költés és leadek) – így minden kipróbálható.

### Élő Meta-fiók – egyszeri beállítás (kb. 15 perc)
1. **Claude:** console.anthropic.com → API Keys → `ANTHROPIC_API_KEY`.
2. **Meta app:** developers.facebook.com → My Apps → Create App (*Business*). Termékek: *Facebook Login for Business* és *Webhooks*. Az App ID / App Secret → `META_APP_ID`, `META_APP_SECRET`. A Facebook Login beállításainál engedélyezett átirányítási URL: `<OCP címe>/api/auth/meta/callback`.
3. **Csatlakozás:** OCP → Beállítások → **Csatlakozás Facebookkal**. Az összes hirdetési fiók és oldal bejön, az oldalakon bekapcsol az azonnali lead-értesítés.
4. **Azonnali leadek:** az OCP-nek nyilvános címen kell futnia (pl. Vercel; `OCP_PUBLIC_URL`). Meta app → Webhooks → *Page* → `leadgen`, callback: `<OCP címe>/api/webhooks/meta`, verify token: `META_VERIFY_TOKEN`. Amíg ez nincs, a leadek percenkénti lekérdezéssel jönnek.

Alternatíva tesztre: `META_ACCESS_TOKEN` (System User token) a `.env.local`-ban.

> Saját használatra a Meta app *Development* módban is működik (a saját fiókjaiddal). Más ügyfeleknek a Meta App Review kell az `ads_management`, `leads_retrieval` stb. engedélyekre – ez az eladható verzió előfeltétele.

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
