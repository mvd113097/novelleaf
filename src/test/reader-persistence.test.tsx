import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderPreferencesProvider, useReaderPreferences, readReaderPreferences } from "@/lib/reader-preferences";
import { readSaved, writeSaved, savedKeys, removeSaved } from "@/lib/storage";

const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({ get: vi.fn(async (key: string) => db.get(key)), set: vi.fn(async (key: string, value: unknown) => { db.set(key, value); }), keys: vi.fn(async () => [...db.keys()]), del: vi.fn(async (key: string) => { db.delete(key); }) }));
beforeEach(() => { localStorage.clear(); db.clear(); });
describe("Saved reader data", () => {
  it("recovers novels, chapter lists and cached content if IndexedDB loses a record", async () => {
    const book = { id: "saved", title: "Novel", chapters: [{ title: "One", url: "https://52shuku.net/1.html" }] };
    const chapter = { paragraphs: ["原文"], translated: ["Original text"] };
    await writeSaved("book:saved", book); await writeSaved("ch:saved:0", chapter);
    db.clear();
    expect(await savedKeys()).toContain("book:saved");
    expect(await readSaved("book:saved")).toEqual(book);
    expect(await readSaved("ch:saved:0")).toEqual(chapter);
    expect(db.get("book:saved")).toEqual(book);
  });
  it("removes both storage copies on explicit deletion", async () => {
    await writeSaved("book:saved", { id: "saved" }); await removeSaved("book:saved");
    expect(await readSaved("book:saved")).toBeUndefined();
  });
  it("restores global size, speed, voice and theme without overwriting them on mount", async () => {
    const prefs = { fontSize: 26, rate: 1.7, voiceName: "Google English", showEn: true, theme: "dark" };
    localStorage.setItem("reader-prefs", JSON.stringify(prefs));
    function Probe() { const { prefs: p } = useReaderPreferences(); return <output>{JSON.stringify(p)}</output>; }
    const first = render(<ReaderPreferencesProvider><Probe /></ReaderPreferencesProvider>);
    await waitFor(() => expect(JSON.parse(screen.getByRole("status").textContent ?? "{}")).toEqual(prefs));
    expect(readReaderPreferences()).toEqual(prefs);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    act(() => first.unmount());
    render(<ReaderPreferencesProvider><Probe /></ReaderPreferencesProvider>);
    await waitFor(() => expect(JSON.parse(screen.getByRole("status").textContent ?? "{}")).toEqual(prefs));
  });
  it("falls back safely for corrupted preferences", () => {
    localStorage.setItem("reader-prefs", "bad json"); expect(readReaderPreferences().fontSize).toBe(19);
  });
  it("keeps smaller reader text across preference reloads", () => {
    localStorage.setItem("reader-prefs", JSON.stringify({ fontSize: 8 }));
    expect(readReaderPreferences().fontSize).toBe(8);
    localStorage.setItem("reader-prefs", JSON.stringify({ fontSize: 10 }));
    expect(readReaderPreferences().fontSize).toBe(10);
  });
});