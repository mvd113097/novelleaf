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