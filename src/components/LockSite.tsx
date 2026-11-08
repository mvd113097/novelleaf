import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { lockSite } from "@/lib/gate.functions";

export function LockSite() {
  const lock = useServerFn(lockSite);
  const [busy, setBusy] = useState(false);
  return <Button variant="ghost" size="icon" aria-label="Lock site" title="Lock site" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await lock(); window.speechSynthesis?.cancel(); window.location.replace("/unlock"); }
    catch { toast.error("Could not lock the site. Try again."); setBusy(false); }
  }}>{busy ? <Loader2 className="animate-spin" /> : <Lock />}</Button>;
}