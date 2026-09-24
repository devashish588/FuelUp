// Phase 8 — AI client wrapper tests (browser-safe, injected fetch).
import { describe, expect, it, vi } from 'vitest';
import { isAiOnline, requestFoodParse } from './client';

describe('isAiOnline', () => {
  it('treats missing navigator (SSR/tests) as online', () => {
    expect(isAiOnline(undefined)).toBe(true);
  });

  it('respects explicit navigator states', () => {
    expect(isAiOnline({ onLine: true })).toBe(true);
    expect(isAiOnline({ onLine: false })).toBe(false);
    expect(isAiOnline({})).toBe(true);
  });
});

describe('requestFoodParse', () => {
  it('returns parsed candidates on success', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [{ name: 'egg' }], clarificationRequired: false }),
    }));
    const result = await requestFoodParse('3 eggs', fetchFn as never);
    expect(result.items).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/food-parse');
    // Minimal contract: only the food text leaves the browser.
    expect(JSON.parse(init.body as string)).toEqual({ text: '3 eggs' });
  });

  it('maps server codes to user-safe messages', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 504,
      json: async () => ({ code: 'AI_TIMEOUT' }),
    }));
    await expect(requestFoodParse('x', fetchFn as never)).rejects.toMatchObject({ code: 'AI_TIMEOUT', retryable: true });
  });

  it('treats network failure as retryable unavailability', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(requestFoodParse('x', fetchFn as never)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryable: true,
    });
  });
});
