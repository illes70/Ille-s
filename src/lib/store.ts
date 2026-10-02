import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import type { Activity, Ad, Lead, Proposal, Settings } from "./types";
import { demoAds, demoLeads, demoSettings } from "./demo-data";

// Single-tenant JSON store for the MVP. Swap for Postgres when OCP goes multi-tenant.

export interface StoreData {
  settings: Settings;
  /** demo-mode ads (in Meta mode ads are always read live) */
  ads: Ad[];
  leads: Lead[];
  proposals: Proposal[];
  activity: Activity[];
  /** full Claude message history of the assistant chat (append-only) */
  chat: Anthropic.Beta.Messages.BetaMessageParam[];
  lastScanAt?: string;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

let cache: StoreData | null = null;
let queue: Promise<unknown> = Promise.resolve();

function seed(): StoreData {
  return {
    settings: structuredClone(demoSettings),
    ads: structuredClone(demoAds),
    leads: structuredClone(demoLeads),
    proposals: [],
    activity: [],
    chat: [],
  };
}

async function load(): Promise<StoreData> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8")) as StoreData;
  } catch {
    cache = seed();
  }
  return cache;
}

export async function readStore(): Promise<StoreData> {
  return load();
}

/** Serialized read-modify-write so concurrent requests don't clobber each other. */
export function updateStore<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const data = await load();
    const result = await fn(data);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(data, null, 2));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function logActivity(
  actor: Activity["actor"],
  kind: Activity["kind"],
  text: string,
): Promise<Activity> {
  return updateStore((d) => {
    const entry: Activity = { id: newId("act"), ts: new Date().toISOString(), actor, kind, text };
    d.activity.unshift(entry);
    d.activity = d.activity.slice(0, 500);
    return entry;
  });
}
