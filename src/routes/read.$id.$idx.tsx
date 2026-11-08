import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Languages, List, Loader2, Pause, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBook, getChapter, saveBook, translateChapter, type Book, type Chapter } from "@/lib/novel";

export const Route = createFileRoute("/read/$id/$idx")({
  head: () => ({
    meta: [
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
  const [showEn, setShowEn] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [fontSize, setFontSize] = useState(19);
  // TTS
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState<"off" | "play" | "pause">("off");
  const [cur, setCur] = useState(-1);
  const autoNext = useRef(false);

  useEffect(() => {
    const s = localStorage.getItem("reader-prefs");
    if (s) { const p = JSON.parse(s); setFontSize(p.fontSize ?? 19); setRate(p.rate ?? 1); setVoiceName(p.voiceName ?? ""); setShowEn(!!p.showEn); }
    const load = () => setVoices(speechSynthesis.getVoices());
    load(); speechSynthesis.onvoiceschanged = load;
    return () => { speechSynthesis.cancel(); };
  }, []);
  useEffect(() => { localStorage.setItem("reader-prefs", JSON.stringify({ fontSize, rate, voiceName, showEn })); }, [fontSize, rate, voiceName, showEn]);

  useEffect(() => {
    let alive = true;
    setCh(null); setErr(""); setCur(-1);
    getBook(id).then(async (b) => {
      if (!b || !alive) return;
      setBook(b); b.lastRead = i; saveBook(b);
      try { const c = await getChapter(b, i); if (alive) { setCh(c); window.scrollTo(0, 0); } }
      catch (e) { if (alive) setErr(e instanceof Error ? e.message : "Could not load chapter (offline?)"); }
    });
    return () => { alive = false; };
  }, [id, i]);

  const paras = ch ? (showEn && ch.translated ? ch.translated : ch.paragraphs) : [];
  const lang = showEn && ch?.translated ? "en" : "zh";

  // Auto-continue TTS on next chapter
  useEffect(() => { if (ch && autoNext.current) { autoNext.current = false; speakFrom(0); } }, [ch]); // eslint-disable-line

  const pickVoice = () => {
    const v = voices.find((x) => x.name === voiceName);
    if (v) return v;
    const pool = voices.filter((x) => x.lang.toLowerCase().startsWith(lang));
    return pool.find((x) => /google/i.test(x.name)) ?? pool[0];
  };

  const speakFrom = (start: number) => {
    speechSynthesis.cancel();
    if (start >= paras.length) {
      if (book && i + 1 < book.chapters.length) { autoNext.current = true; nav({ to: "/read/$id/$idx", params: { id, idx: String(i + 1) } }); }
      else setSpeaking("off");
      return;
    }
    const u = new SpeechSynthesisUtterance(paras[start]);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang ?? (lang === "en" ? "en-US" : "zh-CN");
    u.rate = rate;
    u.onstart = () => { setCur(start); document.getElementById(`p-${start}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); };
    u.onend = () => speakFrom(start + 1);
    speechSynthesis.speak(u);
    setSpeaking("play");
  };
  const toggle = () => {
    if (speaking === "play") { speechSynthesis.pause(); setSpeaking("pause"); }
    else if (speaking === "pause") { speechSynthesis.resume(); setSpeaking("play"); }
    else speakFrom(Math.max(cur, 0));
  };
  const stop = () => { speechSynthesis.cancel(); setSpeaking("off"); setCur(-1); };

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
        <Button variant={showEn ? "default" : "outline"} size="sm" onClick={translate} disabled={!ch || translating}>
          {translating ? <Loader2 className="animate-spin" /> : <Languages />} {ch?.translated ? (showEn ? "中文" : "English") : "Translate"}
        </Button>
      </header>
      <article className="font-reading mx-auto max-w-2xl px-5 py-6 leading-loose" style={{ fontSize }}>
        {!ch && !err && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" /> Loading chapter…</div>}
        {err && <p className="text-destructive">{err}</p>}
        {ch && <h1 className="mb-6 font-display text-2xl font-bold">{ch.title}</h1>}
        {paras.map((p, k) => (
          <p key={k} id={`p-${k}`} onDoubleClick={() => speakFrom(k)} className={`mb-4 rounded px-1 transition-colors ${k === cur ? "bg-accent" : ""}`}>{p}</p>
        ))}
        {ch && paras.length === 0 && <p className="text-muted-foreground">No text found on this page.</p>}
        <div className="mt-10 flex justify-between">
          <Button variant="outline" disabled={i <= 0} onClick={() => go(i - 1)}><ChevronLeft /> Previous</Button>
          <Button variant="outline" disabled={!book || i + 1 >= book.chapters.length} onClick={() => go(i + 1)}>Next <ChevronRight /></Button>
        </div>
      </article>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <Button size="icon" onClick={toggle} disabled={!paras.length} aria-label="Play or pause">{speaking === "play" ? <Pause /> : <Play />}</Button>
            <Button size="icon" variant="outline" onClick={stop} disabled={speaking === "off"} aria-label="Stop"><Square /></Button>
            <Select value={voiceName || "auto"} onValueChange={(v) => { setVoiceName(v === "auto" ? "" : v); }}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Voice" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (device Google voice)</SelectItem>
                {(langVoices.length ? langVoices : voices).map((v) => <SelectItem key={v.name} value={v.name}>{v.name} ({v.lang})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <label>Speed {rate.toFixed(1)}×<Slider min={0.5} max={2.5} step={0.1} value={[rate]} onValueChange={([v]) => setRate(v)} /></label>
            <label>Text size {fontSize}px<Slider min={14} max={30} step={1} value={[fontSize]} onValueChange={([v]) => setFontSize(v)} /></label>
          </div>
        </div>
      </footer>
    </div>
  );
}
