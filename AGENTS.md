<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Keep browser reading preferences in the root-mounted preferences provider; hydrate before applying them and write only explicit changes to prevent startup overwrites.
- Keep books, chapters and translation checkpoints behind the storage helper with IndexedDB primary storage and best-effort localStorage recovery copies; browser storage remains origin-specific.
- Serialize chapter translation in the browser and capture settings once per bulk job so engine changes cannot alter an active job.
- Isolate Google translation endpoint fallback and bounded backoff in one shared helper; call it from the browser first (reader's own IP avoids shared-server throttling) and fall back to the server function; retry only transient failures and preserve completed chunks.
- Verify shared site access with a server-only password comparison and encrypted HttpOnly session; guard every content route and every import/translation handler, without deleting local reader data on lock.
- Keep source-specific chapter footer cleanup in a shared browser-safe helper, applying it on fetch, cache reads and translation; preserve existing offline content rather than invalidating caches.
- Download raw chapter pages through the shared bounded worker pool (ordered results, per-page retries, partial failures reported); never parallelize translation.
