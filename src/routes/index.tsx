import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoTranslateSwitch, TranslateSettings } from "@/components/TranslateSettings";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bookTitle, deleteBook, ensureEnglishTitle, importBook, listBooks, renameBook, type Book } from "@/lib/novel";
import { requireSiteAccess } from "@/lib/gate-loader";
import { LockSite } from "@/components/LockSite";

export const Route = createFileRoute("/")({
  beforeLoad: requireSiteAccess,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Inkleaf — Web Novel Reader" },
      { name: "description", content: "Paste a 52shuku, dmxs or fuxsb link to read, translate, listen and export web novels." },
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
  const [editing, setEditing] = useState<Book | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Book | null>(null);
  const [removing, setRemoving] = useState(false);
  const remove = async () => {
    if (!deleting || removing) return;
    setRemoving(true);
    try {
      await deleteBook(deleting);
      setBooks((cur) => cur.filter((b) => b.id !== deleting.id));
      setDeleting(null);
      toast.success("Book deleted");
    } catch { toast.error("Could not delete this book. Please try again."); }
    finally { setRemoving(false); }
  };
  useEffect(() => {
    let alive = true;
    listBooks().then(async (list) => {
      if (!alive) return;
      setBooks(list);
      // Translate Chinese titles to English one at a time; failures keep the original title.
      for (const b of list) {
        if (b.titleEn || b.customTitle) continue;
        const updated = await ensureEnglishTitle(b);
        if (!alive) return;
        if (updated !== b) setBooks((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
      }
    }).catch(() => toast.error("Could not read your saved library."));
    return () => { alive = false; };
  }, []);
  const openRename = (b: Book) => { setEditing(b); setName(bookTitle(b)); };
  const saveName = async (value: string) => {
    if (!editing) return;
    const updated = await renameBook(editing, value);
    setBooks((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
    setEditing(null);
    toast.success("Title saved");
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const b = await importBook(url.trim());
      toast.success(`Added “${bookTitle(b)}” · ${b.chapters.length} chapters`);
      nav({ to: "/book/$id", params: { id: b.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load that link");
    } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between"><h1 className="font-display text-4xl font-bold text-primary">Inkleaf</h1><div className="flex"><TranslateSettings /><LockSite /></div></div>
      <p className="mt-1 text-muted-foreground">Paste a novel page link from 52shuku, dmxs or fuxsb.</p>
      <form onSubmit={add} className="mt-6 flex gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.52shuku.net/..." type="url" required />
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Add</Button>
      </form>
      <AutoTranslateSwitch className="mt-4" />
      <h2 className="mt-10 font-display text-xl font-semibold">Library</h2>
      {books.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No books yet.</p>}
      <ul className="mt-3 space-y-3">
        {books.map((b) => (
          <li key={b.id} className="relative">
            <Link to="/book/$id" params={{ id: b.id }} className="flex gap-3 rounded-lg border bg-card p-3 pr-12 transition hover:bg-accent">
              {b.cover ? <img src={b.cover} alt="" className="h-20 w-14 rounded object-cover" /> : <div className="flex h-20 w-14 items-center justify-center rounded bg-secondary"><BookOpen className="text-muted-foreground" /></div>}
              <div className="min-w-0">
                <div className="truncate font-display font-semibold">{bookTitle(b)}</div>
                <div className="text-xs text-muted-foreground">{b.chapters.length} chapters{b.lastRead !== undefined ? ` · last read ch. ${b.lastRead + 1}` : ""}</div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{b.summary}</p>
              </div>
            </Link>
            <Button variant="ghost" size="icon" className="absolute right-1 top-1" aria-label={`Rename ${bookTitle(b)}`} onClick={() => openRename(b)}><Pencil /></Button>
            <Button variant="ghost" size="icon" className="absolute right-1 bottom-1 text-destructive" aria-label={`Delete ${bookTitle(b)}`} title="Delete book" onClick={() => setDeleting(b)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename book</DialogTitle>
            <DialogDescription>{editing?.title}</DialogDescription>
          </DialogHeader>
          <form id="rename-book" onSubmit={(e) => { e.preventDefault(); void saveName(name); }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Book title" autoFocus />
          </form>
          <DialogFooter className="gap-2">
            {editing?.customTitle && <Button variant="ghost" onClick={() => void saveName("")}>Use automatic title</Button>}
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" form="rename-book">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open && !removing) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete book?</DialogTitle>
            <DialogDescription>Remove “{deleting ? bookTitle(deleting) : ""}” and its saved chapters and translations from this browser? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={removing} onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={removing} onClick={() => void remove()}>{removing ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
