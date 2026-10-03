import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getLeads, getProvider } from "../meta/provider";
import { logActivity, newId, readStore, updateStore } from "../store";
import { runScan } from "../engine/monitor";
import { getCompany, saveCompany, searchKnowledge } from "../company";
import { composeAdImage } from "../creative/render";
import { generatePhoto } from "../creative/generate";
import type { KnowledgeEntry, Proposal, Recipe } from "../types";
import { CTA, Rich, confirmedFlag, tool, withImage, type Tool, type ToolDef, type ToolResultContent } from "./tool-kit";
import { metaTools } from "./tools-meta";
import { assessBudgetChange, assessLearningEdit, assessPause, checkSpecialCategory, gate, lintAdCopy, merge, type SpecialCategory } from "../meta/advisor";

const coreTools: ToolDef[] = [
  tool(
    "get_account_overview",
    "Összesítő a hirdetési fiókról az elmúlt 7 napra: költés, leadek, CPL, aktív hirdetések, nyitott javaslatok és a beállított célok.",
    z.object({}),
    () => "Fiók áttekintése",
    async () => {
      const provider = await getProvider();
      const [ads, store] = await Promise.all([provider.listAds(), readStore()]);
      const spend = ads.reduce((s, a) => s + a.metrics.spend, 0);
      const leads = ads.reduce((s, a) => s + a.metrics.leads, 0);
      const company = await getCompany();
      return {
        mode: provider.mode,
        account: provider.account,
        otherAccounts: (await provider.listAccounts()).filter((a) => a.id !== provider.account.id),
        currency: provider.account.currency,
        targetCpl: company.targetCpl ?? store.settings.targetCpl,
        autopilot: store.settings.autopilot,
        company,
        last7d: { spend, leads, cpl: leads ? Math.round(spend / leads) : null },
        activeAds: ads.filter((a) => a.status === "ACTIVE").length,
        totalAds: ads.length,
        pendingProposals: store.proposals.filter((p) => p.status === "pending").length,
        lastScanAt: store.lastScanAt ?? null,
      };
    },
  ),
  tool(
    "list_ads",
    "Hirdetések listája kreatívval és 7 napos adatokkal (spend, leads, cpl, ctr, frequency, cpm). Szűrhető státuszra.",
    z.object({
      status: z.enum(["ACTIVE", "PAUSED", "ALL"]).default("ALL"),
      sort_by: z.enum(["spend", "cpl", "ctr", "frequency", "leads"]).default("spend"),
    }),
    () => "Hirdetések lekérése",
    async ({ status, sort_by }) => {
      const ads = (await (await getProvider()).listAds()).filter(
        (a) => status === "ALL" || a.status === status,
      );
      const key = (a: (typeof ads)[number]) =>
        sort_by === "cpl" ? (a.metrics.cpl ?? Infinity) : a.metrics[sort_by];
      return ads
        .sort((a, b) => (sort_by === "cpl" ? key(a) - key(b) : key(b) - key(a)))
        .map(({ daily: _d, ...a }) => a);
    },
  ),
  tool(
    "set_status",
    "Hirdetés, hirdetéscsoport vagy kampány indítása (ACTIVE) vagy leállítása (PAUSED). Csak ha a felhasználó kérte vagy jóváhagyta. Ha a leállítás kockázatos (egyetlen aktív / legjobb hirdetés), needs_confirmation választ kapsz.",
    z.object({
      level: z.enum(["ad", "adset", "campaign"]).default("ad"),
      id: z.string(),
      status: z.enum(["ACTIVE", "PAUSED"]),
      reason: z.string(),
      confirmed_after_warning: confirmedFlag,
    }),
    (i) => `${i.level === "ad" ? "Hirdetés" : i.level === "adset" ? "Hirdetéscsoport" : "Kampány"} ${i.status === "PAUSED" ? "leállítása" : "indítása"}`,
    async ({ level, id, status, reason, confirmed_after_warning }) => {
      const provider = await getProvider();
      if (level === "ad") {
        const ads = await provider.listAds();
        const ad = ads.find((a) => a.id === id);
        if (ad && status === "PAUSED") {
          const stop = gate(assessPause(ad, ads.filter((a) => a.adsetId === ad.adsetId)), confirmed_after_warning);
          if (stop) return stop;
        }
        if (ad && status === "ACTIVE") {
          const stop = gate(lintAdCopy([ad.creative]), confirmed_after_warning);
          if (stop) return stop;
        }
        await provider.setAdStatus(id, status);
      } else {
        if (provider.mode === "demo") {
          await updateStore((d) => d.ads.filter((a) => (level === "adset" ? a.adsetId : a.campaignId) === id).forEach((a) => (a.status = status)), ["ads"]);
        } else {
          const { updateObject } = await import("../meta/manage");
          await updateObject(id, { status });
          const { adsChanged } = await import("../live-bus");
          await adsChanged(provider.account.id);
        }
      }
      await logActivity("agent", "action", `${status === "PAUSED" ? "Leállítva" : "Elindítva"} (${level}): ${id} – ${reason}`, {
        type: "status",
        level,
        id,
        accountId: provider.account.id,
        status: status === "PAUSED" ? "ACTIVE" : "PAUSED",
      });
      return { ok: true };
    },
  ),
  tool(
    "set_budget",
    "Napi büdzsé módosítása egy hirdetéscsoporton (ABO) vagy kampányon (CBO), a fiók pénznemében, egész számmal. Védőkorlátok: a beállított max. emelés felett csak akkor, ha a felhasználó maga mondta az összeget; 30% feletti ugrás vagy tanulási fázis esetén needs_confirmation.",
    z.object({
      level: z.enum(["adset", "campaign"]).default("adset"),
      id: z.string(),
      daily_budget: z.number().int().positive(),
      user_explicitly_requested: z.boolean().describe("true, ha a felhasználó maga mondta ezt az összeget"),
      reason: z.string(),
      confirmed_after_warning: confirmedFlag,
    }),
    () => "Büdzsé módosítása",
    async ({ level, id, daily_budget, user_explicitly_requested, reason, confirmed_after_warning }) => {
      const provider = await getProvider();
      const [ads, store, company] = await Promise.all([provider.listAds(), readStore(), getCompany()]);
      const sample = ads.find((a) => (level === "adset" ? a.adsetId : a.campaignId) === id);
      let current = sample?.adsetDailyBudget;
      if (provider.mode === "meta") {
        const { graph } = await import("../meta/graph");
        const o = await graph<{ daily_budget?: string; name: string }>(id, { params: { fields: "daily_budget,name" } });
        if (!o.daily_budget) {
          return { status: "refused", reasons: [level === "adset" ? "Ennek a hirdetéscsoportnak nincs saját napi büdzséje (a kampány osztja el – CBO). A kampány büdzséjét módosítsd." : "Ennek a kampánynak nincs kampányszintű napi büdzséje (ABO) – a hirdetéscsoportokét módosítsd."] };
        }
        current = Number(o.daily_budget) / Number(process.env.META_CURRENCY_OFFSET ?? 100);
      }
      if (current === undefined) throw new Error(`Nincs ilyen ${level === "adset" ? "hirdetéscsoport" : "kampány"}: ${id}`);
      const verdict = assessBudgetChange({
        current,
        next: daily_budget,
        learning: level === "adset" ? sample?.adsetLearning : undefined,
        maxIncreasePct: store.settings.autopilot.maxBudgetIncreasePct,
        userSaidAmount: user_explicitly_requested,
        targetCpl: company.targetCpl ?? store.settings.targetCpl,
        name: sample?.[level === "adset" ? "adsetName" : "campaignName"] ?? id,
      });
      const stop = gate(verdict, confirmed_after_warning);
      if (stop) return stop;
      if (level === "adset") await provider.setAdsetBudget(id, daily_budget);
      else if (provider.mode === "demo") await provider.setAdsetBudget(sample!.adsetId, daily_budget);
      else {
        const { updateObject, toMinor } = await import("../meta/manage");
        await updateObject(id, { daily_budget: toMinor(daily_budget) });
        const { adsChanged } = await import("../live-bus");
        await adsChanged(provider.account.id);
      }
      await logActivity("agent", "action", `Büdzsé (${level}) ${id}: ${current} → ${daily_budget} (${reason})`, {
        type: "budget",
        level,
        id: level === "adset" || provider.mode === "meta" ? id : sample!.adsetId,
        accountId: provider.account.id,
        dailyBudget: current,
      });
      return { ok: true, previous: current, now: daily_budget };
    },
  ),
  tool(
    "create_ads",
    "Új hirdetések feltöltése egy meglévő hirdetéscsoportba. Formátum: image (alap), carousel (2–10 kártya), video (előbb upload_video). Kép: image_url (OCP kép /api/media/… vagy /api/creative/…, vagy nyilvános URL) vagy reuse_image_from_ad_id. Leadhez lead_form_id, weboldalhoz link_url + url_tags (UTM). Advantage+ kreatív fejlesztések: creative_features (pl. {\"text_optimizations\":\"OPT_OUT\"}) – áras/pontos szövegű képnél kapcsold ki a szöveg- és képmódosítást. A szövegeket a Meta irányelvei szerint ellenőrzöm (refused / needs_confirmation). Alapból PAUSED; activate=true csak ha a felhasználó kérte.",
    z.object({
      adset_id: z.string(),
      activate: z.boolean().default(false),
      lead_form_id: z.string().optional(),
      link_url: z.string().optional(),
      url_tags: z.string().optional(),
      recipe_id: z.string().optional().describe("ha egy recept alapján készül, annak az azonosítója"),
      creative_features: z.record(z.string(), z.enum(["OPT_IN", "OPT_OUT"])).optional(),
      confirmed_after_warning: confirmedFlag,
      ads: z
        .array(
          z.object({
            name: z.string(),
            format: z.enum(["image", "carousel", "video"]).default("image"),
            headline: z.string().max(80),
            primary_text: z.string().max(2000),
            description: z.string().max(120).optional(),
            cta: CTA,
            image_url: z.string().optional(),
            reuse_image_from_ad_id: z.string().optional(),
            video_id: z.string().optional(),
            cards: z
              .array(
                z.object({
                  headline: z.string().max(60),
                  description: z.string().max(60).optional(),
                  image_url: z.string().optional(),
                  reuse_image_from_ad_id: z.string().optional(),
                  link: z.string().optional(),
                }),
              )
              .max(10)
              .optional(),
          }),
        )
        .min(1)
        .max(20),
    }),
    (i) => `${i.ads.length} hirdetés feltöltése`,
    async ({ adset_id, activate, lead_form_id, link_url, url_tags, recipe_id, creative_features, confirmed_after_warning, ads }) => {
      const provider = await getProvider();
      const company = await getCompany();
      // what the Meta reviewers will read: every headline, text and card
      const copy = ads.flatMap((a) => [
        { headline: a.headline, primaryText: a.primary_text, description: a.description },
        ...(a.cards ?? []).map((c) => ({ headline: c.headline, primaryText: undefined as string | undefined, description: c.description })),
      ]);
      let declared: SpecialCategory[] = [];
      if (provider.mode === "meta") {
        const { graph } = await import("../meta/graph");
        const o = await graph<{ campaign?: { special_ad_categories?: string[] } }>(adset_id, { params: { fields: "campaign{special_ad_categories}" } }).catch(() => null);
        declared = (o?.campaign?.special_ad_categories ?? []) as SpecialCategory[];
      }
      const verdict = merge(
        lintAdCopy(copy),
        checkSpecialCategory(`${company.industry}\n${copy.map((c) => `${c.headline ?? ""} ${c.primaryText ?? ""}`).join("\n")}`, declared),
        activate ? assessLearningEdit((await provider.listAds()).find((a) => a.adsetId === adset_id)?.adsetLearning, "új aktív hirdetés hozzáadása") : { refuse: [], warn: [], alternatives: [] },
      );
      const stop = gate(verdict, confirmed_after_warning);
      if (stop) return stop;
      const results = [];
      for (const ad of ads) {
        try {
          const { id } = await provider.createAd({
            adsetId: adset_id,
            name: ad.name,
            format: ad.format,
            headline: ad.headline,
            primaryText: ad.primary_text,
            description: ad.description,
            cta: ad.cta,
            imageUrl: ad.image_url,
            reuseImageFromAdId: ad.reuse_image_from_ad_id,
            videoId: ad.video_id,
            cards: ad.cards?.map((c) => ({ headline: c.headline, description: c.description, imageUrl: c.image_url, reuseImageFromAdId: c.reuse_image_from_ad_id, link: c.link })),
            leadFormId: lead_form_id,
            linkUrl: link_url,
            urlTags: url_tags,
            creativeFeatures: creative_features,
            recipeId: recipe_id,
            activate,
          });
          results.push({ name: ad.name, id, ok: true });
        } catch (e) {
          results.push({ name: ad.name, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
      const ok = results.filter((r) => r.ok).length;
      await logActivity("agent", "create", `${ok}/${ads.length} új hirdetés feltöltve (${activate ? "élesítve" : "szüneteltetve"}) – ${adset_id}`);
      return { results, warningsAccepted: verdict.warn };
    },
  ),
  tool(
    "create_lead_form",
    "Meta Instant Form (lead űrlap) létrehozása a cég Facebook-oldalán. Javasolt: név + telefon + 1 feleletválasztós minősítő kérdés; „magasabb szándék” (higher_intent), ha sok a gyenge lead; köszönőoldalon hívás- vagy weboldal-gomb. Adatvédelmi URL kötelező (a cégprofil weboldaláról is jöhet). Közzététel után nem szerkeszthető – módosításhoz új űrlap kell.",
    z.object({
      name: z.string(),
      intro: z.array(z.string()).min(1).max(5).describe("bevezető: 1 bekezdés vagy 2–5 felsoroláspont"),
      intro_title: z.string().optional(),
      questions: z
        .array(
          z.union([
            z.enum(["FULL_NAME", "FIRST_NAME", "LAST_NAME", "EMAIL", "PHONE", "CITY", "ZIP", "STREET_ADDRESS", "COMPANY_NAME", "JOB_TITLE"]),
            z.object({ label: z.string(), options: z.array(z.string()).max(10).optional().describe("feleletválasztós opciók; üresen = rövid szöveges válasz") }),
          ]),
        )
        .min(1)
        .max(15),
      higher_intent: z.boolean().default(false),
      privacy_url: z.string(),
      thank_you_title: z.string().optional(),
      thank_you: z.string(),
      thank_you_button: z
        .object({ type: z.enum(["VIEW_WEBSITE", "CALL_BUSINESS"]), text: z.string(), url: z.string().optional(), phone: z.string().optional() })
        .optional(),
    }),
    () => "Instant űrlap létrehozása",
    async (i) => {
      const res = await (await getProvider()).createLeadForm({
        name: i.name,
        intro: i.intro,
        introTitle: i.intro_title,
        questions: i.questions,
        higherIntent: i.higher_intent,
        privacyUrl: i.privacy_url,
        thankYouTitle: i.thank_you_title,
        thankYou: i.thank_you,
        thankYouButton: i.thank_you_button,
      });
      await logActivity("agent", "create", `Instant űrlap létrehozva: ${i.name}${i.higher_intent ? " (magasabb szándék)" : ""}`);
      return res;
    },
  ),
  tool(
    "list_leads",
    "Legutóbbi leadek egyszerűsített formában (név, telefon, email, város, megjegyzés, melyik hirdetésből).",
    z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    () => "Leadek lekérése",
    async ({ limit }) => (await getLeads()).slice(0, limit),
  ),
  tool(
    "set_lead_status",
    "Lead státuszának állítása: new (új), contacted (felhívva), survey (felmérés), won (megnyert), lost (elveszett).",
    z.object({ lead_id: z.string(), status: z.enum(["new", "contacted", "survey", "won", "lost"]) }),
    () => "Lead státusz módosítása",
    async ({ lead_id, status }) => {
      await updateStore((d) => void (d.leadStatus[lead_id] = status), ["leads"]);
      return { ok: true };
    },
  ),
  tool(
    "get_ad_daily",
    "Egy hirdetés napi bontású adatai (költés, megjelenés, kattintás, lead) az elmúlt N napra. Trendek, kiugrások vizsgálatához.",
    z.object({ ad_id: z.string(), days: z.number().int().min(1).max(90).default(14) }),
    () => "Napi adatok lekérése",
    async ({ ad_id, days }) => {
      const ad = (await (await getProvider()).listAds()).find((a) => a.id === ad_id);
      if (!ad) throw new Error(`Nincs ilyen hirdetés: ${ad_id}`);
      return { name: ad.name, daily: ad.daily.slice(-days) };
    },
  ),
  tool(
    "list_recipes",
    "A bevált hirdetés-receptek (kreatívformák) listája: mi nem változhat, mi kötelező, mi szabad, szövegsablon, és a példa-hirdetés eredménye. Új hirdetések készítésekor ezekből indulj ki.",
    z.object({}),
    () => "Receptek lekérése",
    async () => {
      const [store, ads] = await Promise.all([readStore(), getProvider().then((p) => p.listAds())]);
      return store.recipes.map((r) => {
        const used = ads.filter((a) => a.creative.recipeId === r.id || a.id === r.exampleAdId);
        const spend = used.reduce((s, a) => s + a.metrics.spend, 0);
        const leads = used.reduce((s, a) => s + a.metrics.leads, 0);
        return { ...r, ads: used.length, last7d: { spend, leads, cpl: leads ? Math.round(spend / leads) : null } };
      });
    },
  ),
  tool(
    "create_recipe",
    "Új recept mentése egy jól teljesítő hirdetésből, hogy más ajánlatokra/ügyfelekre is át lehessen vinni.",
    z.object({
      name: z.string(),
      description: z.string(),
      fixed: z.array(z.string()).min(1),
      required: z.array(z.string()),
      free: z.array(z.string()),
      text_template: z.string(),
      example_ad_id: z.string().optional(),
    }),
    () => "Recept mentése",
    async (i) => {
      const ads = await (await getProvider()).listAds();
      const example = ads.find((a) => a.id === i.example_ad_id);
      const r: Recipe = {
        id: newId("rcp"),
        name: i.name,
        description: i.description,
        fixed: i.fixed,
        required: i.required,
        free: i.free,
        textTemplate: i.text_template,
        exampleAdId: i.example_ad_id,
        palette: example?.creative.palette ?? ["#334155", "#0f172a"],
        createdAt: new Date().toISOString(),
      };
      await updateStore((d) => void d.recipes.unshift(r), ["recipes"]);
      await logActivity("agent", "create", `Új recept: ${r.name}`);
      return { id: r.id };
    },
  ),
  tool(
    "get_company_profile",
    "Az aktív cég profilja: szolgáltatások és árak, telefonszám, terület, weboldal, miért őket válasszák (usp), márkahang, színek, megjegyzések, Facebook-oldal. Minden szöveg és kép ezen alapuljon.",
    z.object({}),
    () => "Cégprofil betöltése",
    async () => getCompany(),
  ),
  tool(
    "update_company_profile",
    "Cégprofil frissítése (csak a megadott mezők változnak). Akkor használd, ha a felhasználó új infót ad a cégről (ár, szolgáltatás, telefonszám, hangnem…).",
    z.object({
      name: z.string().optional(),
      industry: z.string().optional(),
      services: z.array(z.object({ name: z.string(), price: z.string().optional() })).optional(),
      phone: z.string().optional(),
      area: z.string().optional(),
      website: z.string().optional(),
      usp: z.string().optional(),
      brandVoice: z.string().optional(),
      targetCpl: z.number().positive().optional(),
      daily_spend_cap: z
        .number()
        .positive()
        .optional()
        .describe("napi költési plafon a fiók pénznemében: felette az OCP minden aktív hirdetést leállít (biztonsági fék)"),
      notes: z.string().optional(),
    }),
    () => "Cégprofil frissítése",
    async (patch) => {
      const accountId = (await getProvider()).account.id;
      const { daily_spend_cap, ...rest } = patch;
      const clean = Object.fromEntries(Object.entries({ ...rest, dailySpendCap: daily_spend_cap }).filter(([, v]) => v !== undefined));
      const c = await saveCompany({ ...clean, accountId });
      await logActivity("agent", "action", `Cégprofil frissítve: ${Object.keys(clean).join(", ")}`);
      return c;
    },
  ),
  tool(
    "search_knowledge",
    "Keresés a tudásbázisban (a felhasználó saját tapasztalatai + OCP döntési kézikönyv: leállítás, skálázás, tanulási fázis, kreatív fáradás, ajánlatépítés, horgok, űrlapok). Döntés vagy javaslat előtt hívd meg, és a saját (own) bejegyzéseket részesítsd előnyben.",
    z.object({ query: z.string() }),
    (i) => `Tudásbázis: „${i.query}”`,
    async ({ query }) => (await searchKnowledge(query)).map(({ id, title, body, kind, source }) => ({ id, title, body, kind, source })),
  ),
  tool(
    "add_knowledge",
    "Tanulság mentése a tudásbázisba a felhasználó saját tapasztalataként (pl. „ennél az ügyfélnél a zöld dobozos kép mindig nyer”). Akkor használd, ha a felhasználó megoszt egy tapasztalatot, vagy kéri, hogy jegyezd meg.",
    z.object({ title: z.string(), body: z.string(), tags: z.array(z.string()).default([]) }),
    () => "Tanulság mentése",
    async (i) => {
      const entry: KnowledgeEntry = { id: newId("kb"), kind: "own", createdAt: new Date().toISOString(), ...i, source: "Chat" };
      await updateStore((d) => void d.knowledge.unshift(entry), ["knowledge"]);
      await logActivity("agent", "create", `Tudásbázis: ${i.title}`);
      return { id: entry.id };
    },
  ),
  tool(
    "compose_ad_image",
    "Hirdetéskép készítése pontos szöveggel egy fotóra (ingyenes, a szöveg mindig hibátlan). Sablonok: green_box (sötétzöld dobozok: márka, szolgáltatás, ár, felszólítás, alsó sor, telefon – a „Zöld dobozos” recept), headline_band (fotó + alul márkaszínű sáv headline-nal és gombbal), before_after (két fotó: előtte/utána + sáv). Fotó: a felhasználó feltöltött képe, egy meglévő hirdetés képe (list_ads → creative.imageUrl) vagy generate_photo eredménye. Az eredményt megnézheted, és mehet a create_ads / update_ad_creative image_url-jébe.",
    z.object({
      template: z.enum(["green_box", "headline_band", "before_after"]),
      photo_url: z.string().optional(),
      photo2_url: z.string().optional().describe("before_after: az „utána” fotó"),
      brand: z.string().optional(),
      service: z.string().optional(),
      price: z.string().optional().describe("pl. „17 000 Ft / m²”"),
      price_note: z.string().optional().describe("pl. „(anyag + munkadíj)”"),
      headline: z.string().optional(),
      subline: z.string().optional(),
      cta: z.string().optional(),
      bottom_line: z.string().optional(),
      phone: z.string().optional(),
      format: z.enum(["feed", "square", "story"]).default("feed"),
    }),
    (i) => `Hirdetéskép készítése (${i.template})`,
    async (i) => {
      const company = await getCompany();
      const item = await composeAdImage({
        template: i.template,
        photoUrl: i.photo_url,
        photo2Url: i.photo2_url,
        brand: i.brand,
        service: i.service,
        price: i.price,
        priceNote: i.price_note,
        headline: i.headline,
        subline: i.subline,
        cta: i.cta,
        bottomLine: i.bottom_line,
        phone: i.phone,
        format: i.format,
        colors: company.colors,
        accountId: company.accountId,
      });
      await logActivity("agent", "create", `Hirdetéskép elkészült (${i.template}): ${item.url}`);
      return withImage({ image_url: item.url, note: "Mutasd meg a felhasználónak markdown képként: ![](" + item.url + ")" }, item.url);
    },
  ),
  tool(
    "generate_photo",
    "Új fotó generálása vagy egy meglévő fotó feljavítása AI-jal. Minőség (tier): free = ingyenes (vázlat, háttér, ötletelés – ezzel kezdj, ha több variáns kell), standard = erős (~0,04 $), pro = a legerősebb, a ChatGPT-szintű (~0,13–0,21 $) – csak a végleges, kiválasztott képhez vagy ha a felhasználó kéri. Ha nem adod meg, a beállított alapértelmezés megy. reference_image_url: meglévő munkafotó, amit szebbé/ünnepibbé/tisztábbá teszel (valódi munka, nem kitalált!). Szöveget NE kérj a képre: utána a compose_ad_image teszi rá pontosan és ingyen. Valósághű, helyi munkafotó-stílust kérj, ne stock-hatást. A promptot angolul írd (jobb eredmény).",
    z.object({
      prompt: z.string(),
      size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1536"),
      tier: z.enum(["free", "standard", "pro"]).optional(),
      reference_image_url: z.string().optional(),
    }),
    (i) => `Fotó generálása${i.tier === "pro" ? " (prémium)" : i.tier === "free" ? " (ingyenes)" : ""}`,
    async ({ prompt, size, tier, reference_image_url }) => {
      const item = await generatePhoto(prompt, size, { accountId: (await getProvider()).account.id, tier, referenceUrl: reference_image_url });
      await logActivity("agent", "create", `AI fotó ${item.reused ? "(korábbi, újrahasznosítva)" : "generálva"}: ${item.provider}${item.costUsd ? ` · ~${item.costUsd.toFixed(2)} $` : " · ingyenes"}`);
      return withImage({ image_url: item.url, provider: item.provider, cost_usd: item.costUsd, reused: !!item.reused }, item.url);
    },
  ),
  tool(
    "list_media",
    "A cég legutóbbi képei a médiatárban (feltöltött, generált, sablonos), URL-lel.",
    z.object({ limit: z.number().int().min(1).max(50).default(12) }),
    () => "Médiatár",
    async ({ limit }) => {
      const id = (await getProvider()).account.id;
      return (await readStore()).media.filter((m) => !m.accountId || m.accountId === id).slice(0, limit);
    },
  ),
  tool(
    "update_ad_creative",
    "Futó hirdetés szövegének és/vagy képének cseréje. A Metán ez új kreatívot jelent: a hirdetés újra ellenőrzésre megy, és a tanulás részben újraindulhat. Tanulási fázisban needs_confirmation-t kapsz; teszteléshez inkább új hirdetést javasolj mellé (create_ads).",
    z.object({
      ad_id: z.string(),
      headline: z.string().max(80).optional(),
      primary_text: z.string().max(2000).optional(),
      image_url: z.string().optional(),
      confirmed_after_warning: confirmedFlag,
    }),
    () => "Kreatív cseréje",
    async ({ ad_id, headline, primary_text, image_url, confirmed_after_warning }) => {
      const provider = await getProvider();
      const ad = (await provider.listAds()).find((a) => a.id === ad_id);
      const verdict = merge(
        lintAdCopy([{ headline, primaryText: primary_text }]),
        assessLearningEdit(ad?.adsetLearning, "a kreatív cseréje"),
        ad && ad.metrics.cpl !== null && ad.metrics.leads >= 5
          ? { refuse: [], warn: [`„${ad.name}” most is hoz leadet (${ad.metrics.leads} db, CPL ${ad.metrics.cpl}) – a csere után a teljesítménye újra bizonytalan.`], alternatives: ["Új variánst tegyél mellé, és hagyd, hogy a Meta eldöntse, melyik jobb."] }
          : { refuse: [], warn: [], alternatives: [] },
      );
      const stop = gate(verdict, confirmed_after_warning);
      if (stop) return stop;
      await provider.updateAdCreative(ad_id, { headline, primaryText: primary_text, imageUrl: image_url });
      await logActivity("agent", "action", `Kreatív frissítve: ${ad_id}${image_url ? " (új kép)" : ""}${headline || primary_text ? " (új szöveg)" : ""}`);
      return { ok: true };
    },
  ),
  tool(
    "get_system_health",
    "Rendszerállapot: Claude, Meta app, Facebook-kapcsolat és engedélyek, hirdetési fiókok, oldalak és azonnali leadek, webhook, képgenerálás. Ha valami nem működik, ezzel kezdd, és a megadott javítási lépéseket mondd el pontosan.",
    z.object({}),
    () => "Rendszerállapot ellenőrzése",
    async () => {
      const { runHealthChecks } = await import("../health");
      return runHealthChecks(process.env.OCP_PUBLIC_URL ?? "http://localhost:3000");
    },
  ),
  tool(
    "get_ads_manager_link",
    "Közvetlen link a Meta Ads Managerhez (a fiókhoz vagy egy konkrét hirdetéshez) – ha a felhasználónak kézzel kell valamit megnéznie vagy beállítania.",
    z.object({ ad_id: z.string().optional() }),
    () => "Ads Manager link",
    async ({ ad_id }) => {
      const { adsManagerUrl } = await import("../meta/graph");
      return { url: adsManagerUrl((await getProvider()).account.id, ad_id) };
    },
  ),
  tool(
    "run_monitor_scan",
    "Lefuttatja a figyelő szabályokat (költés eredmény nélkül, drága CPL, magas frequency, skálázható nyertesek, gyenge CTR) és új javaslatokat tesz az Üzenetek fülre.",
    z.object({}),
    () => "Fiók átvizsgálása",
    async () => runScan("agent"),
  ),
  tool(
    "list_proposals",
    "A nyitott (jóváhagyásra váró) javaslatok listája.",
    z.object({}),
    () => "Javaslatok lekérése",
    async () => (await readStore()).proposals.filter((p) => p.status === "pending"),
  ),
  tool(
    "create_proposal",
    "Javaslat küldése a felhasználónak az Üzenetek fülre (pl. „ma ezt csinálnám, mit gondolsz?”). Ha van konkrét végrehajtható lépés, add meg az action mezőt; jóváhagyáskor az OCP automatikusan végrehajtja.",
    z.object({
      title: z.string(),
      reason: z.string(),
      impact: z.string().optional(),
      severity: z.enum(["high", "medium", "low"]).default("medium"),
      ad_id: z.string().optional(),
      action: z
        .discriminatedUnion("type", [
          z.object({ type: z.literal("set_status"), adId: z.string(), status: z.enum(["ACTIVE", "PAUSED"]) }),
          z.object({ type: z.literal("set_budget"), adsetId: z.string(), dailyBudget: z.number().int().positive() }),
          z.object({ type: z.literal("none") }),
        ])
        .default({ type: "none" }),
    }),
    () => "Javaslat küldése",
    async (i) => {
      const p: Proposal = {
        id: newId("prp"),
        key: `agent:${Date.now()}`,
        kind: i.action.type === "set_budget" ? "scale_budget" : i.action.type === "set_status" ? (i.action.status === "PAUSED" ? "pause_ad" : "activate_ad") : "info",
        severity: i.severity,
        title: i.title,
        reason: i.reason,
        impact: i.impact,
        adId: i.ad_id,
        action: i.action,
        status: "pending",
        createdAt: new Date().toISOString(),
        accountId: (await getProvider()).account.id,
      };
      await updateStore((d) => void d.proposals.unshift(p));
      await logActivity("agent", "proposal", `Új javaslat: ${p.title}`);
      return { id: p.id };
    },
  ),
];

const tools: ToolDef[] = [...coreTools, ...metaTools];

export const clientTools: Tool[] = tools.map((t) => t.definition);

export const serverTools: Anthropic.Beta.Messages.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
];

export function toolLabel(name: string, input: unknown): string {
  if (name === "web_search") return "Keresés a weben";
  const t = tools.find((x) => x.definition.name === name);
  if (!t) return name;
  const parsed = t.schema.safeParse(input);
  return parsed.success ? t.label(parsed.data as never) : name;
}

export async function runTool(name: string, input: unknown): Promise<{ ok: boolean; content: string | ToolResultContent; flag?: "confirm" | "refused" }> {
  const t = tools.find((x) => x.definition.name === name);
  if (!t) return { ok: false, content: `Ismeretlen eszköz: ${name}` };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, content: `Érvénytelen bemenet: ${parsed.error.message}` };
  }
  try {
    const result = await t.run(parsed.data as never);
    if (result instanceof Rich) return { ok: true, content: result.blocks };
    const status = (result as { status?: string } | null)?.status;
    const flag = status === "needs_confirmation" ? "confirm" : status === "refused" ? "refused" : undefined;
    return { ok: true, content: JSON.stringify(result ?? { ok: true }), flag };
  } catch (e) {
    return { ok: false, content: e instanceof Error ? e.message : String(e) };
  }
}
