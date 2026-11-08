import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, FileText, Languages, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { deleteBook, getBook, getChapter, importBook, isCached, translateChapter, type Book, type Chapter } from "@/lib/novel";
import { buildEpub, buildTxt, downloadBlob } from "@/lib/export";

export const Route = createFileRoute("/book/$id")({
  head: () => ({
    meta: [
      { title: "Book details — Inkleaf" },
      { name: "description", content: "Summary, table of contents, offline download and export." },
      { property: "og:title", content: "Book details — Inkleaf" },
      { property: "og:description", content: "Summary, table of contents, offline download and export." },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [book, setBook] = useState<Book | null>(null);
  const [cached, setCached] = useState<boolean[]>([]);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const [english, setEnglish] = useState(false);
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null);

  const refreshCache = async (b: Book) => setCached(await Promise.all(b.chapters.map((_, i) => isCached(b, i))));
  useEffect(() => { getBook(id).then((b) => { if (b) { setBook(b); refreshCache(b); } }); }, [id]);
  if (!book) return <main className="p-8 text-muted-foreground">Loading… <Link to="/" className="underline">Back</Link></main>;

  const fetchAll = async (translate: boolean) => {
    const chs: Chapter[] = [];
    try {
      for (let i = 0; i < book.chapters.length; i++) {
        setProgress({ label: translate ? "Downloading & translating" : "Downloading", done: i, total: book.chapters.length });
        let c = await getChapter(book, i);
        if (translate && !c.translated) c = await translateChapter(book, i, c);
        chs.push(c);
      }
      return chs;
    } finally { setProgress(null); refreshCache(book); }
  };

  const run = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); } };
  const exportAs = (kind: "epub" | "txt") => run(async () => {
    const chs = await fetchAll(english);
    setReady(kind === "epub" ? await buildEpub(book, chs, english) : buildTxt(book, chs, english));
  });
  const cachedCount = cached.filter(Boolean).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Library</Link>
      <div className="mt-4 flex gap-4">
        {book.cover && <img src={book.cover} alt="" className="h-36 w-24 rounded object-cover shadow" />}
        <div>
          <h1 className="font-display text-2xl font-bold">{book.title}</h1>
          {book.author && <p className="text-sm text-muted-foreground">{book.author}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{book.chapters.length} chapters · {cachedCount} saved offline</p>
          <Button className="mt-3" onClick={() => nav({ to: "/read/$id/$idx", params: { id, idx: String(book.lastRead ?? 0) } })}>
            {book.lastRead !== undefined ? `Continue ch. ${book.lastRead + 1}` : "Start reading"}
          </Button>
        </div>
      </div>
      <p className="font-reading mt-4 whitespace-pre-line text-sm leading-relaxed">{book.summary}</p>

      <section className="mt-6 space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!!progress} onClick={() => run(async () => { await fetchAll(false); toast.success("All chapters saved for offline reading"); })}><Download /> Save all offline</Button>
          <Button variant="secondary" size="sm" disabled={!!progress} onClick={() => run(async () => { await fetchAll(true); toast.success("All chapters translated"); })}><Languages /> Translate all</Button>
          <Button variant="secondary" size="sm" disabled={!!progress} onClick={() => run(async () => { const b = await importBook(book.url); b.lastRead = book.lastRead; setBook(b); refreshCache(b); toast.success("Contents refreshed"); })}><RefreshCw /> Refresh</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!!progress} onClick={() => exportAs("epub")}><FileText /> Export EPUB</Button>
          <Button size="sm" disabled={!!progress} onClick={() => exportAs("txt")}><FileText /> Export TXT</Button>
          <label className="ml-2 flex items-center gap-2 text-sm"><Switch checked={english} onCheckedChange={setEnglish} /> English translation</label>
        </div>
        {progress && (<div><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{progress.label} {progress.done}/{progress.total}</div><Progress value={(progress.done / progress.total) * 100} /></div>)}
        {ready && <Button variant="outline" onClick={() => { downloadBlob(ready.blob, ready.name); setReady(null); }}><Download /> Download {ready.name}</Button>}
      </section>

      <h2 className="mt-6 font-display text-lg font-semibold">Contents</h2>
      <ol className="mt-2 divide-y rounded-lg border bg-card">
        {book.chapters.map((c, i) => (
          <li key={c.url}>
            <Link to="/read/$id/$idx" params={{ id, idx: String(i) }} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-accent">
              <span className={book.lastRead === i ? "font-semibold text-primary" : ""}>{c.title}</span>
              {cached[i] && <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Saved offline" />}
            </Link>
          </li>
        ))}
      </ol>
      <Button variant="ghost" className="mt-6 text-destructive" onClick={async () => { if (confirm("Remove this book and its saved chapters?")) { await deleteBook(book); nav({ to: "/" }); } }}><Trash2 /> Remove book</Button>
    </main>
  );
}
