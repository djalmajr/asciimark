import { describe, expect, it } from "bun:test";
import { createReconnectBreaker } from "./reconnect-breaker.ts";

describe("createReconnectBreaker", () => {
  it("backs off exponentially and opens after the attempt cap", () => {
    const breaker = createReconnectBreaker({ maxAttempts: 5, windowMs: 30_000 });
    const t = 1_000_000;
    expect(breaker.nextDelay("srv", t)).toBe(500);
    expect(breaker.nextDelay("srv", t + 1)).toBe(1000);
    expect(breaker.nextDelay("srv", t + 2)).toBe(2000);
    expect(breaker.nextDelay("srv", t + 3)).toBe(4000);
    expect(breaker.nextDelay("srv", t + 4)).toBe(8000);
    // 6th inside the window: breaker open.
    expect(breaker.nextDelay("srv", t + 5)).toBeNull();
  });

  it("the sliding window forgets old attempts", () => {
    const breaker = createReconnectBreaker({ maxAttempts: 2, windowMs: 1_000 });
    const t = 50_000;
    expect(breaker.nextDelay("srv", t)).toBe(500);
    expect(breaker.nextDelay("srv", t + 10)).toBe(1000);
    expect(breaker.nextDelay("srv", t + 20)).toBeNull();
    // Both attempts aged out of the window — half-open again.
    expect(breaker.nextDelay("srv", t + 2_000)).toBe(500);
  });

  it("reset closes the breaker for that id only", () => {
    const breaker = createReconnectBreaker({ maxAttempts: 1, windowMs: 60_000 });
    const t = 10_000;
    expect(breaker.nextDelay("a", t)).toBe(500);
    expect(breaker.nextDelay("b", t)).toBe(500);
    expect(breaker.nextDelay("a", t + 1)).toBeNull();
    breaker.reset("a");
    expect(breaker.nextDelay("a", t + 2)).toBe(500);
    // "b" history untouched.
    expect(breaker.nextDelay("b", t + 3)).toBeNull();
  });
});
