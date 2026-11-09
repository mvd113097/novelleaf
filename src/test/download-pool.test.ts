import { describe, expect, it } from "vitest";
import { DOWNLOAD_CONCURRENCY, runPool } from "@/lib/download-pool";

describe("parallel chapter downloads", () => {
  it("downloads 6 chapters at a time, never more", async () => {
    let running = 0;
    let peak = 0;
    await runPool(20, async (i) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return i;
    });
    expect(DOWNLOAD_CONCURRENCY).toBe(6);
    expect(peak).toBe(6);
  });

  it("keeps chapters in book order even when they finish out of order", async () => {
    const { results } = await runPool(8, async (i) => {
      await new Promise((r) => setTimeout(r, (8 - i) * 3));
      return `ch${i}`;
    });
    expect(results).toEqual(["ch0", "ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7"]);
  });

  it("retries a failing chapter and reports only the ones that still fail", async () => {
    const attempts = new Map<number, number>();
    const { results, failed } = await runPool(5, async (i) => {
      const n = (attempts.get(i) ?? 0) + 1;
      attempts.set(i, n);
      if (i === 1 && n < 2) throw new Error("temporary");
      if (i === 3) throw new Error("always");
      return i;
    }, { retryDelayMs: 1 });
    expect(failed).toEqual([3]);
    expect(results[1]).toBe(1);
    expect(attempts.get(3)).toBe(3);
  });
});
