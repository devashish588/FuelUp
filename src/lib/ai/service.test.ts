// Phase 8 — AI service tests with a fake provider (no network).
// Covers parsing scenarios, malformed output, and config failures.
// The service has no database access: nothing here can create a FoodLog.
import { describe, expect, it } from 'vitest';
import { getAiConfig } from './config';
import { parseFoodText, resetAiServiceStats, getAiServiceStats } from './service';
import { AiError, type AiProvider } from './types';

function fakeProvider(text: string): AiProvider {
  return {
    name: 'test-fake',
    generateText: async () => ({ text, model: 'test-model', latencyMs: 3 }),
  };
}

const CONFIG = { ...getAiConfig({ AI_API_KEY: 'k' }), maxTextChars: 500 };

describe('parseFoodText', () => {
  it('parses simple English input', async () => {
    const result = await parseFoodText('3 eggs and 250 ml milk', {
      config: CONFIG,
      provider: fakeProvider(
        '{"items":[{"name":"egg","quantity":3,"unit":"count","mealHint":null,"preparationHint":null},{"name":"milk","quantity":250,"unit":"ml","mealHint":null,"preparationHint":null}],"clarificationRequired":false}'
      ),
    });
    expect(result.items).toEqual([
      { name: 'egg', quantity: 3, unit: 'count', mealHint: null, preparationHint: null },
      { name: 'milk', quantity: 250, unit: 'ml', mealHint: null, preparationHint: null },
    ]);
    expect(result.clarificationRequired).toBe(false);
    expect(result.meta.provider).toBe('test-fake');
  });

  it('parses Indian food with grams, household units, and meal hints', async () => {
    const result = await parseFoodText('Breakfast was 2 rotis, dal one bowl and 200g chicken curry', {
      config: CONFIG,
      provider: fakeProvider(
        '{"items":[{"name":"roti","quantity":2,"unit":"count","mealHint":"breakfast","preparationHint":null},{"name":"dal","quantity":1,"unit":"bowl","mealHint":"breakfast","preparationHint":null},{"name":"chicken curry","quantity":200,"unit":"g","mealHint":"dinner","preparationHint":"curry"}],"clarificationRequired":false}'
      ),
    });
    expect(result.items).toHaveLength(3);
    expect(result.items[1]).toMatchObject({ name: 'dal', quantity: 1, unit: 'bowl' });
    expect(result.items[2]).toMatchObject({ name: 'chicken curry', quantity: 200, unit: 'g', preparationHint: 'curry' });
  });

  it('preserves null quantities and preparation hints', async () => {
    const result = await parseFoodText('I had chicken curry, 200 g cooked chicken breast', {
      config: CONFIG,
      provider: fakeProvider(
        '{"items":[{"name":"chicken curry","quantity":null,"unit":null,"mealHint":null,"preparationHint":"curry"},{"name":"chicken breast","quantity":200,"unit":"g","mealHint":null,"preparationHint":"cooked"}],"clarificationRequired":false}'
      ),
    });
    expect(result.items[0]).toMatchObject({ quantity: null, unit: null });
    expect(result.items[1]).toMatchObject({ name: 'chicken breast', quantity: 200, unit: 'g', preparationHint: 'cooked' });
  });

  it('rejects malformed JSON and schema-invalid output without creating anything', async () => {
    await expect(parseFoodText('x', { config: CONFIG, provider: fakeProvider('not json {{') })).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    });
    await expect(
      parseFoodText('x', { config: CONFIG, provider: fakeProvider('{"items":[{"name":"x","quantity":1,"unit":"parsec"}],"clarificationRequired":false}') })
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });

  it('rejects oversized input before any provider call', async () => {
    let called = false;
    const provider: AiProvider = {
      name: 'test-fake',
      generateText: async () => {
        called = true;
        return { text: '{}', model: 't', latencyMs: 1 };
      },
    };
    await expect(parseFoodText('x'.repeat(501), { config: CONFIG, provider })).rejects.toMatchObject({
      code: 'AI_REQUEST_TOO_LARGE',
    });
    expect(called).toBe(false);
  });

  it('fails safe without configuration and propagates provider errors', async () => {
    await expect(parseFoodText('2 eggs', { config: getAiConfig({}) })).rejects.toMatchObject({
      code: 'AI_CONFIGURATION_ERROR',
    });
    const failing: AiProvider = {
      name: 'test-fake',
      generateText: async () => {
        throw new AiError('AI_TIMEOUT', 'slow', true);
      },
    };
    await expect(parseFoodText('2 eggs', { config: CONFIG, provider: failing })).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
  });

  it('records usage stats without prompt contents', async () => {
    resetAiServiceStats();
    await parseFoodText('2 eggs', {
      config: CONFIG,
      provider: fakeProvider('{"items":[],"clarificationRequired":true}'),
    });
    const stats = getAiServiceStats();
    expect(stats.requests).toBe(1);
    expect(stats.failures).toBe(0);
    expect(JSON.stringify(stats)).not.toContain('2 eggs');
    resetAiServiceStats();
  });
});
