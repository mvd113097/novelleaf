import { beforeEach, describe, expect, it } from "vitest";
import { getPrefetchIndexes } from "@/lib/translation-utils";
import { getTranslateSettings, saveTranslateSettings } from "@/lib/novel";

describe("reader translation lookahead", () => {
  beforeEach(() => localStorage.clear());

  it("selects only the next page when one-page lookahead is enabled", () => {
    expect(getPrefetchIndexes(0, 5, 1)).toEqual([1]);
  });

  it("selects the next three pages, but never beyond the book", () => {
    expect(getPrefetchIndexes(0, 5, 3)).toEqual([1, 2, 3]);
    expect(getPrefetchIndexes(3, 5, 3)).toEqual([4]);
  });

  it("keeps lookahead off by default and persists the selected option", () => {
    const settings = getTranslateSettings();
    expect(settings.prefetch).toBe(0);
    saveTranslateSettings({ ...settings, prefetch: 3 });
    expect(getTranslateSettings().prefetch).toBe(3);
  });
});