import { splitTranslationText } from "./translation-utils";

const endpoints = ["https://translate.googleapis.com/translate_a/single", "https://translate.google.com/translate_a/single", "https://clients5.google.com/translate_a/t"];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function googleTranslate(text: string, wait = sleep, request: typeof fetch = fetch): Promise<string> {
  const output: string[] = [];
  for (const chunk of splitTranslationText(text)) {
    if (output.length) await wait(500);
    let translated: string | undefined;
    for (let attempt = 0; attempt < endpoints.length; attempt++) {
      const endpoint = endpoints[attempt];
      if (!endpoint) break;
      const url = new URL(endpoint);
      url.search = new URLSearchParams({ client: attempt === 2 ? "dict-chrome-ex" : "gtx", sl: "auto", tl: "en", dt: "t" }).toString();
      if (attempt) url.searchParams.set("q", chunk);
      let res: Response;
      try {
        res = await request(url, attempt ? { method: "GET" } : { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ q: chunk }).toString() });
      } catch {
        if (attempt === 2) throw new Error("Google Translate is unreachable. Your original chapter is saved; try translating again later.");
        await wait(1000 * 2 ** attempt); continue;
      }
      if (!res.ok) {
        if (res.status !== 429 && res.status < 500) throw new Error(`Google Translate could not process this text (${res.status}). Your original chapter is saved.`);
        if (attempt === 2) throw new Error("Google Translate is temporarily busy. Your chapter and completed translations are saved; try again later.");
        const retry = res.headers.get("Retry-After");
        const retryMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
        // Do not retry early when Google's requested wait is too long for an interactive request.
        if (retryMs > 10000) throw new Error("Google Translate asks you to wait before translating again. Your chapter is saved; try again later.");
        await wait(Math.max(1000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0)); continue;
      }
      const json: unknown = await res.json();
      if (attempt === 2 && Array.isArray(json)) translated = json.map((part) => typeof part === "string" ? part : Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("");
      else if (Array.isArray(json) && Array.isArray(json[0])) translated = json[0].map((part: unknown) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("");
      if (!translated?.trim()) throw new Error("Google Translate returned no translation. Your chapter is saved; try again later.");
      break;
    }
    if (translated === undefined) throw new Error("Google Translate is temporarily unavailable.");
    output.push(translated);
  }
  return output.join("");
}