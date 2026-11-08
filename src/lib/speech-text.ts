// Browser page translators (Chrome/Edge "Translate this page") rewrite the DOM text,
// so read-aloud must speak what is on screen, not the original chapter data.
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

export const hasChinese = (text: string) => CJK.test(text);

/** Language the browser translated the page into, or null when the page is not browser-translated. */
export function browserTranslatedLang(root: Element): string | null {
  const translated = root.classList.contains("translated-ltr") || root.classList.contains("translated-rtl");
  if (!translated) return null;
  return (root.getAttribute("lang") ?? "").toLowerCase().split("-")[0] || "en";
}

/** Text to speak for a paragraph: the on-screen (possibly browser-translated) text, falling back to the saved text. */
export function spokenText(el: Element | null, fallback: string) {
  const shown = el?.textContent?.replace(/\s+/g, " ").trim();
  return shown || fallback;
}

/** Speech language for a piece of text: Chinese if it still contains Chinese characters, otherwise the translated language. */
export function speechLang(text: string, translatedLang: string | null) {
  return hasChinese(text) ? "zh" : translatedLang ?? "en";
}
