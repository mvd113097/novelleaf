import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LockKeyhole, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSiteAccess, unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  loader: async () => { if ((await getSiteAccess()).unlocked) throw redirect({ to: "/" }); },
  head: () => ({ meta: [
    { title: "Unlock — Inkleaf" },
    { name: "description", content: "Password access to Inkleaf." },
    { property: "og:title", content: "Unlock — Inkleaf" },
    { property: "og:description", content: "Password access to Inkleaf." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: Unlock,
});

function Unlock() {
  const unlock = useServerFn(unlockSite);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-6 py-12">
    <LockKeyhole className="mb-5 h-8 w-8 text-primary" />
    <h1 className="font-display text-4xl font-bold text-primary">Inkleaf</h1>
    <form method="post" className="mt-8 space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setError(""); setBusy(true);
      const form = event.currentTarget;
      const password = new FormData(form).get("password");
      if (typeof password !== "string") { setBusy(false); return; }
      try {
        const result = await unlock({ data: { password } });
        if (result.ok) { form.reset(); window.location.replace("/"); }
        else { setError("Incorrect password."); setBusy(false); }
      } catch { setError("Could not unlock the site. Please try again."); setBusy(false); }
    }}>
      <div className="space-y-2"><Label htmlFor="site-password">Password</Label><Input id="site-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy} aria-describedby={error ? "password-error" : undefined} /></div>
      {error && <p id="password-error" role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <ArrowRight />} {busy ? "Unlocking…" : "Unlock"}</Button>
    </form>
  </main>;
}