export function splitTranslationText(text: string, limit = 1000): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const candidate = rest.slice(0, limit);
    const boundary = Math.max(candidate.lastIndexOf("\n"), candidate.lastIndexOf("。") + 1, candidate.lastIndexOf("！") + 1, candidate.lastIndexOf("？") + 1);
    let end = boundary > limit / 2 ? boundary : limit;
    if (/[\uD800-\uDBFF]/.test(rest.charAt(end - 1))) end--;
    chunks.push(rest.slice(0, end)); rest = rest.slice(end);
  }
  if (rest) chunks.push(rest);
  return chunks;
}
export function translationEngineLabel(s: { engine: "google" | "gemini"; model: string }) {
  return s.engine === "google" ? "Google Translate" : `Gemini · ${s.model.replace("google/", "")}`;
}

export function getPrefetchIndexes(currentIndex: number, chapterCount: number, pagesAhead: 0 | 1 | 3): number[] {
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || !Number.isInteger(chapterCount) || chapterCount <= currentIndex) return [];
  const count = Math.min(pagesAhead, chapterCount - currentIndex - 1);
  return Array.from({ length: count }, (_, offset) => currentIndex + offset + 1);
}

/** Characters of Chinese sent to Gemini in one request (one long page, or several short pages). */
export const GEMINI_BATCH_CHARS = 8000;
/** Most pages packed into one Gemini request, so page markers stay reliable. */
export const GEMINI_BATCH_PAGES = 5;

/** Reads one or more Gemini keys typed one per line, or separated by commas or spaces. */
export function parseApiKeys(raw: string): string[] {
  return [...new Set(raw.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean))];
}

/** Groups pages, in order, into Gemini requests of at most `limit` characters and `maxPages` pages. */
export function packPages<T extends { text: string }>(pages: T[], limit = GEMINI_BATCH_CHARS, maxPages = GEMINI_BATCH_PAGES): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const page of pages) {
    if (current.length && (size + page.text.length > limit || current.length >= maxPages)) { batches.push(current); current = []; size = 0; }
    current.push(page); size += page.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

const pageMarker = (n: number) => `[[PAGE ${n}]]`;
/** Joins pages into one prompt, each starting with a [[PAGE n]] marker line. */
export const buildBatchText = (texts: string[]) => texts.map((t, k) => `${pageMarker(k + 1)}\n${t}`).join("\n\n");

/** Splits a batched translation back into pages; null when any page marker is missing or empty. */
export function splitBatchOutput(output: string, count: number): string[] | null {
  const re = /^[ \t>*_#]*\[\[\s*PAGE\s+(\d+)\s*\]\][ \t*_]*$/gim;
  const marks = [...output.matchAll(re)];
  if (marks.length !== count) return null;
  const pages: string[] = [];
  for (let k = 0; k < marks.length; k++) {
    const m = marks[k];
    if (!m || Number(m[1]) !== k + 1 || m.index === undefined) return null;
    const end = marks[k + 1]?.index ?? output.length;
    const text = output.slice(m.index + m[0].length, end).trim();
    if (!text) return null;
    pages.push(text);
  }
  return pages;
}
