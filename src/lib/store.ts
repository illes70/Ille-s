import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import type {
  Activity,
  Ad,
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
} from "./types";
import { demoAds, demoCompanies, demoLeads, demoRecipes, demoSettings } from "./demo-data";
import { knowledgeSeed } from "./knowledge-seed";
import { publish } from "./live-bus";

// Single-tenant JSON store for the MVP. Swap for Postgres when OCP goes multi-tenant.

const VERSION = 4;

export interface StoreData {
  version: number;
  /** people who can sign in (the first one to register is the owner) */
  users: User[];
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
  /** demo leads + leads pushed by the Meta webhook */
  leads: Lead[];
  /** status OCP tracks per lead id (Meta has no lead pipeline) */
  leadStatus: Record<string, LeadStatus>;
  proposals: Proposal[];
  activity: Activity[];
  /** Claude message history per ad account (append-only) */
  chats: Record<string, Anthropic.Beta.Messages.BetaMessageParam[]>;
  lastScanAt?: string;
}

export const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

// on globalThis: every route bundle in the server process must share one copy
const g = globalThis as unknown as { __ocpStore?: { cache: StoreData | null; queue: Promise<unknown> } };
const state = (g.__ocpStore ??= { cache: null, queue: Promise.resolve() });

function seed(previous?: Partial<StoreData>): StoreData {
  return {
    version: VERSION,
    // accounts and a real Meta connection survive demo re-seeds
    users: previous?.users ?? [],
    settings: structuredClone(demoSettings),
    metaAuth: previous?.metaAuth,
    companies: structuredClone(demoCompanies),
    knowledge: structuredClone(knowledgeSeed),
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

async function load(): Promise<StoreData> {
  if (state.cache) return state.cache;
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8")) as StoreData;
    state.cache = parsed.version === VERSION ? parsed : seed(parsed);
  } catch {
    state.cache = seed();
  }
  return state.cache;
}

export async function readStore(): Promise<StoreData> {
  return load();
}

/**
 * Serialized read-modify-write so concurrent requests don't clobber each other.
 * Pass `touch` to tell every open browser which data changed.
 */
export function updateStore<T>(fn: (data: StoreData) => T | Promise<T>, touch?: LiveKey[]): Promise<T> {
  const run = state.queue.then(async () => {
    const data = await load();
    const result = await fn(data);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2));
    if (touch?.length) publish({ type: "invalidate", keys: touch });
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Activity entries are also the "something happened" signal: open pages refresh right away. */
export function logActivity(actor: Activity["actor"], kind: Activity["kind"], text: string): Promise<Activity> {
  return updateStore(
    (d) => {
      const entry: Activity = { id: newId("act"), ts: new Date().toISOString(), actor, kind, text };
      d.activity.unshift(entry);
      d.activity = d.activity.slice(0, 500);
      return entry;
    },
    ["activity", "ads", "proposals", "leads"],
  );
}
