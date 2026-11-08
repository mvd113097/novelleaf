import { get, set, del, keys } from "idb-keyval";

const BACKUP = "inkleaf-backup:";
export async function requestPersistentStorage() {
  try { return await navigator.storage?.persist?.() ?? false; } catch { return false; }
}
function readBackup<T>(key: string): T | undefined {
  try { const raw = localStorage.getItem(BACKUP + key); return raw ? JSON.parse(raw) as T : undefined; } catch { return undefined; }
}
export async function readSaved<T>(key: string): Promise<T | undefined> {
  try { const value = await get<T>(key); if (value !== undefined) return value; } catch { /* Recover below. */ }
  const value = readBackup<T>(key);
  if (value !== undefined) { try { await set(key, value); } catch { /* Backup remains available. */ } }
  return value;
}
export async function writeSaved<T>(key: string, value: T) {
  let durable = false;
  try { await set(key, value); durable = true; } catch { /* Try the fallback. */ }
  try { localStorage.setItem(BACKUP + key, JSON.stringify(value)); durable = true; } catch { /* IndexedDB supports larger books than localStorage. */ }
  if (!durable) throw new Error("Your browser could not save this content. Free some device storage and try again.");
}
export async function savedKeys(): Promise<string[]> {
  const result = new Set<string>();
  try { for (const key of await keys()) result.add(String(key)); } catch { /* Recover local backups. */ }
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(BACKUP)) result.add(key.slice(BACKUP.length)); } } catch { /* Storage restricted. */ }
  return [...result];
}
export async function removeSaved(key: string) {
  // Remove both copies; never silently resurrect an explicitly deleted book.
  await del(key);
  localStorage.removeItem(BACKUP + key);
}