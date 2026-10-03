import "server-only";
import { AsyncLocalStorage } from "async_hooks";

// Pins "the active ad account" for a piece of work (e.g. executing an approved plan of
// company A while the user already switched the UI to company B).

const g = globalThis as unknown as { __ocpAccountAls?: AsyncLocalStorage<string> };
const als = (g.__ocpAccountAls ??= new AsyncLocalStorage<string>());

export const pinnedAccount = () => als.getStore();

export function runAsActiveAccount<T>(accountId: string, fn: () => T): T {
  return als.run(accountId, fn);
}
