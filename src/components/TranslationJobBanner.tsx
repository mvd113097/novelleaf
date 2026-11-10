import { useSyncExternalStore } from "react";
import { Check, LoaderCircle, Sparkles, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cancelTranslationJob, dismissTranslationJob, getTranslationJobSnapshot, isTranslationJobRunning, subscribeTranslationJob } from "@/lib/translation-jobs";

export function TranslationJobBanner() {
  const job = useSyncExternalStore(subscribeTranslationJob, getTranslationJobSnapshot, getTranslationJobSnapshot);
  if (!job) return null;

  const active = isTranslationJobRunning();
  const percentage = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const status = job.stage === "downloading" ? "Saving chapters" : job.stage === "translating" ? "Translating" : job.stage === "cancelling" ? "Stopping after the current request" : job.stage === "complete" ? "Translation complete" : job.stage === "cancelled" ? "Translation stopped" : "Translation paused after an error";

  return (
    <aside className="border-b bg-card px-4 py-2" aria-live="polite" aria-label="Background translation status">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        {active ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : job.stage === "complete" ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 truncate font-medium">{status} · {job.bookTitle}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{job.done}/{job.total} · {job.engine}</span>
          </div>
          {job.stage === "error" ? <p className="mt-1 text-xs text-destructive">{job.error}</p> : <Progress className="mt-1 h-1" value={percentage} />}
        </div>
        {active ? <Button variant="ghost" size="icon" className="shrink-0" aria-label="Stop translation" title="Stop translation" onClick={cancelTranslationJob}><Square className="h-4 w-4" /></Button> : <Button variant="ghost" size="icon" className="shrink-0" aria-label="Dismiss translation status" title="Dismiss" onClick={dismissTranslationJob}><X className="h-4 w-4" /></Button>}
      </div>
    </aside>
  );
}