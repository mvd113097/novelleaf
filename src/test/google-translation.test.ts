import { describe, expect, it, vi } from "vitest";
import { googleTranslate } from "@/lib/google-translate.server";
import { splitTranslationText, translationEngineLabel } from "@/lib/translation-utils";

describe("Google translation recovery", () => {
  it("chunks even one long paragraph without losing characters", () => {
    const text = "中文😀".repeat(1200);
    const chunks = splitTranslationText(text);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.join("")).toBe(text);
  });
  it("backs off from 429 then uses Google's fallback endpoint", async () => {
    const wait = vi.fn(async (_ms: number) => {});
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Retry-After": "2" } })).mockResolvedValueOnce(Response.json([[["Hello", "你好"]]]));
    expect(await googleTranslate("你好", wait, request)).toBe("Hello");
    expect(wait).toHaveBeenCalledWith(2000);
    expect(String(request.mock.calls[1]?.[0])).toContain("translate.google.com");
  });
  it("uses exponential backoff and stops after three throttled endpoints", async () => {
    const wait = vi.fn(async (_ms: number) => {});
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response("busy", { status: 429 }));
    await expect(googleTranslate("你好", wait, request)).rejects.toThrow("temporarily busy");
    expect(wait.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("does not retry a terminal error", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(googleTranslate("你好", async () => {}, request)).rejects.toThrow("403");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("identifies the selected engine for bulk translation", () => {
    expect(translationEngineLabel({ engine: "google", model: "google/gemini-3.1-flash-lite" })).toBe("Google Translate");
    expect(translationEngineLabel({ engine: "gemini", model: "google/gemini-3.1-flash-lite" })).toBe("Gemini · gemini-3.1-flash-lite");
  });
});