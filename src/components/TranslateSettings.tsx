import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReaderPreferences } from "@/lib/reader-preferences";
import { getTranslateSettings, saveTranslateSettings, TRANSLATE_SETTINGS_EVENT, type TranslateSettings as S } from "@/lib/novel";

const MODELS = [
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (most requests)" },
  { id: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash (best quality)" },
];

/** Shared translation settings, kept in sync across every switch and menu on the page. */
export function useTranslateSettings(onChange?: (s: S) => void) {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    const load = () => setS(getTranslateSettings());
    load();
    window.addEventListener(TRANSLATE_SETTINGS_EVENT, load);
    return () => window.removeEventListener(TRANSLATE_SETTINGS_EVENT, load);
  }, []);
  const update = (p: Partial<S>) => { const n = { ...getTranslateSettings(), ...p }; setS(n); saveTranslateSettings(n); onChange?.(n); };
  return [s, update] as const;
}

export function AutoTranslateSwitch({ className = "" }: { className?: string }) {
  const [s, update] = useTranslateSettings();
  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <Switch checked={s?.auto ?? true} disabled={!s} onCheckedChange={(auto) => update({ auto })} aria-label="Auto-translate chapters" />
      <span>Auto-translate {s && !s.auto && <span className="text-muted-foreground">(off · use your browser's translator)</span>}</span>
    </label>
  );
}

export function TranslateSettings({ onChange }: { onChange?: (s: S) => void }) {
  const { prefs, update: updatePrefs } = useReaderPreferences();
  const [s, update] = useTranslateSettings(onChange);
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Translation settings"><Settings2 /></Button></PopoverTrigger>
      <PopoverContent className="w-80 space-y-4">
        <div className="space-y-1">
          <Label>Theme</Label>
          <Select value={prefs.theme} onValueChange={(theme) => { if (theme === "light" || theme === "dark" || theme === "system") updatePrefs({ theme }); }}>
            <SelectTrigger aria-label="Theme"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="system">Device theme</SelectItem></SelectContent>
          </Select>
        </div>
        {s && (<>
          <div className="space-y-1">
            <label className="flex items-center justify-between text-sm font-medium">Auto-translate chapters <Switch checked={s.auto} onCheckedChange={(auto) => update({ auto })} /></label>
            <p className="text-xs text-muted-foreground">Turn off to open chapters in Chinese and use your browser's own translator.</p>
          </div>
          <div className="space-y-1">
            <Label>Translator</Label>
            <Select value={s.engine} onValueChange={(v) => update({ engine: v as S["engine"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google Translate (free)</SelectItem>
                <SelectItem value="gemini">Gemini AI (better quality)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {s.engine === "gemini" && (<>
            <div className="space-y-1">
              <Label>Gemini model</Label>
              <Select value={s.model} onValueChange={(model) => update({ model })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Your Gemini API key (optional)</Label>
              <Input type="password" value={s.apiKey} placeholder="AIza… from Google AI Studio" onChange={(e) => update({ apiKey: e.target.value.trim() })} />
              <p className="text-xs text-muted-foreground">With your own free key, translations use your Google quota. Without it, built-in AI credits are used.</p>
            </div>
          </>)}
        </>)}
      </PopoverContent>
    </Popover>
  );
}
