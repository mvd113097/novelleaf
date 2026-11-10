import { readSaved as get, writeSaved as set, removeSaved as del, savedKeys as keys, requestPersistentStorage } from "./storage";
import { buildBatchText, GEMINI_BATCH_CHARS, packPages, parseApiKeys, splitBatchOutput, splitTranslationText } from "./translation-utils";
import { fetchPage, GEMINI_MODELS, translateText } from "./remote.functions";
import { googleTranslate } from "./google-translate";
import { hasChinese } from "./speech-text";
import { cleanChapterParagraphs } from "./chapter-content";

export type ChapterRef = { title: string; url: string };
export type Book = { id: string; url: string; title: string; author?: string | undefined; summary: string; cover?: string | undefined; chapters: ChapterRef[]; addedAt: number; lastRead?: number | undefined; titleEn?: string | undefined; customTitle?: string | undefined };

/** Name shown for a book: the reader's own name, else the English translation, else the original. */
export const bookTitle = (b: Pick<Book, "title" | "titleEn" | "customTitle">) => b.customTitle?.trim() || b.titleEn?.trim() || b.title;
export type Chapter = { title: string; paragraphs: string[]; translated?: string[]; translationEngine?: "google" | "gemini" };

function cleanChapter(ch: Chapter, url: string): Chapter {
  const paragraphs = cleanChapterParagraphs(ch.paragraphs, url);
  const translated = ch.translated ? cleanChapterParagraphs(ch.translated, url) : undefined;
  return paragraphs === ch.paragraphs && translated === ch.translated ? ch : { ...ch, paragraphs, ...(translated ? { translated } : {}) };
}

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
  const list = best.filter((c) => !PAGER_LINKS.test(c.title)).filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
  // fuxsb-style pagers list bare page numbers and the book page itself is page 1.
  if (list.length > 1 && list.every((c) => /^\d+$/.test(c.title))) {
    const pages = list.map((c) => ({ title: `第${c.title}页`, url: c.url }));
    return list[0]?.title === "2" && !seen.has(base) ? [{ title: "第1页", url: base }, ...pages] : pages;
  }
  return list;
}
const PAGER_LINKS = /^(下一页|上一页|首页|尾页|末页|下一章|上一章|返回目录)$/;

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
  const ref = book.chapters[idx];
  if (!ref) throw new Error("Chapter not found");
  if (!forceNetwork) {
    const c = await get<Chapter>(key);
    if (c) {
      const cleaned = cleanChapter(c, ref.url);
      if (cleaned !== c) await set(key, cleaned);
      return cleaned;
    }
  }
  const { doc } = await loadDoc(ref.url);
  const ch: Chapter = cleanChapter({ title: ref.title, paragraphs: extractContent(doc) }, ref.url);
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
export async function getChapterTranslationStatus(book: Book, idx: number): Promise<{ translated: boolean; engine?: "google" | "gemini" }> {
  const chapter = await get<Chapter>(chapterKey(book, idx));
  return { translated: !!chapter?.translated?.length, ...(chapter?.translationEngine ? { engine: chapter.translationEngine } : {}) };
}

// Keys or models that hit a limit rest for a while; the next key, then the next model, is used.
const cooldowns = new Map<string, number>();
export const resetGeminiCooldowns = () => cooldowns.clear();
type GeminiOutcome = { text: string } | { blocked: true } | { truncated: true };
async function geminiTranslate(text: string, settings: TranslateSettings, pages = false): Promise<GeminiOutcome> {
  const keys = parseApiKeys(settings.apiKey);
  const slots = keys.length ? keys : [""];
  const models = [settings.model, ...GEMINI_MODELS.filter((m) => m !== settings.model)];
  let lastError = "";
  for (const model of models) {
    for (const apiKey of slots) {
      const slot = `${apiKey}|${model}`;
      if ((cooldowns.get(slot) ?? 0) > Date.now()) continue;
      const r = await translateText({ data: { text, engine: "gemini", model, ...(apiKey ? { apiKey } : {}), pages } });
      if (r.blocked) return { blocked: true };
      if (r.truncated) return { truncated: true };
      if (!r.status && r.text.trim()) return { text: r.text };
      if (!r.status) throw new Error("No translation returned. Your original chapter is saved.");
      if (r.status === 402) throw new Error(r.error ?? "AI credits are used up.");
      lastError = r.error ?? `Gemini error (${r.status})`;
      if (r.status === 429) cooldowns.set(slot, Date.now() + 60_000);
      else if (r.status === 401 || r.status === 403) cooldowns.set(slot, Date.now() + 3_600_000);
      else if (r.status === 404 && apiKey) cooldowns.set(slot, Date.now() + 3_600_000);
      else throw new Error(lastError);
    }
  }
  throw new Error(`All Gemini keys and models are at their limit right now. Your chapter is saved; try again in a minute or switch to Google Translate.${lastError ? ` (${lastError.slice(0, 120)})` : ""}`);
}

const toParagraphs = (text: string, url: string) => cleanChapterParagraphs(text.split(/\n+/).map((p) => p.trim()).filter(Boolean), url);
const chapterKey = (book: Book, idx: number) => `ch:${book.id}:${idx}:single-page-v2`;

// Translate one page now (callers hold the queue). Gemini sends up to ~8,000 characters per request.
async function translateOneNow(book: Book, idx: number, ch: Chapter, settings: TranslateSettings): Promise<Chapter> {
  const url = book.chapters[idx]?.url ?? book.url;
  const key = chapterKey(book, idx);
  const saved = await get<Chapter>(key);
  if (saved?.translated?.length) {
    const cleaned = cleanChapter(saved, url);
    if (cleaned !== saved) await set(key, cleaned);
    return cleaned;
  }
  const source = ch.paragraphs.join("\n\n");
  const chunks = splitTranslationText(source, settings.engine === "google" ? 1000 : GEMINI_BATCH_CHARS);
  const checkpointKey = `translation:${key}:${settings.engine}:${settings.model}`;
  const checkpoint = await get<{ source: string; output: string[] }>(checkpointKey);
  const out = checkpoint?.source === source ? checkpoint.output : [];
  for (let n = out.length; n < chunks.length; n++) {
    const chunk = chunks[n];
    if (chunk === undefined) continue;
    let text: string;
    if (settings.engine === "google") {
      if (n > 0) await new Promise<void>((resolve) => setTimeout(resolve, 500));
      text = await translateWithGoogle(chunk);
    } else {
      const r = await geminiTranslate(chunk, settings);
      // Safety-blocked or cut-off text falls back to Google Translate so the page still reads.
      text = "text" in r ? r.text : await translateWithGoogle(chunk);
    }
    if (!text.trim()) throw new Error("No translation returned. Your original chapter is saved.");
    out.push(text);
    await set(checkpointKey, { source, output: out });
  }
  const updated = { ...ch, translated: toParagraphs(out.join("\n\n"), url), translationEngine: settings.engine };
  await set(key, updated);
  await del(checkpointKey);
  return updated;
}

// One browser-wide queue prevents chapter opens and bulk jobs from flooding Google or Gemini.
let translationQueue: Promise<unknown> = Promise.resolve();
const pendingTranslations = new Map<string, Promise<Chapter>>();
const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => { const task = translationQueue.catch(() => {}).then(fn); translationQueue = task; return task; };
const jobKeyFor = (book: Book, idx: number, s: TranslateSettings) => `${chapterKey(book, idx)}:${s.engine}:${s.model}`;
function track(jobKey: string, task: Promise<Chapter>) {
  pendingTranslations.set(jobKey, task);
  const clear = () => { if (pendingTranslations.get(jobKey) === task) pendingTranslations.delete(jobKey); };
  task.then(clear, clear);
  return task;
}

export function translateChapter(book: Book, idx: number, ch: Chapter, settings = getTranslateSettings()): Promise<Chapter> {
  ch = cleanChapter(ch, book.chapters[idx]?.url ?? book.url);
  const jobKey = jobKeyFor(book, idx, settings);
  const pending = pendingTranslations.get(jobKey);
  if (pending) return pending;
  return track(jobKey, enqueue(() => translateOneNow(book, idx, ch, settings)));
}

/**
 * Translates several pages. With Gemini, short pages are packed together (up to ~8,000 characters)
 * so one request covers several pages; a batch that comes back incomplete is redone page by page.
 */
export class TranslationCancelledError extends Error {
  constructor() { super("Translation stopped."); this.name = "TranslationCancelledError"; }
}

export async function translateChapters(book: Book, items: { idx: number; ch: Chapter }[], settings = getTranslateSettings(), onDone?: (done: number, idx: number) => void, shouldContinue: () => boolean = () => true): Promise<Map<number, Chapter>> {
  const results = new Map<number, Chapter>();
  let done = 0;
  const finish = (idx: number, c: Chapter) => { results.set(idx, c); onDone?.(++done, idx); };
  const checkContinue = () => { if (!shouldContinue()) throw new TranslationCancelledError(); };
  const todo: { idx: number; ch: Chapter; text: string }[] = [];
  for (const { idx, ch } of items) {
    if (ch.translated?.length) { finish(idx, ch); continue; }
    const cleaned = cleanChapter(ch, book.chapters[idx]?.url ?? book.url);
    todo.push({ idx, ch: cleaned, text: cleaned.paragraphs.join("\n\n") });
  }
  if (settings.engine === "google") {
    for (const p of todo) { checkContinue(); finish(p.idx, await translateChapter(book, p.idx, p.ch, settings)); }
    return results;
  }
  for (const batch of packPages(todo)) {
    checkContinue();
    const fresh = batch.filter((p) => !pendingTranslations.has(jobKeyFor(book, p.idx, settings)));
    for (const p of batch) if (!fresh.includes(p)) finish(p.idx, await (pendingTranslations.get(jobKeyFor(book, p.idx, settings)) as Promise<Chapter>));
    if (!fresh.length) continue;
    if (fresh.length === 1) { const p = fresh[0]!; finish(p.idx, await translateChapter(book, p.idx, p.ch, settings)); continue; }
    const work = enqueue(async () => {
      const out = new Map<number, Chapter>();
      const waiting = [];
      for (const p of fresh) { const saved = await get<Chapter>(chapterKey(book, p.idx)); if (saved?.translated?.length) out.set(p.idx, saved); else waiting.push(p); }
      if (waiting.length > 1) {
        const r = await geminiTranslate(buildBatchText(waiting.map((p) => p.text)), settings, true);
        const parts = "text" in r ? splitBatchOutput(r.text, waiting.length) : null;
        if (parts) {
          for (let k = 0; k < waiting.length; k++) {
            const p = waiting[k]!;
            const updated = { ...p.ch, translated: toParagraphs(parts[k] ?? "", book.chapters[p.idx]?.url ?? book.url), translationEngine: settings.engine };
            await set(chapterKey(book, p.idx), updated);
            out.set(p.idx, updated);
          }
        }
      }
      for (const p of waiting) if (!out.has(p.idx)) out.set(p.idx, await translateOneNow(book, p.idx, p.ch, settings));
      return out;
    });
    for (const p of fresh) track(jobKeyFor(book, p.idx, settings), work.then((m) => m.get(p.idx) as Chapter));
    const out = await work;
    for (const p of fresh) finish(p.idx, out.get(p.idx) as Chapter);
  }
  return results;
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

export type TranslateSettings = { engine: "google" | "gemini"; model: string; apiKey: string; auto: boolean; prefetch: 0 | 1 | 3 };
export function getTranslateSettings(): TranslateSettings {
  const d: TranslateSettings = { engine: "google", model: "google/gemini-3.1-flash-lite", apiKey: "", auto: true, prefetch: 0 };
  try {
    const s = JSON.parse(localStorage.getItem("translate-settings") ?? "{}");
    return { engine: s.engine === "gemini" ? "gemini" : "google", model: typeof s.model === "string" ? s.model : d.model, apiKey: typeof s.apiKey === "string" ? s.apiKey : "", auto: typeof s.auto === "boolean" ? s.auto : true, prefetch: s.prefetch === 1 || s.prefetch === 3 ? s.prefetch : 0 };
  } catch { return d; }
}
export const TRANSLATE_SETTINGS_EVENT = "inkleaf:translate-settings";
export const saveTranslateSettings = (s: TranslateSettings) => {
  localStorage.setItem("translate-settings", JSON.stringify(s));
  window.dispatchEvent(new Event(TRANSLATE_SETTINGS_EVENT));
};
