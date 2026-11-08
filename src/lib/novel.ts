import { get, set, del, keys } from "idb-keyval";
import { fetchPage, translateText } from "./remote.functions";

export type ChapterRef = { title: string; url: string };
export type Book = { id: string; url: string; title: string; author?: string; summary: string; cover?: string; chapters: ChapterRef[]; addedAt: number; lastRead?: number };
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
    try { u = new URL(a.getAttribute("href")!, base); } catch { return; }
    if (u.hostname !== host || !/\d/.test(u.pathname) || u.href === base) return;
    const container = a.closest("ul,ol,dl,div,section,table") ?? doc.body;
    if (!groups.has(container)) groups.set(container, []);
    groups.get(container)!.push({ title: text, url: u.href.split("#")[0] });
  });
  let best: ChapterRef[] = [];
  groups.forEach((list) => { if (list.length > best.length) best = list; });
  const seen = new Set<string>();
  return best.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

export async function importBook(url: string): Promise<Book> {
  const { doc, base } = await loadDoc(url);
  const title = clean(meta(doc, 'meta[property="og:novel:book_name"]') || meta(doc, 'meta[property="og:title"]') || doc.querySelector("h1")?.textContent || doc.title.split(/[_|\-–]/)[0] || "Untitled");
  const author = meta(doc, 'meta[property="og:novel:author"]') || undefined;
  const summaryEl = doc.querySelector('[class*="intro"],[id*="intro"],[class*="desc"],[class*="summary"],[class*="jianjie"]');
  const summary = clean(meta(doc, 'meta[property="og:description"]') || summaryEl?.textContent || meta(doc, 'meta[name="description"]') || "");
  const cover = meta(doc, 'meta[property="og:image"]') || undefined;
  let chapters = extractToc(doc, base);
  if (chapters.length < 2) chapters = [{ title, url: base }];
  const book: Book = { id: btoa(unescape(encodeURIComponent(base))).replace(/[^a-z0-9]/gi, "").slice(-24), url: base, title, author, summary, cover, chapters, addedAt: Date.now() };
  await set(`book:${book.id}`, book);
  return book;
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
  const key = `ch:${book.id}:${idx}`;
  if (!forceNetwork) { const c = await get<Chapter>(key); if (c) return c; }
  const ref = book.chapters[idx];
  let url: string | null = ref.url;
  const paragraphs: string[] = [];
  for (let page = 0; url && page < 8; page++) {
    const { doc, base } = await loadDoc(url);
    const next = Array.from(doc.querySelectorAll("a[href]")).find((a) => /下一页|下页/.test(a.textContent ?? ""));
    paragraphs.push(...extractContent(doc));
    url = next ? new URL(next.getAttribute("href")!, base).href : null;
    if (url && !/_\d+\.html?/.test(url)) url = null;
  }
  const ch: Chapter = { title: ref.title, paragraphs };
  await set(key, ch);
  return ch;
}

export const isCached = async (book: Book, idx: number) => !!(await get(`ch:${book.id}:${idx}`));

export async function translateChapter(book: Book, idx: number, ch: Chapter): Promise<Chapter> {
  const chunks: string[][] = [[]];
  let len = 0;
  for (const p of ch.paragraphs) {
    if (len + p.length > 2500 && chunks[chunks.length - 1].length) { chunks.push([]); len = 0; }
    chunks[chunks.length - 1].push(p); len += p.length;
  }
  const out: string[] = [];
  for (const c of chunks) {
    const r = await translateText({ data: { text: c.join("\n\n") } });
    out.push(...r.text.split(/\n+/).map((s) => s.trim()).filter(Boolean));
  }
  const updated = { ...ch, translated: out };
  await set(`ch:${book.id}:${idx}`, updated);
  return updated;
}

export async function listBooks(): Promise<Book[]> {
  const ks = (await keys()).filter((k) => String(k).startsWith("book:"));
  const books = await Promise.all(ks.map((k) => get<Book>(k)));
  return (books.filter(Boolean) as Book[]).sort((a, b) => (b.lastRead ?? b.addedAt) - (a.lastRead ?? a.addedAt));
}
export const getBook = (id: string) => get<Book>(`book:${id}`);
export const saveBook = (b: Book) => set(`book:${b.id}`, b);
export async function deleteBook(b: Book) {
  await del(`book:${b.id}`);
  await Promise.all(b.chapters.map((_, i) => del(`ch:${b.id}:${i}`)));
}
