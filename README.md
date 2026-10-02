# OCP

AI hirdetéskezelő: a Meta hirdetési fiókodat egy chat-asszisztens kezeli helyetted. Figyel, javasol, és amit kérsz, megcsinálja, így az Ads Managert nem kell megnyitnod.

## Mit tud most (v0.1)

| Oldal | Mire jó |
|---|---|
| **Asszisztens** (`/`) | Chat: hirdetések elemzése, leállítás/indítás, büdzsé, új hirdetések tömeges feltöltése szövegírással, instant form, leadek, webes kutatás (trendek, bevált keretrendszerek). Mellette a döntésre váró javaslatok és a robot élő naplója. |
| **Javaslatok** (`/inbox`) | Amit az asszisztens magától csinálna. „Mehet” → végrehajtja. |
| **Hirdetések** (`/ads`) | Minden hirdetés képpel: költés, lead, CPL, frequency, CTR, CPM, 7 napos trend, állapotcímke (Nyerő / Kifáradt / Költ, nem hoz / Drága). |
| **Leadek** (`/leads`) | Instant form leadek egyszerűsítve (név, telefon, email, város, megjegyzés). |
| **Robot élőben** (`/activity`) | Valós idejű napló mindarról, amit a robot néz és csinál. |
| **Beállítások** (`/settings`) | Cél CPL, márkahang, robotpilóta korlátok, fiókok. |

### Figyelő szabályok (robotpilóta)
- **Költ, nem hoz:** a cél CPL × N költés 0 leaddel → leállítás. Ezt engedélyezve kérdezés nélkül is megteszi.
- **Drága lead:** CPL > cél × 1,6 → leállítási javaslat.
- **Kifáradt kreatív:** frequency ≥ limit → kreatív frissítési javaslat.
- **Nyerő:** CPL ≤ cél × 0,75, legalább 10 lead → +20% büdzsé javaslat (a beállított maximumig).
- **Gyenge horog:** CTR < 0,8% → új headline/első mondat teszt.

A robot magától csak javasol. A chatben kifejezetten kért dolgokat végrehajtja. Az új hirdetések alapból **szüneteltetve** jönnek létre, a büdzsét pedig csak a beállított maximumig emeli, kivéve ha te mondasz konkrét összeget.

## Indítás

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY kötelező a chathez
npm run dev                  # http://localhost:3000
```

Ha a `META_*` változók üresek, az OCP **demó fiókkal** fut, így minden kipróbálható élő fiók nélkül is. Élő Meta fiókhoz:

- `META_ACCESS_TOKEN`: System User token `ads_management`, `ads_read`, `pages_manage_ads`, `leads_retrieval` jogokkal
- `META_AD_ACCOUNT_ID`: `act_…`
- `META_PAGE_ID`: a Facebook oldal (új hirdetésekhez és instant formokhoz)

Napi/óránkénti automatikus figyeléshez egy ütemező (pl. Vercel Cron) hívja: `GET /api/cron/scan`, `Authorization: Bearer $CRON_SECRET` fejléccel.

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
    meta/              AdsProvider interfész → demo.ts | graph.ts (Meta Marketing API)
    store.ts           egyszerű JSON tároló (.data/) – MVP, egy felhasználó
```

Az asszisztens a Claude API-t használja (alapból `claude-opus-5-5`, felülírható: `OCP_MODEL`, `OCP_EFFORT`). Szerveroldali tartalék modell (`fallbacks: "default"`) is be van kapcsolva: ha a fő modell elutasít egy kérést, egy másik modell automatikusan átveszi.

## Ütemterv

1. **Egykattintásos Meta csatlakozás:** Facebook Login (OAuth), a fiókok és oldalak listájából választás, token tárolás.
2. **Képgenerálás:** a nyerő kreatívok stílusában új képek egy képgeneráló szolgáltatással (a mostani verzió meglévő képet vagy URL-t használ).
3. **Napi összefoglaló értesítés** (email/push): „ma ezt csinálnám, mehet?”
4. **Többfelhasználós mód:** Postgres, bejelentkezés, ügyfélenként külön fiókok.
5. **Stripe előfizetés** (40–60 USD/hó): regisztráció → fizetés → fiók csatlakoztatás → minden automatikusan megy.
6. **Google Ads és LinkedIn Ads** provider ugyanarra az `AdsProvider` interfészre.
