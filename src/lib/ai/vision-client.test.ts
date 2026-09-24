// Phase 9 — vision client tests: minimal request contract (image +
// optional text ONLY), code mapping, and network failure handling.
import { describe, expect, it, vi } from 'vitest';
import { requestVision } from './client';

const IMAGE = { mimeType: 'image/jpeg', dataBase64: 'aGVsbG8=' };

describe('requestVision', () => {
  it('sends only image + optional text (privacy contract)', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ task: 'meal', items: [{ name: 'rice' }], clarificationRequired: false }),
    }));
    const result = await requestVision('meal', IMAGE, 'homemade', fetchFn as never);
    expect(result.task).toBe('meal');
    expect(result.items).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/vision');
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['image', 'task', 'text']);
  });

  it('omits text when absent and maps unsupported setups', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ task: 'nutrition_label', clarificationRequired: true }),
    }));
    const result = await requestVision('nutrition_label', IMAGE, undefined, fetchFn as never);
    expect(result.clarificationRequired).toBe(true);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(Object.keys(JSON.parse(init.body as string) as object).sort()).toEqual(['image', 'task']);

    const failing = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ code: 'AI_IMAGE_UNSUPPORTED', error: "This AI setup doesn't support photos. Use manual entry." }),
    }));
    await expect(requestVision('meal', IMAGE, undefined, failing as never)).rejects.toMatchObject({
      code: 'AI_IMAGE_UNSUPPORTED',
      retryable: false,
    });
  });

  it('treats network failure as retryable unavailability', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(requestVision('meal', IMAGE, undefined, fetchFn as never)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      retryable: true,
    });
  });
});
