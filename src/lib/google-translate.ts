import { splitTranslationText } from "./translation-utils";

// Free Google Translate endpoints, no key. Safe to run in the browser (they allow cross-origin
// requests), which uses the reader's own connection instead of the shared, often-throttled server.
type Endpoint = { url: string; client: string; format: "list" | "nested" };
const endpoints: Endpoint[] = [
  { url: "https://clients5.google.com/translate_a/t", client: "dict-chrome-ex", format: "list" },
  { url: "https://translate.googleapis.com/translate_a/single", client: "gtx", format: "nested" },
  { url: "https://translate.google.com/translate_a/single", client: "gtx", format: "nested" },
];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const defaultRequest: typeof fetch = (input, init) => fetch(input, init);

function parse(json: unknown, format: Endpoint["format"]) {
  if (!Array.isArray(json)) return "";
  if (format === "list") return json.map((part) => typeof part === "string" ? part : Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("");
  return Array.isArray(json[0]) ? json[0].map((part: unknown) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("") : "";
}

export async function googleTranslate(text: string, wait = sleep, request: typeof fetch = defaultRequest): Promise<string> {
  const output: string[] = [];
  for (const chunk of splitTranslationText(text)) {
    if (output.length) await wait(500);
    let translated: string | undefined;
    for (let attempt = 0; attempt < endpoints.length; attempt++) {
      const endpoint = endpoints[attempt];
      if (!endpoint) break;
      const last = attempt === endpoints.length - 1;
      const url = new URL(endpoint.url);
      url.search = new URLSearchParams({ client: endpoint.client, sl: "auto", tl: "en", dt: "t" }).toString();
      let res: Response;
      try {
        // Form POST is a "simple" cross-origin request: no preflight, and long chapters fit.
        res = await request(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ q: chunk }).toString() });
      } catch {
        if (last) throw new Error("Google Translate is unreachable. Your original chapter is saved; try translating again later.");
        await wait(1000 * 2 ** attempt); continue;
      }
      if (!res.ok) {
        if (res.status !== 429 && res.status < 500) throw new Error(`Google Translate could not process this text (${res.status}). Your original chapter is saved.`);
        if (last) throw new Error("Google Translate is temporarily busy. Your chapter and completed translations are saved; try again later.");
        const retry = res.headers.get("Retry-After");
        const retryMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
        // Do not retry early when Google's requested wait is too long for an interactive request.
        if (retryMs > 10000) throw new Error("Google Translate asks you to wait before translating again. Your chapter is saved; try again later.");
        await wait(Math.max(1000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0)); continue;
      }
      translated = parse(await res.json(), endpoint.format);
      if (!translated.trim()) throw new Error("Google Translate returned no translation. Your chapter is saved; try again later.");
      break;
    }
    if (translated === undefined) throw new Error("Google Translate is temporarily unavailable.");
    output.push(translated);
  }
  return output.join("");
}
