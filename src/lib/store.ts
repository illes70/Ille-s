import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  Activity,
  Ad,
  Brief,
  PushSub,
  Company,
  KnowledgeEntry,
  Lead,
  LeadStatus,
  LiveKey,
  MediaItem,
  MetaAuth,
  Proposal,
  User,
  Recipe,
  Settings,
  UndoAction,
} from "./types";
import { demoAds, demoCompanies, demoLeads, demoRecipes, demoSettings } from "./demo-data";
import { knowledgeSeed } from "./knowledge-seed";
import { metaGuide } from "./knowledge-meta";

const playbook = () => structuredClone([...knowledgeSeed, ...metaGuide]);
import { publish } from "./live-bus";
import { currentTenant, tenantDir } from "./tenant";

// One JSON store per workspace (tenant): .data/tenants/<tenantId>/store.json.
// Which tenant is resolved per call (session cookie, or runAsTenant in background jobs),
// so callers never pass it around and can't read another customer's data by mistake.

const VERSION = 4;

export interface StoreData {
  version: number;
  settings: Settings;
  /** ad account the UI and the assistant currently work on */
  activeAccountId?: string;
  /** Facebook Login connection (one-click connect) */
  metaAuth?: MetaAuth;
  /** company profile per ad account */
  companies: Record<string, Company>;
  knowledge: KnowledgeEntry[];
  recipes: Recipe[];
  media: MediaItem[];
  /** demo-mode ads (in Meta mode ads are always read live) */
  ads: Ad[];
  /** demo-mode campaigns / ad sets created through the assistant (no ads yet) */
  demoCreated?: {
    campaigns: { id: string; name: string; objective: string; specialAdCategories: string[]; dailyBudget?: number }[];
    adsets: { id: string; campaignId: string; name: string; dailyBudget?: number; optimizationGoal: string; targeting: unknown }[];
    audiences: { id: string; name: string; type: string; size: string }[];
  };
  /** demo leads + leads pushed by the Meta webhook */
  leads: Lead[];
  /** status OCP tracks per lead id (Meta has no lead pipeline) */
  leadStatus: Record<string, LeadStatus>;
  proposals: Proposal[];
  activity: Activity[];
  /** Claude message history per ad account (append-only) */
  chats: Record<string, Anthropic.Beta.Messages.BetaMessageParam[]>;
  lastScanAt?: string;
  /** morning briefs, newest first */
  briefs?: Brief[];
  /** devices that get push notifications */
  pushSubs?: PushSub[];
  /** bookkeeping of the background engine */
  jobs?: {
    lastBriefDate?: string;
    /** account → local date the spend cap paused it */
    guardTripped?: Record<string, string>;
    /** local date of the last "token expires soon" warning */
    tokenWarnedOn?: string;
  };
  /** AI spend per month ("2026-10" → totals) */
  usage?: Record<string, import("./ai-usage").MonthUsage>;
  /** who allowed OCP to pull in the leads of every page, and when (GDPR record) */
  leadConsent?: { userId: string; userName: string; at: string; pageIds: string[] };
}

/** Settings with every newer field filled in (stores written by older versions lack them). */
export function settingsWithDefaults(s: Settings): Required<Pick<Settings, "schedule" | "notify" | "ai">> & Settings {
  return {
    ...s,
    ai: { mode: "max", monthlyBudgetUsd: 20, onLimit: "saver", imageTier: "standard", ...s.ai },
    schedule: { scanEveryMinutes: 60, briefEnabled: true, briefTime: "07:30", timezone: "Europe/Budapest", ...s.schedule },
    notify: { leadsEmail: true, leadsPush: true, briefEmail: true, briefPush: true, alertsEmail: true, alertsPush: true, ...s.notify },
  };
}

export { DATA_DIR } from "./users";

interface TenantState {
  cache: StoreData | null;
  queue: Promise<unknown>;
}
// on globalThis: every route bundle in the server process must share one copy
const g = globalThis as unknown as { __ocpStores?: Map<string, TenantState> };
const states = (g.__ocpStores ??= new Map());
const stateOf = (t: string): TenantState => {
  let s = states.get(t);
  if (!s) states.set(t, (s = { cache: null, queue: Promise.resolve() }));
  return s;
};

/** Folder of the current tenant (store, media, creative cache). */
export async function dataDir(): Promise<string> {
  return tenantDir(await currentTenant());
}

function seed(previous?: Partial<StoreData>): StoreData {
  return {
    version: VERSION,
    // a real Meta connection survives demo re-seeds
    settings: structuredClone(demoSettings),
    metaAuth: previous?.metaAuth,
    companies: structuredClone(demoCompanies),
    knowledge: playbook(),
    recipes: structuredClone(demoRecipes),
    media: [],
    ads: structuredClone(demoAds),
    leads: structuredClone(demoLeads),
    leadStatus: {},
    proposals: [],
    activity: [],
    chats: {},
  };
}

async function load(tenant: string): Promise<StoreData> {
  const state = stateOf(tenant);
  if (state.cache) return state.cache;
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(tenantDir(tenant), "store.json"), "utf8")) as StoreData & { users?: User[] };
    delete parsed.users; // lived here before multi-tenancy
    state.cache = parsed.version === VERSION ? parsed : seed(parsed);
    // the playbook ships with the code: refresh it, keep the user's own entries
    state.cache.knowledge = [...state.cache.knowledge.filter((e) => e.kind === "own"), ...playbook()];
  } catch {
    state.cache = seed();
  }
  return state.cache;
}

export async function readStore(): Promise<StoreData> {
  return load(await currentTenant());
}

/**
 * Serialized read-modify-write so concurrent requests don't clobber each other.
 * Pass `touch` to tell every open browser which data changed.
 */
export async function updateStore<T>(fn: (data: StoreData) => T | Promise<T>, touch?: LiveKey[]): Promise<T> {
  const tenant = await currentTenant();
  const state = stateOf(tenant);
  const run = state.queue.then(async () => {
    const data = await load(tenant);
    const result = await fn(data);
    const dir = tenantDir(tenant);
    await fs.mkdir(dir, { recursive: true });
    // write-then-rename: a crash mid-write never leaves a half-written store
    const file = path.join(dir, "store.json");
    await fs.writeFile(`${file}.tmp`, JSON.stringify(data, null, 2));
    await fs.rename(`${file}.tmp`, file);
    if (touch?.length) publish({ type: "invalidate", keys: touch }, tenant);
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Activity entries are also the "something happened" signal: open pages refresh right away. */
export function logActivity(actor: Activity["actor"], kind: Activity["kind"], text: string, undo?: UndoAction): Promise<Activity> {
  return updateStore(
    (d) => {
      const entry: Activity = { id: newId("act"), ts: new Date().toISOString(), actor, kind, text, ...(undo ? { undo } : {}) };
      d.activity.unshift(entry);
      d.activity = d.activity.slice(0, 500);
      return entry;
    },
    ["activity", "ads", "proposals", "leads"],
  );
}

/** Drop the in-memory copy of a deleted workspace. */
export function forgetTenant(tenant: string) {
  states.delete(tenant);
}
