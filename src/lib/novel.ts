import { readSaved as get, writeSaved as set, removeSaved as del, savedKeys as keys, requestPersistentStorage } from "./storage";
import { splitTranslationText } from "./translation-utils";
import { fetchPage, translateText } from "./remote.functions";
import { googleTranslate } from "./google-translate";
import { hasChinese } from "./speech-text";

export type ChapterRef = { title: string; url: string };
export type Book = { id: string; url: string; title: string; author?: string | undefined; summary: string; cover?: string | undefined; chapters: ChapterRef[]; addedAt: number; lastRead?: number | undefined; titleEn?: string | undefined; customTitle?: string | undefined };

/** Name shown for a book: the reader's own name, else the English translation, else the original. */
export const bookTitle = (b: Pick<Book, "title" | "titleEn" | "customTitle">) => b.customTitle?.trim() || b.titleEn?.trim() || b.title;
export type Chapter = { title: string; paragraphs: string[]; translated?: string[] };

function decode(b64: string, contentType: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  let charset = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    charset = /charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8";
  }
  charset = charset.toLowerCase();
  if (charset === "gb2312" || charset === "gbk") charset = "gb18030";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function loadDoc(url: string) {
  const r = await fetchPage({ data: { url } });
  const html = decode(r.base64, r.contentType);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return { doc, base: r.finalUrl };
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const meta = (d: Document, sel: string) => d.querySelector(sel)?.getAttribute("content")?.trim() ?? "";

function extractToc(doc: Document, base: string): ChapterRef[] {
  const host = new URL(base).hostname;
  const groups = new Map<Element, ChapterRef[]>();
  doc.querySelectorAll("a[href]").forEach((a) => {
    const text = clean(a.textContent ?? "");
    if (!text || text.length > 60) return;
    let u: URL;
    const href = a.getAttribute("href");
    if (!href) return;
    try { u = new URL(href, base); } catch { return; }
    if (u.hostname !== host || !/\d/.test(u.pathname) || u.href === base) return;
    const container = a.closest("ul,ol,dl,div,section,table") ?? doc.body;
    if (!groups.has(container)) groups.set(container, []);
    groups.get(container)?.push({ title: text, url: u.href.split("#")[0] ?? u.href });
  });
  let best: ChapterRef[] = [];
  groups.forEach((list) => { if (list.length > best.length) best = list; });
  const seen = new Set<string>();
  return best.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

export async function importBook(url: string): Promise<Book> {
  await requestPersistentStorage();
  const { doc, base } = await loadDoc(url);
  const title = clean(meta(doc, 'meta[property="og:novel:book_name"]') || meta(doc, 'meta[property="og:title"]') || doc.querySelector("h1")?.textContent || doc.title.split(/[_|\-–]/)[0] || "Untitled");
  const author = meta(doc, 'meta[property="og:novel:author"]') || undefined;
  const summaryEl = doc.querySelector('[class*="intro"],[id*="intro"],[class*="desc"],[class*="summary"],[class*="jianjie"]');
  const summary = clean(meta(doc, 'meta[property="og:description"]') || summaryEl?.textContent || meta(doc, 'meta[name="description"]') || "");
  const cover = meta(doc, 'meta[property="og:image"]') || undefined;
  let chapters = extractToc(doc, base);
  if (chapters.length < 2) chapters = [{ title, url: base }];
  const book: Book = { id: btoa(unescape(encodeURIComponent(base))).replace(/[^a-z0-9]/gi, "").slice(-24), url: base, title, author, summary, cover, chapters, addedAt: Date.now() };
  const existing = await get<Book>(`book:${book.id}`);
  if (existing?.lastRead !== undefined) book.lastRead = existing.lastRead;
  if (existing?.customTitle) book.customTitle = existing.customTitle;
  if (existing?.titleEn && existing.title === book.title) book.titleEn = existing.titleEn;
  await set(`book:${book.id}`, book);
  return ensureEnglishTitle(book);
}

function extractContent(doc: Document) {
  doc.querySelectorAll("script,style,nav,header,footer,form,iframe,noscript,aside").forEach((e) => e.remove());
  let best: Element | null = null;
  let bestScore = 0;
  doc.querySelectorAll("div,article,section,td").forEach((el) => {
    let score = 0;
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) score += (n.textContent ?? "").trim().length;
      else if (n.nodeName === "P") score += (n.textContent ?? "").trim().length;
    });
    if (score > bestScore) { bestScore = score; best = el; }
  });
  const el = best as Element | null;
  if (!el) return [];
  el.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
  el.querySelectorAll("p").forEach((p) => p.append("\n"));
  el.querySelectorAll("a,h1,h2,select,button").forEach((e) => e.remove());
  return (el.textContent ?? "").split(/\n+/).map((s) => s.replace(/\u00a0/g, " ").trim()).filter(Boolean);
}

export async function getChapter(book: Book, idx: number, forceNetwork = false): Promise<Chapter> {
  // Versioned storage prevents older caches, which merged continuation pages,
  // from appearing as a single chapter in the reader.
  const key = `ch:${book.id}:${idx}:single-page-v2`;
  if (!forceNetwork) { const c = await get<Chapter>(key); if (c) return c; }
  const ref = book.chapters[idx];
  if (!ref) throw new Error("Chapter not found");
  const { doc } = await loadDoc(ref.url);
  const ch: Chapter = { title: ref.title, paragraphs: extractContent(doc) };
  await set(key, ch);
  return ch;
}

// Google translation runs from the reader's browser first (their own quota), then via the server.
export async function translateWithGoogle(text: string): Promise<string> {
  try {
    return await googleTranslate(text);
  } catch (browserError) {
    try {
      const r = await translateText({ data: { text, engine: "google" } });
      if (r.text.trim()) return r.text;
    } catch { /* report the browser error below */ }
    throw browserError;
  }
}

/** Adds an English library title once; keeps the Chinese title if translation is unavailable. */
export async function ensureEnglishTitle(book: Book): Promise<Book> {
  if (book.titleEn || !hasChinese(book.title)) return book;
  try {
    const titleEn = (await translateWithGoogle(book.title)).trim();
    if (!titleEn) return book;
    const latest = (await get<Book>(`book:${book.id}`)) ?? book;
    const updated = { ...latest, titleEn };
    await set(`book:${book.id}`, updated);
    return updated;
  } catch { return book; }
}

export async function renameBook(book: Book, name: string): Promise<Book> {
  const latest = (await get<Book>(`book:${book.id}`)) ?? book;
  const updated: Book = { ...latest, customTitle: name.trim() || undefined };
  await set(`book:${book.id}`, updated);
  return updated;
}

export const isCached = async (book: Book, idx: number) => !!(await get(`ch:${book.id}:${idx}:single-page-v2`));

// One browser-wide queue prevents chapter opens and bulk jobs from flooding Google.
let translationQueue: Promise<unknown> = Promise.resolve();
const pendingTranslations = new Map<string, Promise<Chapter>>();
export function translateChapter(book: Book, idx: number, ch: Chapter, settings = getTranslateSettings()): Promise<Chapter> {
  const key = `ch:${book.id}:${idx}:single-page-v2`;
  const jobKey = `${key}:${settings.engine}:${settings.model}`;
  const pending = pendingTranslations.get(jobKey);
  if (pending) return pending;
  const task = translationQueue.catch(() => {}).then(async () => {
    const saved = await get<Chapter>(key);
    if (saved?.translated?.length) return saved;
    const chunks = splitTranslationText(ch.paragraphs.join("\n\n"), settings.engine === "google" ? 1000 : 2500);
    const checkpointKey = `translation:${jobKey}`;
    const checkpoint = await get<{ source: string; output: string[] }>(checkpointKey);
    const source = ch.paragraphs.join("\n\n");
    const out = checkpoint?.source === source ? checkpoint.output : [];
    for (let n = out.length; n < chunks.length; n++) {
      const chunk = chunks[n];
      if (chunk === undefined) continue;
      if (settings.engine === "google" && n > 0) await new Promise<void>((resolve) => setTimeout(resolve, 500));
      const r = settings.engine === "google" ? { text: await translateWithGoogle(chunk) } : await translateText({ data: { text: chunk, ...settings } });
      if (!r.text.trim()) throw new Error("No translation returned. Your original chapter is saved.");
      out.push(r.text);
      await set(checkpointKey, { source, output: out });
    }
    const translated = out.join("\n\n").split(/\n+/).map((p) => p.trim()).filter(Boolean);
    const updated = { ...ch, translated };
    await set(key, updated);
    await del(checkpointKey);
    return updated;
  });
  translationQueue = task;
  pendingTranslations.set(jobKey, task);
  const clear = () => { pendingTranslations.delete(jobKey); };
  task.then(clear, clear);
  return task;
}

export async function listBooks(): Promise<Book[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith("book:"));
  const books = await Promise.all(ks.map((k) => get<Book>(k)));
  return (books.filter(Boolean) as Book[]).sort((a, b) => (b.lastRead ?? b.addedAt) - (a.lastRead ?? a.addedAt));
}
export const getBook = (id: string) => get<Book>(`book:${id}`);
export const saveBook = (b: Book) => set(`book:${b.id}`, b);
export async function deleteBook(b: Book) {
  const related = (await keys()).filter((key) => key.startsWith(`ch:${b.id}:`) || key.startsWith(`translation:ch:${b.id}:`));
  await Promise.all(related.map((key) => del(key)));
  await del(`book:${b.id}`);
}

export type TranslateSettings = { engine: "google" | "gemini"; model: string; apiKey: string; auto: boolean };
export function getTranslateSettings(): TranslateSettings {
  const d: TranslateSettings = { engine: "google", model: "google/gemini-3.1-flash-lite", apiKey: "", auto: true };
  try {
    const s = JSON.parse(localStorage.getItem("translate-settings") ?? "{}");
    return { engine: s.engine === "gemini" ? "gemini" : "google", model: typeof s.model === "string" ? s.model : d.model, apiKey: typeof s.apiKey === "string" ? s.apiKey : "", auto: typeof s.auto === "boolean" ? s.auto : true };
  } catch { return d; }
}
export const TRANSLATE_SETTINGS_EVENT = "inkleaf:translate-settings";
export const saveTranslateSettings = (s: TranslateSettings) => {
  localStorage.setItem("translate-settings", JSON.stringify(s));
  window.dispatchEvent(new Event(TRANSLATE_SETTINGS_EVENT));
};
