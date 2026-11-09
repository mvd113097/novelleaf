/** Number of chapter pages downloaded at the same time (similar to Legado). */
export const DOWNLOAD_CONCURRENCY = 6;

export type PoolResult<R> = { results: (R | undefined)[]; failed: number[] };

/**
 * Runs `task` for every index with at most `limit` running at once.
 * Results keep chapter order; each failing index is retried with a short backoff
 * and reported in `failed` instead of stopping the other downloads.
 */
export async function runPool<R>(
  count: number,
  task: (index: number) => Promise<R>,
  { limit = DOWNLOAD_CONCURRENCY, retries = 2, retryDelayMs = 800, onProgress }: { limit?: number; retries?: number; retryDelayMs?: number; onProgress?: (done: number) => void } = {},
): Promise<PoolResult<R>> {
  const results: (R | undefined)[] = new Array(count);
  const failed: number[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < count) {
      const i = next++;
      for (let attempt = 0; ; attempt++) {
        try {
          results[i] = await task(i);
          break;
        } catch {
          if (attempt >= retries) { failed.push(i); break; }
          await new Promise<void>((r) => setTimeout(r, retryDelayMs * 2 ** attempt));
        }
      }
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, count)) }, worker));
  failed.sort((a, b) => a - b);
  return { results, failed };
}
