import { describe, expect, it } from "bun:test";
import { createGenerationGuard } from "./generation-guard.ts";

describe("createGenerationGuard", () => {
  it("a single run is the latest", () => {
    const guard = createGenerationGuard();
    const isLatest = guard.begin();
    expect(isLatest()).toBe(true);
  });

  it("a newer run supersedes an older in-flight one (stale resolution discarded)", () => {
    const guard = createGenerationGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("every earlier run stays superseded across many begins", () => {
    const guard = createGenerationGuard();
    const checks = [guard.begin(), guard.begin(), guard.begin()];
    expect(checks.map((isLatest) => isLatest())).toEqual([false, false, true]);
  });

  it("independent guards do not interfere", () => {
    const a = createGenerationGuard();
    const b = createGenerationGuard();
    const aRun = a.begin();
    b.begin();
    b.begin();
    expect(aRun()).toBe(true);
  });

  it("out-of-order async resolutions: only the latest writes", async () => {
    const guard = createGenerationGuard();
    const writes: string[] = [];
    const load = (value: string, delayMs: number): Promise<void> => {
      const isLatest = guard.begin();
      return new Promise((resolve) => {
        setTimeout(() => {
          if (isLatest()) writes.push(value);
          resolve();
        }, delayMs);
      });
    };
    // The FIRST load resolves LAST — it must not clobber the newer result.
    await Promise.all([load("stale", 20), load("fresh", 1)]);
    expect(writes).toEqual(["fresh"]);
  });
});
