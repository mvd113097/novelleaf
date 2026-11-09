import { createServerFn } from "@tanstack/react-start";
import { googleTranslate } from "./google-translate";
import { requireUnlocked } from "./gate.server";

export const ALLOWED_HOSTS = ["52shuku.net", "52shuku.vip", "dmxs.org", "fuxsw.com", "fuxsb.com", "fuxb.com", "fuxb.net", "fuxb.org", "fuxb.cc"];

function hostAllowed(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return ALLOWED_HOSTS.some((a) => h === a || h.endsWith("." + a)) || /(^|\.)fuxb/.test(h);
  } catch {
    return false;
  }
}

// Fetches raw page bytes; the browser decodes them (handles GBK sites) and parses.
export const fetchPage = createServerFn({ method: "POST" })
  .inputValidator((input: { url: string }) => {
    if (!input?.url || !/^https?:\/\//.test(input.url)) throw new Error("Invalid URL");
    return input;
  })
  .handler(async ({ data }) => {
    await requireUnlocked(process.env["SESSION_SECRET"]);
    if (!hostAllowed(data.url)) throw new Error("Only 52shuku, dmxs and fuxsb links are supported.");
    const res = await fetch(data.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        Accept: "text/html,*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Site responded ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), contentType: res.headers.get("content-type") ?? "", finalUrl: res.url || data.url };
  });

const SYSTEM =
  "You are a literary translator of Chinese web novels. Translate the user's Chinese text into fluent, natural English. Keep paragraph breaks (one blank line between paragraphs). Keep names consistent in pinyin. Output only the translation.";
const SYSTEM_PAGES =
  SYSTEM +
  " The text contains several pages. Each page starts with a marker line such as [[PAGE 1]]. Copy every marker line exactly, on its own line, before that page's translation. Translate every page completely; never merge, skip, reorder or add pages.";

export const GEMINI_MODELS = ["google/gemini-3.1-flash-lite", "google/gemini-3.8-flash", "google/gemini-3.7-flash"];

/**
 * Gemini outcomes are returned (not thrown) so the browser can rotate keys and models:
 * `status` 429 = this key/model is rate limited, `blocked` = safety filter, `truncated` = output cut off.
 */
export type TranslateResult = { text: string; status?: number; error?: string; blocked?: boolean; truncated?: boolean };
const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY", "OTHER"]);

export const translateText = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string; engine?: "google" | "gemini"; model?: string; apiKey?: string; pages?: boolean }) => {
    if (typeof input?.text !== "string" || input.text.length > 20000) throw new Error("Invalid text");
    if (input.apiKey !== undefined && (typeof input.apiKey !== "string" || input.apiKey.length > 200)) throw new Error("Invalid API key");
    return input;
  })
  .handler(async ({ data }): Promise<TranslateResult> => {
    await requireUnlocked(process.env["SESSION_SECRET"]);
    if (data.engine === "google") {
      return { text: await googleTranslate(data.text) };
    }
    const model = GEMINI_MODELS.find((m) => m === data.model) ?? "google/gemini-3.1-flash-lite";
    const system = data.pages ? SYSTEM_PAGES : SYSTEM;
    // Personal Gemini API key: call Google AI Studio directly (uses your own free quota).
    if (data.apiKey) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.replace("google/", "")}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": data.apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: data.text }] }] }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) return { text: "", status: 401, error: "A Gemini API key is not valid." };
        return { text: "", status: res.status, error: `Gemini API error (${res.status}): ${body.slice(0, 200)}` };
      }
      const json = (await res.json()) as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] };
      const cand = json.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (json.promptFeedback?.blockReason || (cand?.finishReason && BLOCKED.has(cand.finishReason) && !text.trim())) return { text: "", blocked: true };
      return { text, truncated: cand?.finishReason === "MAX_TOKENS" };
    }
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { text: "", status: 500, error: "Translation is not configured." };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: data.text }] }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) return { text: "", status: 429, error: "Too many translation requests, please wait a moment." };
      if (res.status === 402) return { text: "", status: 402, error: "AI credits are used up. Add your own Gemini key or switch to Google Translate in settings." };
      return { text: "", status: res.status, error: `Translation failed (${res.status}): ${body.slice(0, 200)}` };
    }
    const json = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
    const choice = json.choices?.[0];
    const text = choice?.message?.content ?? "";
    if (choice?.finish_reason === "content_filter" && !text.trim()) return { text: "", blocked: true };
    return { text, truncated: choice?.finish_reason === "length" };
  });
