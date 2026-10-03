import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { readStore } from "./store";
import { metaToken, graph, metaPages } from "./meta/graph";
import { META_SCOPES, appCredentials } from "./meta/oauth";

export interface HealthCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
  fix?: { text: string; href?: string; action?: "connect_meta" | "subscribe_leadgen" };
}

const MODEL = process.env.OCP_MODEL ?? "claude-opus-5-5";

export async function runHealthChecks(origin: string): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const store = await readStore();

  // 1) Claude
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    checks.push({
      id: "claude",
      label: "Asszisztens (Claude)",
      status: "error",
      detail: "Nincs Claude API-kulcs, a chat nem tud válaszolni.",
      fix: { text: "console.anthropic.com → API Keys → Create key, majd ANTHROPIC_API_KEY=… a .env.local fájlba, és indítsd újra az OCP-t.", href: "https://console.anthropic.com/settings/keys" },
    });
  } else {
    try {
      await new Anthropic().models.retrieve(MODEL);
      checks.push({ id: "claude", label: "Asszisztens (Claude)", status: "ok", detail: `Kapcsolódva · ${MODEL}` });
    } catch (err) {
      checks.push({
        id: "claude",
        label: "Asszisztens (Claude)",
        status: "error",
        detail: err instanceof Anthropic.AuthenticationError ? "Az API-kulcs érvénytelen." : `Nem érhető el: ${err instanceof Error ? err.message : String(err)}`,
        fix: { text: "Ellenőrizd az ANTHROPIC_API_KEY értékét és az egyenleget a konzolon.", href: "https://console.anthropic.com/settings/billing" },
      });
    }
  }

  // 2) Meta app (needed for one-click connect + webhook signature)
  const app = appCredentials();
  checks.push(
    app
      ? { id: "meta_app", label: "Meta app", status: "ok", detail: `App ID: ${app.id}` }
      : {
          id: "meta_app",
          label: "Meta app",
          status: "warn",
          detail: "Nincs META_APP_ID / META_APP_SECRET – az egygombos csatlakozáshoz és az azonnali leadekhez kell.",
          fix: {
            text: "developers.facebook.com → My Apps → Create App (Business típus) → App settings → Basic: az App ID és App Secret a .env.local-ba. Products: „Facebook Login for Business” és „Webhooks”.",
            href: "https://developers.facebook.com/apps/",
          },
        },
  );

  // 3) Meta connection
  const token = await metaToken();
  if (!token) {
    checks.push({
      id: "meta_conn",
      label: "Facebook-kapcsolat",
      status: "warn",
      detail: "Nincs csatlakoztatva – az OCP demó adatokkal fut.",
      fix: { text: "Csatlakozás Facebookkal", action: "connect_meta" },
    });
    return finish(checks, origin);
  }
  try {
    const me = await graph<{ id: string; name: string }>("me", { params: { fields: "id,name" } });
    const perms = await graph<{ data: { permission: string; status: string }[] }>("me/permissions");
    const granted = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
    const missing = META_SCOPES.filter((s) => !granted.has(s));
    const exp = store.metaAuth?.expiresAt ? Math.round((new Date(store.metaAuth.expiresAt).getTime() - Date.now()) / 86_400_000) : null;
    checks.push({
      id: "meta_conn",
      label: "Facebook-kapcsolat",
      status: missing.length || (exp !== null && exp < 7) ? "warn" : "ok",
      detail: [
        `Bejelentkezve: ${me.name}`,
        exp !== null ? `a kapcsolat ${exp} nap múlva lejár` : null,
        missing.length ? `hiányzó engedély: ${missing.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      fix: missing.length || (exp !== null && exp < 7) ? { text: "Csatlakozás újra (minden engedélyt hagyj bejelölve)", action: "connect_meta" } : undefined,
    });
  } catch (err) {
    checks.push({
      id: "meta_conn",
      label: "Facebook-kapcsolat",
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
      fix: { text: "Csatlakozás újra", action: "connect_meta" },
    });
    return finish(checks, origin);
  }

  // 4) ad accounts
  try {
    const accounts = await graph<{ data: { id: string; account_status: number }[] }>("me/adaccounts", { params: { fields: "id,account_status", limit: "200" } });
    const active = accounts.data.filter((a) => a.account_status === 1).length;
    checks.push({
      id: "accounts",
      label: "Hirdetési fiókok",
      status: active ? "ok" : "error",
      detail: `${active} aktív fiók (${accounts.data.length} összesen)`,
      fix: active
        ? undefined
        : { text: "Nincs aktív hirdetési fiók a hozzáférésedben. business.facebook.com/settings → Hirdetési fiókok → add hozzá magad.", href: "https://business.facebook.com/settings/ad-accounts" },
    });
  } catch (err) {
    checks.push({ id: "accounts", label: "Hirdetési fiókok", status: "error", detail: err instanceof Error ? err.message : String(err) });
  }

  // 5) pages + leadgen subscription
  try {
    const pages = await metaPages();
    const appId = app?.id;
    const states = await Promise.all(
      pages.map(async (p) => {
        const subs = await graph<{ data: { id: string; subscribed_fields?: string[] }[] }>(`${p.id}/subscribed_apps`, { token: p.token }).catch(() => ({ data: [] }));
        const ours = subs.data.find((x) => !appId || x.id === appId);
        return { page: p, ok: !!ours?.subscribed_fields?.includes("leadgen") };
      }),
    );
    const notSubscribed = states.filter((s) => !s.ok);
    if (!store.leadConsent && pages.length) {
      checks.push({
        id: "leadgen",
        label: "Leadek bekötése",
        status: "warn",
        detail: `${pages.length} Facebook-oldal vár az engedélyedre – amíg nem mondod, hogy igen, az OCP nem olvassa a leadeket.`,
        fix: { text: "Engedélyezem: kösd be az összes leadet", action: "subscribe_leadgen" },
      });
      return finish(checks, origin);
    }
    checks.push({
      id: "leadgen",
      label: "Azonnali leadek (oldalak)",
      status: !pages.length ? "error" : notSubscribed.length ? "warn" : "ok",
      detail: !pages.length
        ? "Nem látok Facebook-oldalt – a leadekhez és az új hirdetésekhez kell."
        : notSubscribed.length
          ? `${notSubscribed.length}/${pages.length} oldalon nincs bekapcsolva: ${notSubscribed.map((s) => s.page.name).join(", ")}`
          : `Mind a ${pages.length} oldalon bekapcsolva`,
      fix: !pages.length
        ? { text: "Csatlakozz újra, és a Facebook ablakban jelöld be az oldalakat is.", action: "connect_meta" }
        : notSubscribed.length
          ? { text: "Bekapcsolás most", action: "subscribe_leadgen" }
          : undefined,
    });
  } catch (err) {
    checks.push({ id: "leadgen", label: "Azonnali leadek (oldalak)", status: "error", detail: err instanceof Error ? err.message : String(err) });
  }

  return finish(checks, origin);
}

function finish(checks: HealthCheck[], origin: string) {
  // 6) webhook reachability
  const publicUrl = process.env.OCP_PUBLIC_URL ?? origin;
  const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(publicUrl);

  // access protection: everything sits behind sign-in; the session key must be stable on servers
  checks.push(
    process.env.OCP_SECRET || local
      ? { id: "auth", label: "Belépés védelme", status: "ok", detail: "Minden oldal belépéshez kötött." }
      : {
          id: "auth",
          label: "Belépés védelme",
          status: "warn",
          detail: "Nincs OCP_SECRET – több szerveres vagy újratelepített környezetben a belépések elveszhetnek.",
          fix: { text: "Állíts be egy hosszú, véletlen OCP_SECRET értéket a környezeti változók között." },
        },
  );
  const verify = !!process.env.META_VERIFY_TOKEN;
  checks.push({
    id: "webhook",
    label: "Lead webhook",
    status: verify && !local ? "ok" : "warn",
    detail:
      verify && !local
        ? `Callback: ${publicUrl}/api/webhooks/meta`
        : local
          ? "Az OCP most a saját gépeden fut, ezt a Meta nem éri el – a leadek percenkénti lekérdezéssel jönnek (kb. 1 perc késés)."
          : "Nincs META_VERIFY_TOKEN.",
    fix:
      verify && !local
        ? undefined
        : {
            text: local
              ? "Azonnali leadekhez tedd ki az OCP-t egy nyilvános címre (pl. Vercel), állítsd be az OCP_PUBLIC_URL-t, majd a Meta app → Webhooks → Page → leadgen mezőnél add meg a callback URL-t és a META_VERIFY_TOKEN-t."
              : "Adj meg egy tetszőleges titkos szöveget META_VERIFY_TOKEN-ként, és ugyanezt a Meta app Webhooks beállításánál.",
            href: "https://developers.facebook.com/apps/",
          },
  });

  // 7) image generation (optional)
  checks.push(
    process.env.OPENAI_API_KEY
      ? { id: "images", label: "AI képgenerálás", status: "ok", detail: `OpenAI · ${process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1"}` }
      : {
          id: "images",
          label: "AI képgenerálás",
          status: "warn",
          detail: "Kikapcsolva. A sablonos képek (pontos szöveg a fotón) ingyen működnek nélküle is.",
          fix: { text: "platform.openai.com → API keys → OPENAI_API_KEY a .env.local-ba (képenként fizetős, az ingyenes ChatGPT-nek nincs API-ja).", href: "https://platform.openai.com/api-keys" },
        },
  );
  return checks;
}

/** One-click fix = the lead consent "yes": webhooks on + backfill for every page. */
export async function fixLeadgen() {
  const { connectAllLeads } = await import("./meta/lead-access");
  const res = await connectAllLeads();
  return { ok: res.filter((r) => r.live).length, total: res.length, pages: res };
}
