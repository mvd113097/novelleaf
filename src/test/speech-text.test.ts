import { describe, expect, it } from "vitest";
import { browserTranslatedLang, speechLang, spokenText } from "@/lib/speech-text";

describe("read-aloud follows browser page translation", () => {
  it("speaks the on-screen English text instead of the saved Chinese", () => {
    const p = document.createElement("p");
    p.innerHTML = "<font><font>He walked into the office.</font></font>";
    expect(spokenText(p, "他走进了办公室。")).toBe("He walked into the office.");
  });
  it("detects Chrome's translated page and its target language", () => {
    const html = document.createElement("html");
    expect(browserTranslatedLang(html)).toBeNull();
    html.className = "translated-ltr";
    html.setAttribute("lang", "en");
    expect(browserTranslatedLang(html)).toBe("en");
  });
  it("uses an English voice for translated text and Chinese for untranslated text", () => {
    expect(speechLang("He walked in.", "en")).toBe("en");
    expect(speechLang("他走进了办公室。", "en")).toBe("zh");
  });
});
