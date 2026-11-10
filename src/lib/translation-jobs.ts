import { bookTitle, getChapter, TranslationCancelledError, translateChapters, type Book, type Chapter, type TranslateSettings } from "./novel";
import { runPool } from "./download-pool";
import { translationEngineLabel } from "./translation-utils";

export type TranslationJobStage = "downloading" | "translating" | "cancelling" | "complete" | "cancelled" | "error";
export type TranslationJobSnapshot = {
  id: string;
  bookId: string;
  bookTitle: string;
  engine: string;
  engineKind: TranslateSettings["engine"];
  total: number;
  done: number;
  translatedIndexes: number[];
  stage: TranslationJobStage;
  error?: string;
};

type Listener = () => void;
let snapshot: TranslationJobSnapshot | null = null;
let running = false;
let cancelRequestedId: string | null = null;
const listeners = new Set<Listener>();

function publish(next: TranslationJobSnapshot | null) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeTranslationJob(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getTranslationJobSnapshot = () => snapshot;
export const isTranslationJobRunning = () => running;

function updateJob(id: string, changes: Partial<TranslationJobSnapshot>) {
  if (snapshot?.id === id) publish({ ...snapshot, ...changes });
}

/** Starts an app-wide browser job that keeps running while route content changes. */
export function startTranslationJob(book: Book, settings: TranslateSettings) {
  if (running) throw new Error("A translation job is already running. Let it finish before starting another.");

  running = true;
  const id = `${book.id}:${Date.now()}`;
  const total = book.chapters.length;
  const engine = translationEngineLabel(settings);
  cancelRequestedId = null;
  publish({ id, bookId: book.id, bookTitle: bookTitle(book), engine, engineKind: settings.engine, total, done: 0, translatedIndexes: [], stage: "downloading" });

  void (async () => {
    try {
      const { results, failed } = await runPool(total, (idx) => getChapter(book, idx), {
        onProgress: (done) => updateJob(id, { stage: "downloading", done }),
      });
      if (failed.length) {
        const list = failed.slice(0, 5).map((idx) => idx + 1).join(", ") + (failed.length > 5 ? "…" : "");
        throw new Error(`${failed.length} chapter${failed.length > 1 ? "s" : ""} could not be downloaded (ch. ${list}). The other ${total - failed.length} are saved — start again to retry.`);
      }

      if (cancelRequestedId === id) throw new TranslationCancelledError();
      updateJob(id, { stage: "translating", done: 0 });
      const chapters = results as Chapter[];
      await translateChapters(book, chapters.map((ch, idx) => ({ idx, ch })), settings, (done, idx) => {
        if (snapshot?.id === id) updateJob(id, { stage: cancelRequestedId === id ? "cancelling" : "translating", done, translatedIndexes: [...snapshot.translatedIndexes, idx] });
      }, () => cancelRequestedId !== id);
      updateJob(id, { stage: "complete", done: total });
    } catch (error) {
      if (error instanceof TranslationCancelledError) updateJob(id, { stage: "cancelled" });
      else updateJob(id, { stage: "error", error: error instanceof Error ? error.message : "Translation failed." });
    } finally {
      cancelRequestedId = null;
      if (snapshot?.id === id) running = false;
    }
  })();
}

export function cancelTranslationJob() {
  if (!running || !snapshot) return;
  cancelRequestedId = snapshot.id;
  updateJob(snapshot.id, { stage: "cancelling" });
}

export function dismissTranslationJob() {
  if (!running) publish(null);
}