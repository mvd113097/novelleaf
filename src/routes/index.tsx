import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importBook, listBooks, type Book } from "@/lib/novel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inkleaf — Web Novel Reader" },
      { name: "description", content: "Paste a 52shuku, dmxs or fuxb link to read, translate, listen and export web novels." },
      { property: "og:title", content: "Inkleaf — Web Novel Reader" },
      { property: "og:description", content: "Read Chinese web novels offline, translate to English, listen with TTS, export EPUB/TXT." },
    ],
  }),
  component: Library,
});

function Library() {
  const [books, setBooks] = useState<Book[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  useEffect(() => { listBooks().then(setBooks); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const b = await importBook(url.trim());
      toast.success(`Added “${b.title}” · ${b.chapters.length} chapters`);
      nav({ to: "/book/$id", params: { id: b.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load that link");
    } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-4xl font-bold text-primary">Inkleaf</h1>
      <p className="mt-1 text-muted-foreground">Paste a novel page link from 52shuku, dmxs or fuxb.</p>
      <form onSubmit={add} className="mt-6 flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.52shuku.net/..." type="url" required />
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Add</Button>
      </form>
      <h2 className="mt-10 font-display text-xl font-semibold">Library</h2>
      {books.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No books yet.</p>}
      <ul className="mt-3 space-y-3">
        {books.map((b) => (
          <li key={b.id}>
            <Link to="/book/$id" params={{ id: b.id }} className="flex gap-3 rounded-lg border bg-card p-3 transition hover:bg-accent">
              {b.cover ? <img src={b.cover} alt="" className="h-20 w-14 rounded object-cover" /> : <div className="flex h-20 w-14 items-center justify-center rounded bg-secondary"><BookOpen className="text-muted-foreground" /></div>}
              <div className="min-w-0">
                <div className="truncate font-display font-semibold">{b.title}</div>
                <div className="text-xs text-muted-foreground">{b.chapters.length} chapters{b.lastRead !== undefined ? ` · last read ch. ${b.lastRead + 1}` : ""}</div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{b.summary}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
