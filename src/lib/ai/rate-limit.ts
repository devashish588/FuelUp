// =============================================
// FuelUp - AI rate limiting (server, $0 stack)
// In-memory sliding window per user. No Redis, no billing.
// Limitation (documented): counts are per server instance — on serverless
// deployments each instance enforces independently, so the effective limit
// is approximate under concurrency. Sufficient as a free-tier guard.
// =============================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export interface RateLimiter {
  check(userId: string, now?: number): RateLimitResult;
  /** Test/dev introspection (counts only, no personal data). */
  count(userId: string, now?: number): number;
}

export function createRateLimiter(options: { maxRequests: number; windowMs: number }): RateLimiter {
  const { maxRequests, windowMs } = options;
  const hits = new Map<string, number[]>();
  const prune = (userId: string, now: number): number[] => {
    const cutoff = now - windowMs;
    const kept = (hits.get(userId) ?? []).filter((t) => t > cutoff);
    hits.set(userId, kept);
    return kept;
  };
  return {
    check(userId: string, now: number = Date.now()): RateLimitResult {
      const kept = prune(userId, now);
      if (kept.length >= maxRequests) {
        const oldest = Math.min(...kept);
        return { allowed: false, remaining: 0, resetMs: Math.max(oldest + windowMs - now, 0) };
      }
      kept.push(now);
      return { allowed: true, remaining: maxRequests - kept.length, resetMs: windowMs };
    },
    count(userId: string, now: number = Date.now()): number {
      return prune(userId, now).length;
    },
  };
}

let cached: { key: string; limiter: RateLimiter } | null = null;

/** Process-wide limiter honoring the supplied config (recreated on change). */
export function getAiRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
  const key = `${maxRequests}:${windowMs}`;
  if (!cached || cached.key !== key) {
    cached = { key, limiter: createRateLimiter({ maxRequests, windowMs }) };
  }
  return cached.limiter;
}

export const AI_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
