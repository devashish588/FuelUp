// Phase 8 — AI config + rate limiter tests.
import { describe, expect, it } from 'vitest';
import { getAiConfig } from './config';
import { createRateLimiter } from './rate-limit';

describe('getAiConfig', () => {
  it('applies documented defaults', () => {
    const config = getAiConfig({});
    expect(config).toMatchObject({
      provider: 'openai-compatible',
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 20000,
      maxTextChars: 500,
      maxItems: 15,
      requestsPerHour: 20,
      enabled: false,
    });
  });

  it('reads overrides and enables when a key is present', () => {
    const config = getAiConfig({
      AI_PROVIDER: 'openai-compatible',
      AI_API_BASE_URL: 'https://x.test/v1',
      AI_API_KEY: 'sk-test',
      AI_MODEL: 'm',
      AI_TIMEOUT_MS: '5000',
      AI_REQUESTS_PER_HOUR: '5',
    });
    expect(config).toMatchObject({ apiBaseUrl: 'https://x.test/v1', model: 'm', timeoutMs: 5000, requestsPerHour: 5, enabled: true });
  });

  it('ignores invalid numerics', () => {
    expect(getAiConfig({ AI_TIMEOUT_MS: 'banana' }).timeoutMs).toBe(20000);
  });
});

describe('createRateLimiter', () => {
  it('allows up to the limit then rejects gracefully', () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 3600000 });
    expect(limiter.check('u-1', 1000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check('u-1', 2000)).toMatchObject({ allowed: true, remaining: 0 });
    const denied = limiter.check('u-1', 3000);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.resetMs).toBeGreaterThan(0);
  });

  it('resets after the window and isolates users', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(limiter.check('u-1', 0).allowed).toBe(true);
    expect(limiter.check('u-1', 500).allowed).toBe(false);
    expect(limiter.check('u-2', 500).allowed).toBe(true);
    expect(limiter.check('u-1', 1001).allowed).toBe(true);
  });
});
