import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTranslateSettings, saveTranslateSettings, type TranslateSettings as S } from "@/lib/novel";

const MODELS = [
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (most requests)" },
  { id: "google/gemini-3.7-flash", label: "Gemini 3.7 Flash" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash (best quality)" },
];

export function TranslateSettings({ onChange }: { onChange?: (s: S) => void }) {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => setS(getTranslateSettings()), []);
  const update = (p: Partial<S>) => { if (!s) return; const n = { ...s, ...p }; setS(n); saveTranslateSettings(n); onChange?.(n); };
  return (
    <Popover>
      <PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label="Translation settings"><Settings2 /></Button></PopoverTrigger>
      <PopoverContent className="w-80 space-y-4">
        {s && (<>
          <label className="flex items-center justify-between text-sm font-medium">Auto-translate chapters <Switch checked={s.auto} onCheckedChange={(auto) => update({ auto })} /></label>
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
