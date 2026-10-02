# OCP

AI hirdetéskezelő: a Meta hirdetési fiókodat egy chat-asszisztens kezeli helyetted. Figyel, javasol, és amit kérsz, megcsinálja, így az Ads Managert nem kell megnyitnod.

## Mit tud most (v0.1)

| Oldal | Mire jó |
|---|---|
| **Asszisztens** (`/`) | Chat: hirdetések elemzése, leállítás/indítás, büdzsé, új hirdetések tömeges feltöltése szövegírással, instant form, leadek, webes kutatás (trendek, bevált keretrendszerek). Mellette a döntésre váró javaslatok és a robot élő naplója. |
| **Javaslatok** (`/inbox`) | Amit az asszisztens magától csinálna. „Mehet” → végrehajtja. |
| **Hirdetések** (`/ads`) | Kampány / hirdetéscsoport szűrő, időszak (ma, 7, 30, 90 nap), KPI-k, grafikon (napi/heti/havi bontás), lead-tölcsér, kreatívok képpel csoportonként (tanulási fázis, napi keret) vagy egy listában. Kattintásra részletnézet napi grafikonnal, leállítás/indítás. 15 másodpercenként frissül. |
| **Leadek** (`/leads`) | Instant form leadek egyszerűsítve, státusszal (Új → Felhívva → Felmérés → Megnyert / Elveszett). A Meta webhookkal az új lead másodperceken belül megjelenik. |
| **Receptek** (`/recipes`) | Bevált kreatívformák: mi nem változhat, mi kötelező, mi szabad, plusz szövegsablon és eredmény. Az asszisztens ezekből gyárt új hirdetést. |
| **Robot élőben** (`/activity`) | Valós idejű napló mindarról, amit a robot néz és csinál. |
| **Beállítások** (`/settings`) | Cél CPL, márkahang, engedélyszint (Mindig kérdez / Kereten belül automata / Teljes automata), korlátok, fiókok. |

Bal felül a **fiókváltó**: az összes hirdetési fiók, amihez a token hozzáfér, egy kattintással váltható.

### Figyelő szabályok (robotpilóta)
- **Költ, nem hoz:** a cél CPL × N költés 0 leaddel → leállítás. Ezt engedélyezve kérdezés nélkül is megteszi.
- **Drága lead:** CPL > cél × 1,6 → leállítási javaslat.
- **Kifáradt kreatív:** frequency ≥ limit → kreatív frissítési javaslat.
- **Nyerő:** CPL ≤ cél × 0,75, legalább 10 lead → +20% büdzsé javaslat (a beállított maximumig). Tanulási fázisban lévő csoportot nem emel, mert az újraindítaná a tanulást.
- **Gyenge horog:** CTR < 0,8% → új headline/első mondat teszt.

Hogy mit hajt végre magától, az az engedélyszinttől függ: *Mindig kérdez* esetén semmit, *Kereten belül automata* esetén a lead nélkül költő hirdetések leállítását és a nyerők korlátozott emelését, *Teljes automata* esetén mindent. A chatben kifejezetten kért dolgokat végrehajtja. Az új hirdetések alapból **szüneteltetve** jönnek létre, a büdzsét pedig csak a beállított maximumig emeli, kivéve ha te mondasz konkrét összeget.

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

Azonnali leadekhez kösd be a Meta webhookot: Meta app → Webhooks → Page → `leadgen`, callback: `<OCP URL>/api/webhooks/meta`, verify token: `META_VERIFY_TOKEN` (az aláírást a `META_APP_SECRET`-tel ellenőrzi).

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
