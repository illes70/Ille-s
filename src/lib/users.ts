import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { User } from "./types";

// Who can sign in, and which workspace (tenant) each person works in.
// Every tenant has its own data folder (.data/tenants/<tenantId>), its own Facebook
// connection and its own live stream – one customer never sees another's data.

export const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "users.json");

interface UsersFile {
  version: 1;
  users: User[];
  /** invite nonces already used for a sign-up */
  usedInvites?: string[];
}

const g = globalThis as unknown as { __ocpUsers?: { cache: UsersFile | null; queue: Promise<unknown> } };
const state = (g.__ocpUsers ??= { cache: null, queue: Promise.resolve() });

/** Before multi-tenancy everything lived in .data/store.json: move it into the owner's tenant once. */
async function migrateSingleTenant(): Promise<UsersFile> {
  const legacy = path.join(DATA_DIR, "store.json");
  let old: { users?: User[] } | null = null;
  try {
    old = JSON.parse(await fs.readFile(legacy, "utf8"));
  } catch {
    return { version: 1, users: [] };
  }
  const users = old?.users ?? [];
  const owner = users.find((u) => u.role === "owner") ?? users[0];
  if (!owner) return { version: 1, users: [] };
  // everyone who shared the old store keeps sharing it: same tenant as the owner
  for (const u of users) u.tenantId = owner.id;
  const dir = path.join(DATA_DIR, "tenants", owner.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.rename(legacy, path.join(dir, "store.json"));
  for (const sub of ["media", "creatives"]) {
    await fs.rename(path.join(DATA_DIR, sub), path.join(dir, sub)).catch(() => undefined);
  }
  console.log(`[ocp] migrated single-tenant data into tenant ${owner.id}`);
  return { version: 1, users };
}

async function load(): Promise<UsersFile> {
  if (state.cache) return state.cache;
  try {
    state.cache = JSON.parse(await fs.readFile(FILE, "utf8")) as UsersFile;
  } catch {
    state.cache = await migrateSingleTenant();
    if (state.cache.users.length) await write(state.cache);
  }
  return state.cache;
}

async function write(data: UsersFile) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, FILE);
}

export async function listUsers(): Promise<User[]> {
  return (await load()).users;
}

export async function getUser(id: string): Promise<User | undefined> {
  return (await load()).users.find((u) => u.id === id);
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const e = email.trim().toLowerCase();
  return (await load()).users.find((u) => u.email === e);
}

export const tenantOf = (u: User) => u.tenantId ?? u.id;

/** Every workspace that exists (the background engine runs for each). */
export async function listTenants(): Promise<string[]> {
  return [...new Set((await load()).users.map(tenantOf))];
}

/** The operator's workspace: the only one .env Meta credentials (META_ACCESS_TOKEN …) apply to. */
export async function ownerTenant(): Promise<string | undefined> {
  // strictly the owner: never fall back to someone else (they'd get the operator's token)
  const owner = (await load()).users.find((u) => u.role === "owner");
  return owner && tenantOf(owner);
}

export function updateUsers<T>(fn: (users: User[], file: UsersFile) => T | Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    const data = await load();
    const result = await fn(data.users, data);
    await write(data);
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}

/** Removes a person; when nobody is left in their workspace, the whole workspace (all data) goes too. */
export async function deleteUser(id: string): Promise<{ tenantDeleted?: string }> {
  return updateUsers(async (users) => {
    const i = users.findIndex((u) => u.id === id);
    if (i < 0) return {};
    const tenant = tenantOf(users[i]);
    users.splice(i, 1);
    if (users.some((u) => tenantOf(u) === tenant)) return {};
    await fs.rm(path.join(DATA_DIR, "tenants", tenant.replace(/[^\w-]/g, "")), { recursive: true, force: true });
    return { tenantDeleted: tenant };
  });
}
