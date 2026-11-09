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