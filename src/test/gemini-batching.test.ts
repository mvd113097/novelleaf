import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBatchText, packPages, parseApiKeys, splitBatchOutput } from "@/lib/translation-utils";

const state = vi.hoisted(() => ({ saved: new Map<string, unknown>(), translateText: vi.fn(), google: vi.fn() }));

vi.mock("@/lib/storage", () => ({
  readSaved: vi.fn(async (key: string) => state.saved.get(key)),
  writeSaved: vi.fn(async (key: string, value: unknown) => { state.saved.set(key, value); }),
  removeSaved: vi.fn(async (key: string) => { state.saved.delete(key); }),
  savedKeys: vi.fn(async () => [...state.saved.keys()]),
  requestPersistentStorage: vi.fn(),
}));
vi.mock("@/lib/remote.functions", () => ({
  fetchPage: vi.fn(),
  translateText: state.translateText,
  GEMINI_MODELS: ["google/gemini-3.1-flash-lite", "google/gemini-3.8-flash", "google/gemini-3.7-flash"],
}));
vi.mock("@/lib/google-translate", () => ({ googleTranslate: state.google }));

import { resetGeminiCooldowns, translateChapters, type Book, type TranslateSettings } from "@/lib/novel";

const book: Book = { id: "b", url: "https://www.52shuku.net/x.html", title: "B", summary: "", addedAt: 1, chapters: [0, 1, 2].map((n) => ({ title: `第${n + 1}页`, url: `https://www.52shuku.net/x_${n}.html` })) };
const pages = [0, 1, 2].map((idx) => ({ idx, ch: { title: `第${idx + 1}页`, paragraphs: [`第${idx + 1}页的故事。`] } }));
const gemini = (apiKey = ""): TranslateSettings => ({ engine: "gemini", model: "google/gemini-3.1-flash-lite", apiKey, auto: true, prefetch: 3 });
const batchReply = (n: number) => ({ text: Array.from({ length: n }, (_, k) => `[[PAGE ${k + 1}]]\nStory of page ${k + 1}.`).join("\n\n") });

describe("Gemini quota saving", () => {
  beforeEach(() => { state.saved.clear(); state.translateText.mockReset(); state.google.mockReset(); resetGeminiCooldowns(); });

  it("reads several keys typed one per line or comma separated", () => {
    expect(parseApiKeys("AIzaA\nAIzaB, AIzaC  AIzaA")).toEqual(["AIzaA", "AIzaB", "AIzaC"]);
  });

  it("packs pages into requests of at most 8,000 characters", () => {
    const p = [3000, 3000, 3000, 9000].map((len) => ({ text: "字".repeat(len) }));
    expect(packPages(p).map((b) => b.length)).toEqual([2, 1, 1]);
  });

  it("splits a batched reply back into its pages, or rejects a reply with a missing page", () => {
    expect(buildBatchText(["甲", "乙"])).toBe("[[PAGE 1]]\n甲\n\n[[PAGE 2]]\n乙");
    expect(splitBatchOutput("[[PAGE 1]]\nOne\n\n**[[PAGE 2]]**\nTwo", 2)).toEqual(["One", "Two"]);
    expect(splitBatchOutput("[[PAGE 1]]\nOne and two", 2)).toBeNull();
  });

  it("translates three short pages with a single Gemini request", async () => {
    state.translateText.mockResolvedValueOnce(batchReply(3));
    const out = await translateChapters(book, pages, gemini("AIzaA"));
    expect(state.translateText).toHaveBeenCalledTimes(1);
    expect(state.translateText.mock.calls[0]?.[0].data.pages).toBe(true);
    expect([0, 1, 2].map((i) => out.get(i)?.translated)).toEqual([["Story of page 1."], ["Story of page 2."], ["Story of page 3."]]);
    expect((state.saved.get("ch:b:2:single-page-v2") as { translated: string[] }).translated).toEqual(["Story of page 3."]);
  });

  it("moves to the next key when one is rate limited", async () => {
    state.translateText.mockResolvedValueOnce({ text: "", status: 429, error: "limit" }).mockResolvedValueOnce(batchReply(3));
    await translateChapters(book, pages, gemini("AIzaA\nAIzaB"));
    expect(state.translateText.mock.calls.map((c) => c[0].data.apiKey)).toEqual(["AIzaA", "AIzaB"]);
  });

  it("moves to another Gemini model when every key for the chosen model is limited", async () => {
    state.translateText.mockResolvedValueOnce({ text: "", status: 429 }).mockResolvedValueOnce(batchReply(3));
    await translateChapters(book, pages, gemini("AIzaA"));
    expect(state.translateText.mock.calls.map((c) => c[0].data.model)).toEqual(["google/gemini-3.1-flash-lite", "google/gemini-3.8-flash"]);
  });

  it("uses Google Translate for a page Gemini's safety filter blocks", async () => {
    state.translateText.mockResolvedValue({ text: "", blocked: true });
    state.google.mockResolvedValue("Google text.");
    const out = await translateChapters(book, [pages[0]!], gemini("AIzaA"));
    expect(out.get(0)?.translated).toEqual(["Google text."]);
  });

  it("redoes a batch page by page when Gemini drops a page marker", async () => {
    state.translateText.mockResolvedValueOnce({ text: "[[PAGE 1]]\nOnly one." })
      .mockResolvedValueOnce({ text: "One." }).mockResolvedValueOnce({ text: "Two." }).mockResolvedValueOnce({ text: "Three." });
    const out = await translateChapters(book, pages, gemini("AIzaA"));
    expect(state.translateText).toHaveBeenCalledTimes(4);
    expect(out.get(1)?.translated).toEqual(["Two."]);
  });
});
