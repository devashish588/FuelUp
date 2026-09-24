// Phase 9 — vision provider tests (injected fetch, no network/quota).
// Covers content-parts construction, vision model override, single-image
// guard, capability flag, and inherited error normalization.
import { describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleProvider } from './providers/openai-compatible';
import { isVisionCapableProvider } from './providers';
import type { AiVisionRequest } from './types';

const OPTS = { apiBaseUrl: 'https://x.test/v1', apiKey: 'sk-test', model: 'm' };

function visionReq(): AiVisionRequest {
  return {
    systemPrompt: 's',
    userText: 'homemade chicken curry',
    images: [{ mimeType: 'image/jpeg', dataBase64: 'aGVsbG8=' }],
    maxOutputTokens: 1200,
    timeoutMs: 1000,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('openai-compatible vision', () => {
  it('sends text + image content-parts and returns model text', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{"items":[]}' } }] }));
    const provider = createOpenAiCompatibleProvider({ ...OPTS, fetchFn: fetchFn as never });
    expect(provider.supportsVision).toBe(true);
    const res = await provider.generateVision!(visionReq());
    expect(res.text).toBe('{"items":[]}');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/v1/chat/completions');
    const body = JSON.parse(init.body as string) as { model: string; messages: { content: unknown }[] };
    expect(body.model).toBe('m');
    const userContent = body.messages[1].content as { type: string }[];
    expect(userContent[0]).toMatchObject({ type: 'text', text: 'homemade chicken curry' });
    expect(userContent[1]).toMatchObject({ type: 'image_url' });
    expect(JSON.stringify(userContent[1])).toContain('data:image/jpeg;base64,aGVsbG8=');
    expect(JSON.stringify(body)).not.toContain('sk-test');
  });

  it('uses the vision model override when configured', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{}' } }] }));
    const provider = createOpenAiCompatibleProvider({ ...OPTS, visionModel: 'v-model', fetchFn: fetchFn as never });
    await provider.generateVision!(visionReq());
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(init.body as string) as { model: string }).model).toBe('v-model');
  });

  it('rejects multi-image requests without spending quota', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{}' } }] }));
    const provider = createOpenAiCompatibleProvider({ ...OPTS, fetchFn: fetchFn as never });
    const req = visionReq();
    await expect(
      provider.generateVision!({ ...req, images: [req.images[0], req.images[0]] })
    ).rejects.toMatchObject({ code: 'AI_REQUEST_TOO_LARGE' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('normalizes quota and timeout for vision calls', async () => {
    const quota = vi.fn(async () => jsonResponse({}, 429));
    await expect(
      createOpenAiCompatibleProvider({ ...OPTS, fetchFn: quota as never }).generateVision!(visionReq())
    ).rejects.toMatchObject({ code: 'AI_QUOTA' });
    expect(quota).toHaveBeenCalledTimes(1);

    const hanging = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }) as Promise<Response>
    );
    await expect(
      createOpenAiCompatibleProvider({ ...OPTS, fetchFn: hanging as never }).generateVision!({ ...visionReq(), timeoutMs: 20 })
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  }, 10000);
});

describe('isVisionCapableProvider', () => {
  it('knows which providers speak vision without model-name heuristics', () => {
    expect(isVisionCapableProvider('openai-compatible')).toBe(true);
    expect(isVisionCapableProvider('nope')).toBe(false);
  });
});
