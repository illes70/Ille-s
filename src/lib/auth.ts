import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { promisify } from "util";

// Accounts + signed session cookies. Node-only (used by proxy.ts and route handlers).
// The cookie is "<userId>.<expiresMs>.<hmac>", signed with OCP_SECRET or a secret
// generated once into .data/secret – so it can be verified without reading the store.

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "ocp_session";
const SESSION_DAYS = 30;

let secretCache: string | null = null;
function secret(): string {
  if (process.env.OCP_SECRET) return process.env.OCP_SECRET;
  if (secretCache) return secretCache;
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "secret");
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  secretCache = readFileSync(file, "utf8").trim();
  return secretCache;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("hex");

export function createSession(userId: string) {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `${userId}.${expires}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_DAYS * 86_400 };
}

/** userId of a valid, unexpired session cookie, else null. */
export function verifySession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, mac] = parts;
  const expected = sign(`${userId}.${expires}`);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(expires) < Date.now()) return null;
  return userId;
}

/** Sign-up invite link token: "<expiresMs>.<nonce>.<hmac>" – valid for `days`, single use. */
export function createInvite(days = 14) {
  const expires = Date.now() + days * 86_400_000;
  const nonce = randomBytes(9).toString("base64url");
  const payload = `invite.${expires}.${nonce}`;
  return `${expires}.${nonce}.${sign(payload)}`;
}

/** nonce of a valid, unexpired invite token, else null (single use is checked by the caller). */
export function verifyInvite(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [expires, nonce, mac] = parts;
  const expected = sign(`invite.${expires}.${nonce}`);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  if (Number(expires) < Date.now()) return null;
  return nonce;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function checkPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(hashHex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: !!process.env.OCP_PUBLIC_URL?.startsWith("https"),
  maxAge,
  path: "/",
});
