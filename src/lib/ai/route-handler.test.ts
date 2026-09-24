// Phase 8 — route handler tests (auth boundary is the Next route; this
// covers validation, rate limits, provider mapping, and response shape).
import { describe, expect, it } from 'vitest';
import { getAiConfig } from './config';
import { handleAiStatusRequest, handleFoodParseRequest } from './route-handler';
import { AiError, type AiProvider } from './types';

const CONFIG = getAiConfig({ AI_API_KEY: 'k', AI_REQUESTS_PER_HOUR: '100' });

function okProvider(text: string): AiProvider {
  return { name: 'test-fake', generateText: async () => ({ text, model: 'test-model', latencyMs: 2 }) };
}

const OK_JSON =
  '{"items":[{"name":"egg","quantity":3,"unit":"count","mealHint":null,"preparationHint":null}],"clarificationRequired":false}';

describe('handleFoodParseRequest', () => {
  it('returns normalized candidates with non-sensitive meta', async () => {
    const outcome = await handleFoodParseRequest({
      userId: 'user-a',
      rawBody: JSON.stringify({ text: '3 eggs' }),
      deps: { config: CONFIG, provider: okProvider(OK_JSON) },
    });
    expect(outcome.status).toBe(200);
    const body = outcome.body as { items: unknown[]; clarificationRequired: boolean; meta: Record<string, unknown> };
    expect(body.items).toHaveLength(1);
    expect(body.clarificationRequired).toBe(false);
    expect(body.meta.requestId).toBeTruthy();
    expect(body.meta.model).toBe('test-model');
    expect(JSON.stringify(body)).not.toContain('sk-');
  });

  it('ignores arbitrary ownership fields instead of trusting them', async () => {
    const outcome = await handleFoodParseRequest({
      userId: 'user-a',
      rawBody: JSON.stringify({ text: '3 eggs', user_id: 'user-b', ownerId: 'user-b', admin: true }),
      deps: { config: CONFIG, provider: okProvider(OK_JSON) },
    });
    expect(outcome.status).toBe(200);
  });

  it('rejects oversized bodies, bad JSON, and invalid payloads safely', async () => {
    expect((await handleFoodParseRequest({ userId: 'u', rawBody: 'x'.repeat(9000), deps: { config: CONFIG } })).status).toBe(413);
    const bad = await handleFoodParseRequest({ userId: 'u', rawBody: '{nope', deps: { config: CONFIG } });
    expect(bad.status).toBe(400);
    const empty = await handleFoodParseRequest({ userId: 'u', rawBody: JSON.stringify({ text: '' }), deps: { config: CONFIG } });
    expect(empty.status).toBe(400);
    expect((empty.body as { code: string }).code).toBe('BAD_REQUEST');
  });

  it('rate-limits gracefully with a retry hint', async () => {
    const deps = { config: CONFIG, provider: okProvider(OK_JSON), rateLimitMax: 1 };
    expect((await handleFoodParseRequest({ userId: 'limited-u', rawBody: JSON.stringify({ text: 'a' }), deps })).status).toBe(200);
    const outcome = await handleFoodParseRequest({ userId: 'limited-u', rawBody: JSON.stringify({ text: 'b' }), deps });
    expect(outcome.status).toBe(429);
    const body = outcome.body as { code: string; retryAfterMs: number };
    expect(body.code).toBe('AI_RATE_LIMITED');
    expect(body.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it('maps provider failures to controlled codes (never creates FoodLogs)', async () => {
    const failing = (code: 'AI_TIMEOUT' | 'AI_QUOTA' | 'AI_INVALID_OUTPUT'): AiProvider => ({
      name: 'test-fake',
      generateText: async () => {
        throw new AiError(code, code, code === 'AI_TIMEOUT');
      },
    });
    const timeout = await handleFoodParseRequest({ userId: 'u', rawBody: JSON.stringify({ text: 'a' }), deps: { config: CONFIG, provider: failing('AI_TIMEOUT') } });
    expect(timeout.status).toBe(504);
    expect((timeout.body as { code: string }).code).toBe('AI_TIMEOUT');
    const quota = await handleFoodParseRequest({ userId: 'u', rawBody: JSON.stringify({ text: 'a' }), deps: { config: CONFIG, provider: failing('AI_QUOTA') } });
    expect(quota.status).toBe(429);
    const malformed = await handleFoodParseRequest({ userId: 'u', rawBody: JSON.stringify({ text: 'a' }), deps: { config: getAiConfig({ AI_API_KEY: 'k' }), provider: okProvider('{"nope":true}') } });
    expect(malformed.status).toBe(502);
    expect((malformed.body as { code: string }).code).toBe('AI_INVALID_OUTPUT');
  });

  it('fails safe without provider configuration', async () => {
    const outcome = await handleFoodParseRequest({
      userId: 'u',
      rawBody: JSON.stringify({ text: '2 eggs' }),
      deps: { config: getAiConfig({}) },
    });
    expect(outcome.status).toBe(503);
    expect((outcome.body as { code: string }).code).toBe('AI_CONFIGURATION_ERROR');
  });
});

describe('handleAiStatusRequest', () => {
  it('reports caller-scoped availability without secrets', () => {
    const outcome = handleAiStatusRequest({ userId: 'user-a', deps: { config: CONFIG } });
    expect(outcome.status).toBe(200);
    const body = outcome.body as Record<string, unknown>;
    expect(body.enabled).toBe(true);
    expect(body.provider).toBe('openai-compatible');
    expect(typeof body.requestsRemaining).toBe('number');
    expect(JSON.stringify(body)).not.toContain('sk-');
  });
});
