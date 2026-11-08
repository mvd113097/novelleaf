import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ReaderPreferences = { fontSize: number; rate: number; voiceName: string; showEn: boolean; theme: "light" | "dark" | "system" };
export const defaultReaderPreferences: ReaderPreferences = { fontSize: 19, rate: 1, voiceName: "", showEn: false, theme: "light" };
export function readReaderPreferences(): ReaderPreferences {
  try {
    const p = JSON.parse(localStorage.getItem("reader-prefs") ?? "{}");
    return {
      fontSize: typeof p.fontSize === "number" ? Math.max(14, Math.min(30, p.fontSize)) : 19,
      rate: typeof p.rate === "number" ? Math.max(0.5, Math.min(2.5, p.rate)) : 1,
      voiceName: typeof p.voiceName === "string" ? p.voiceName : "",
      showEn: p.showEn === true,
      theme: ["light", "dark", "system"].includes(p.theme) ? p.theme : "light",
    };
  } catch { return { ...defaultReaderPreferences }; }
}
export function writeReaderPreferences(p: ReaderPreferences) { localStorage.setItem("reader-prefs", JSON.stringify(p)); }
const PreferencesContext = createContext({ prefs: defaultReaderPreferences, update: (_patch: Partial<ReaderPreferences>) => {} });
export function ReaderPreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState(defaultReaderPreferences);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setPrefs(readReaderPreferences()); setLoaded(true);
    const sync = (e: StorageEvent) => { if (e.key === "reader-prefs") setPrefs(readReaderPreferences()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", prefs.theme === "dark" || (prefs.theme === "system" && media.matches));
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs.theme, loaded]);
  const update = (patch: Partial<ReaderPreferences>) => {
    const next = { ...readReaderPreferences(), ...patch };
    writeReaderPreferences(next); setPrefs(next);
  };
  return <PreferencesContext.Provider value={{ prefs, update }}>{children}</PreferencesContext.Provider>;
}
export const useReaderPreferences = () => useContext(PreferencesContext);