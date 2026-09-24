// Phase 8 — provider tests with injected fetch (no network, no quota spent).
import { describe, expect, it, vi } from 'vitest';
import { createOpenAiCompatibleProvider } from './providers/openai-compatible';
import { getAiProvider } from './providers';
import { getAiConfig } from './config';
import { AiError } from './types';

const OPTS = { apiBaseUrl: 'https://x.test/v1', apiKey: 'sk-test', model: 'm' };
const REQ = { systemPrompt: 's', userText: '2 eggs', maxOutputTokens: 800, timeoutMs: 1000 };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('openai-compatible provider', () => {
  it('posts chat completions and returns model text', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '{"items":[]}' } }] }));
    const provider = createOpenAiCompatibleProvider({ ...OPTS, fetchFn: fetchFn as never });
    const res = await provider.generateText(REQ);
    expect(res.text).toBe('{"items":[]}');
    expect(res.model).toBe('m');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.test/v1/chat/completions');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'm', temperature: 0, response_format: { type: 'json_object' } });
    // API key travels in the header, never in the body.
    expect(JSON.stringify(body)).not.toContain('sk-test');
  });

  it('maps 401/403 to configuration errors without retry', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 401));
    const provider = createOpenAiCompatibleProvider({ ...OPTS, fetchFn: fetchFn as never });
    await expect(provider.generateText(REQ)).rejects.toMatchObject({ code: 'AI_CONFIGURATION_ERROR' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to quota errors without retry', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 429));
    const provider = createOpenAiCompatibleProvider({ ...OPTS, fetchFn: fetchFn as never });
    await expect(provider.generateText(REQ)).rejects.toMatchObject({ code: 'AI_QUOTA' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries once on 5xx then normalizes to unavailable', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({}, 500));
    const provider = createOpenAiCompatibleProvider({ ...OPTS, fetchFn: fetchFn as never });
    await expect(provider.generateText(REQ)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries once on network failure, never on malformed output', async () => {
    const failing = vi.fn(async () => {
      throw new Error('socket hangup');
    });
    await expect(
      createOpenAiCompatibleProvider({ ...OPTS, fetchFn: failing as never }).generateText(REQ)
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(failing).toHaveBeenCalledTimes(2);

    const empty = vi.fn(async () => jsonResponse({ choices: [{ message: { content: '  ' } }] }));
    await expect(
      createOpenAiCompatibleProvider({ ...OPTS, fetchFn: empty as never }).generateText(REQ)
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it('aborts on timeout and reports AI_TIMEOUT', async () => {
    // Fake fetch that honors abort like a real implementation.
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
    const provider = createOpenAiCompatibleProvider({ ...OPTS, fetchFn: hanging as never });
    await expect(provider.generateText({ ...REQ, timeoutMs: 20 })).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  }, 10000);
});

describe('getAiProvider', () => {
  it('rejects missing configuration and unknown providers', () => {
    expect(() => getAiProvider(getAiConfig({}))).toThrowError(AiError);
    expect(() => getAiProvider(getAiConfig({ AI_PROVIDER: 'nope', AI_API_KEY: 'k' }))).toThrowError(AiError);
    try {
      getAiProvider(getAiConfig({}));
    } catch (error) {
      expect((error as AiError).code).toBe('AI_CONFIGURATION_ERROR');
      expect((error as Error).message).not.toContain('sk-');
    }
  });
});
