import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { FastForward, Rewind, ChevronLeft, ChevronRight, Languages, List, Loader2, Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBook, getChapter, getTranslateSettings, saveBook, translateChapter, type Book, type Chapter } from "@/lib/novel";
import { useReaderPreferences } from "@/lib/reader-preferences";
import { getPrefetchIndexes } from "@/lib/translation-utils";
import { TranslateSettings, useTranslateSettings } from "@/components/TranslateSettings";
import { requireSiteAccess } from "@/lib/gate-loader";
import { LockSite } from "@/components/LockSite";
import { browserTranslatedLang, hasChinese, speechLang, spokenText } from "@/lib/speech-text";

export const Route = createFileRoute("/read/$id/$idx")({
  beforeLoad: requireSiteAccess,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Reading — Inkleaf" },
      { name: "description", content: "Read, translate and listen to a chapter." },
      { property: "og:title", content: "Reading — Inkleaf" },
      { property: "og:description", content: "Read, translate and listen to a chapter." },
    ],
  }),
  component: Reader,
});

function Reader() {
  const { id, idx } = Route.useParams();
  const i = Number(idx);
  const nav = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [ch, setCh] = useState<Chapter | null>(null);
  const [err, setErr] = useState("");
  const { prefs, update } = useReaderPreferences();
  const [translationSettings] = useTranslateSettings();
  const { showEn, fontSize, rate, voiceName } = prefs;
  const setShowEn = (showEn: boolean) => update({ showEn });
  const setFontSize = (fontSize: number) => update({ fontSize });
  const setRate = (rate: number) => update({ rate });
  const setVoiceName = (voiceName: string) => update({ voiceName });
  const [translating, setTranslating] = useState(false);
  // TTS
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState<"off" | "play" | "pause">("off");
  const [cur, setCur] = useState(-1);
  const autoNext = useRef(false);

  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices());
    load(); speechSynthesis.onvoiceschanged = load;
    return () => { speechSynthesis.cancel(); };
  }, []);

  useEffect(() => {
    let alive = true;
    setCh(null); setErr(""); setCur(-1);
    getBook(id).then(async (b) => {
      if (!alive) return;
      if (!b) { setErr("This book is not saved in this browser. Return to your library to add it."); return; }
      setBook(b); b.lastRead = i; await saveBook(b);
      try {
        let c = await getChapter(b, i);
        if (!alive) return;
        setCh(c); window.scrollTo(0, 0);
        if (getTranslateSettings().auto) {
          if (!c.translated) {
            setTranslating(true);
            try { c = await translateChapter(b, i, c); if (alive) setCh(c); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Translation failed"); }
            finally { setTranslating(false); }
          }
          if (alive && c.translated) setShowEn(true);
        } else if (alive) setShowEn(false); // Auto-translate off: show the original so the browser's translator can be used.
      }
      catch (e) { if (alive) setErr(e instanceof Error ? e.message : "Could not load chapter (offline?)"); }
    }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "Could not read saved book"); });
    return () => { alive = false; };
  }, [id, i]);

  useEffect(() => {
    if (!book || !ch || !translationSettings?.prefetch) return;
    const selected = { ...translationSettings };
    const upcoming = getPrefetchIndexes(i, book.chapters.length, selected.prefetch);
    if (!upcoming.length) return;
    let active = true;
    const pretranslate = async () => {
      for (const nextIndex of upcoming) {
        if (!active) return;
        try {
          const nextChapter = await getChapter(book, nextIndex);
          if (!active) return;
          if (!nextChapter.translated?.length) await translateChapter(book, nextIndex, nextChapter, selected);
        } catch (error) {
          if (active) toast.error(error instanceof Error ? error.message : "Pre-translation failed");
          return;
        }
      }
    };
    void pretranslate();
    return () => { active = false; };
  }, [book, ch, i, translationSettings?.prefetch, translationSettings?.engine, translationSettings?.model, translationSettings?.apiKey]);

  const paras = ch ? (showEn && ch.translated ? ch.translated : ch.paragraphs) : [];
  // Detect the browser's own "Translate this page" so read-aloud follows what is on screen.
  const [browserLang, setBrowserLang] = useState<string | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const check = () => setBrowserLang(browserTranslatedLang(root));
    check();
    const obs = new MutationObserver(check);
    obs.observe(root, { attributes: true, attributeFilter: ["class", "lang"] });
    return () => obs.disconnect();
  }, []);
  const lang = showEn && ch?.translated ? "en" : browserLang ?? "zh";
  const speakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-continue TTS on next chapter
  useEffect(() => { if (ch && autoNext.current) { autoNext.current = false; speakFrom(0); } }, [ch]); // eslint-disable-line

  const pickVoice = (want: string) => {
    const v = voices.find((x) => x.name === voiceName);
    if (v && v.lang.toLowerCase().startsWith(want)) return v;
    const pool = voices.filter((x) => x.lang.toLowerCase().startsWith(want));
    return pool.find((x) => /google/i.test(x.name)) ?? pool[0];
  };

  const speakFrom = (start: number, attempt = 0) => {
    speechSynthesis.cancel();
    if (speakTimer.current) { clearTimeout(speakTimer.current); speakTimer.current = null; }
    if (start >= paras.length) {
      if (book && i + 1 < book.chapters.length) { autoNext.current = true; nav({ to: "/read/$id/$idx", params: { id, idx: String(i + 1) } }); }
      else setSpeaking("off");
      return;
    }
    const text = spokenText(document.getElementById(`p-${start}`), paras[start] ?? "");
    // The browser translates new text a moment after it appears; wait briefly instead of reading Chinese.
    if (browserLang && browserLang !== "zh" && hasChinese(text) && attempt < 10) {
      setCur(start); setSpeaking("play");
      speakTimer.current = setTimeout(() => speakFrom(start, attempt + 1), 300);
      return;
    }
    const want = speechLang(text, browserLang);
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(want);
    if (v) u.voice = v;
    u.lang = v?.lang ?? (want === "zh" ? "zh-CN" : want === "en" ? "en-US" : want);
    u.rate = rate;
    u.onstart = () => { setCur(start); document.getElementById(`p-${start}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); };
    u.onend = () => speakFrom(start + 1);
    setCur(start);
    speechSynthesis.speak(u);
    setSpeaking("play");
  };
  const toggle = () => {
    if (speaking === "play") { speechSynthesis.pause(); setSpeaking("pause"); }
    else if (speaking === "pause") { speechSynthesis.resume(); setSpeaking("play"); }
    else speakFrom(Math.max(cur, 0));
  };
  const stop = () => { if (speakTimer.current) { clearTimeout(speakTimer.current); speakTimer.current = null; } speechSynthesis.cancel(); setSpeaking("off"); setCur(-1); };

  const translate = async () => {
    if (!book || !ch) return;
    if (ch.translated) { stop(); setShowEn(!showEn); return; }
    setTranslating(true);
    try { setCh(await translateChapter(book, i, ch)); stop(); setShowEn(true); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Translation failed"); }
    finally { setTranslating(false); }
  };

  const go = (n: number) => { stop(); nav({ to: "/read/$id/$idx", params: { id, idx: String(n) } }); };
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));

  return (
    <div className="min-h-screen pb-44">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <Button asChild variant="ghost" size="icon"><Link to="/book/$id" params={{ id }} aria-label="Contents"><List /></Link></Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{book?.chapters[i]?.title}</div>
        <TranslateSettings />
        <LockSite />
        <Button variant={showEn ? "default" : "outline"} size="sm" onClick={translate} disabled={!ch || translating}>
          {translating ? <Loader2 className="animate-spin" /> : <Languages />} <span>{ch?.translated ? (showEn ? "中文" : "English") : "Translate"}</span>
        </Button>
      </header>
      <article lang={showEn && ch?.translated ? "en" : "zh-CN"} className="font-reading mx-auto max-w-2xl px-5 py-6 leading-loose" style={{ fontSize }}>
        {translating && <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Translating to English…</div>}
        {!ch && !err && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" /> Loading chapter…</div>}
        {err && <p className="text-destructive">{err}</p>}
        {ch && <h1 className="mb-6 font-display text-2xl font-bold">{ch.title}</h1>}
        {paras.map((p, k) => (
          <p key={k} id={`p-${k}`} onClick={() => speakFrom(k)} className={`mb-4 cursor-pointer rounded px-1 transition-colors ${k === cur ? "bg-accent" : ""}`}>{p}</p>
        ))}
        {ch && paras.length === 0 && <p className="text-muted-foreground">No text found on this page.</p>}
        <div className="mt-10 flex justify-between">
          <Button variant="outline" disabled={i <= 0} onClick={() => go(i - 1)}><ChevronLeft /> Previous</Button>
          <Button variant="outline" disabled={!book || i + 1 >= book.chapters.length} onClick={() => go(i + 1)}>Next <ChevronRight /></Button>
        </div>
      </article>

      {speaking !== "off" ? (
      <footer className="fixed inset-x-0 bottom-0 z-20 bg-player text-player-foreground pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-md grid-cols-4 place-items-center py-4">
          <Button variant="ghost" size="icon" aria-label="Previous paragraph" onClick={() => speakFrom(Math.max(cur - 1, 0))} className="h-14 w-14 hover:bg-player-foreground/10 hover:text-player-foreground"><Rewind className="h-7 w-7" fill="currentColor" /></Button>
          <Button variant="ghost" size="icon" aria-label="Stop" onClick={stop} className="h-14 w-14 hover:bg-player-foreground/10 hover:text-player-foreground"><Square className="h-6 w-6" fill="currentColor" /></Button>
          <Button variant="ghost" size="icon" aria-label={speaking === "play" ? "Pause" : "Play"} onClick={toggle} className="h-14 w-14 hover:bg-player-foreground/10 hover:text-player-foreground">{speaking === "play" ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="h-7 w-7" fill="currentColor" />}</Button>
          <Button variant="ghost" size="icon" aria-label="Next paragraph" onClick={() => speakFrom(cur + 1)} className="h-14 w-14 hover:bg-player-foreground/10 hover:text-player-foreground"><FastForward className="h-7 w-7" fill="currentColor" /></Button>
        </div>
      </footer>
      ) : (
      <footer className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Button size="icon" onClick={toggle} disabled={!paras.length} aria-label="Play"><Play /></Button>
            <Button size="icon" variant="outline" onClick={stop} disabled aria-label="Stop"><Square /></Button>
            <Select value={voiceName || "auto"} onValueChange={(v) => { setVoiceName(v === "auto" ? "" : v); }}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Voice" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (device Google voice)</SelectItem>
                {(langVoices.length ? langVoices : voices).map((v) => <SelectItem key={v.name} value={v.name}>{v.name} ({v.lang})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <label>Speed {rate.toFixed(1)}×<Slider min={0.5} max={2.5} step={0.1} value={[rate]} onValueChange={(v) => setRate(v[0] ?? 1)} /></label>
            <label>Text size {fontSize}px<Slider min={14} max={30} step={1} value={[fontSize]} onValueChange={(v) => setFontSize(v[0] ?? 19)} /></label>
          </div>
        </div>
      </footer>
      )}
    </div>
  );
}
