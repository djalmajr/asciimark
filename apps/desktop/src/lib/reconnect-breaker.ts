// Circuit breaker for MCP auto-reconnect. Reconnecting on every failed call
// with no cap turns a crashing stdio server into a spawn loop (the omp project
// hit exactly this — their fix: a 30s sliding window capped at 5 attempts with
// backoff). Pure and clock-injected so the policy is unit-testable.

export interface ReconnectBreakerOptions {
  /** Max attempts inside the sliding window before the breaker opens. */
  maxAttempts?: number;
  /** Sliding window in milliseconds. */
  windowMs?: number;
}

export interface ReconnectBreaker {
  /** Register an attempt for `id`. Returns the backoff delay (ms) to wait
   *  before reconnecting, or `null` when the breaker is open (give up). */
  nextDelay(id: string, now?: number): number | null;
  /** Clear the attempt history for `id` (call after a successful reconnect). */
  reset(id: string): void;
}

const DEFAULT_WINDOW_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

export function createReconnectBreaker(options: ReconnectBreakerOptions = {}): ReconnectBreaker {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const attempts = new Map<string, number[]>();

  return {
    nextDelay(id: string, now: number = Date.now()): number | null {
      const recent = (attempts.get(id) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxAttempts) {
        attempts.set(id, recent);
        return null;
      }
      const delay = Math.min(BASE_DELAY_MS * 2 ** recent.length, MAX_DELAY_MS);
      recent.push(now);
      attempts.set(id, recent);
      return delay;
    },
    reset(id: string): void {
      attempts.delete(id);
    },
  };
}
