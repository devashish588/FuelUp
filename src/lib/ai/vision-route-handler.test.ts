// Phase 9 — vision route-handler tests: validation, magic bytes, separate
// image rate bucket, task dispatch, and capability failures. No database,
// no image storage — outcomes only.
import { describe, expect, it } from 'vitest';
import { getAiConfig } from './config';
import { AiError, type AiProvider } from './types';
import { handleVisionRequest, visionStatusExtension } from './vision-route-handler';

function jpegBytes(): string {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64');
}
function pngBytes(): string {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString('base64');
}

const CONFIG = getAiConfig({ AI_API_KEY: 'k' });

function visionFake(text: string): AiProvider {
  return {
    name: 'test-vision-fake',
    generateText: async () => ({ text: '{}', model: 't', latencyMs: 1 }),
    supportsVision: true,
    generateVision: async () => ({ text, model: 'test-vision', latencyMs: 4 }),
  };
}

const MEAL_JSON = JSON.stringify({
  items: [{ name: 'rice', quantity: null, unit: null, mealHint: null, preparationHint: null, visualPortionHint: 'medium bowl', foodState: 'cooked' }],
  clarificationRequired: false,
});
const LABEL_JSON = JSON.stringify({
  label: { name: 'Bar', brand: null, servingQuantity: 40, servingUnit: 'g', calories: 180, protein: 8, carbs: 22, fat: 7, fiber: null, sugar: null, sodium: null },
  clarificationRequired: false,
});

function body(payload: unknown): string {
  return JSON.stringify(payload);
}

describe('handleVisionRequest', () => {
  it('resolves a meal photo to candidates (no DB writes possible)', async () => {
    const outcome = await handleVisionRequest({
      userId: 'vision-u-1',
      rawBody: body({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: jpegBytes() }, text: 'homemade' }),
      deps: { config: CONFIG, provider: visionFake(MEAL_JSON) },
    });
    expect(outcome.status).toBe(200);
    const result = outcome.body as { task: string; items: { name: string }[]; clarificationRequired: boolean; meta: Record<string, unknown> };
    expect(result.task).toBe('meal');
    expect(result.items).toHaveLength(1);
    expect(result.meta.model).toBe('test-vision');
    expect(JSON.stringify(result)).not.toContain('aGVsbG8');
  });

  it('extracts a label for user review', async () => {
    const outcome = await handleVisionRequest({
      userId: 'vision-u-2',
      rawBody: body({ task: 'nutrition_label', image: { mimeType: 'image/png', dataBase64: pngBytes() } }),
      deps: { config: CONFIG, provider: visionFake(LABEL_JSON) },
    });
    expect(outcome.status).toBe(200);
    const result = outcome.body as { task: string; label: { name: string; calories: number } };
    expect(result.task).toBe('nutrition_label');
    expect(result.label).toMatchObject({ name: 'Bar', calories: 180 });
  });

  it('rejects bad JSON, bad MIME, oversized payloads, and magic mismatches', async () => {
    const bad = await handleVisionRequest({ userId: 'u', rawBody: '{nope', deps: { config: CONFIG } });
    expect(bad.status).toBe(400);
    const mime = await handleVisionRequest({
      userId: 'u', rawBody: body({ task: 'meal', image: { mimeType: 'image/gif', dataBase64: jpegBytes() } }), deps: { config: CONFIG },
    });
    expect(mime.status).toBe(400);
    const huge = await handleVisionRequest({
      userId: 'u', rawBody: body({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: 'x'.repeat(2000000) } }), deps: { config: CONFIG },
    });
    expect(huge.status).toBe(413);
    expect((huge.body as { code: string }).code).toBe('AI_REQUEST_TOO_LARGE');
    // Declared PNG but JPEG bytes → rejected without calling the provider.
    let called = false;
    const spy: AiProvider = {
      name: 'spy', generateText: async () => ({ text: '{}', model: 't', latencyMs: 1 }),
      supportsVision: true,
      generateVision: async () => { called = true; return { text: MEAL_JSON, model: 't', latencyMs: 1 }; },
    };
    const mismatch = await handleVisionRequest({
      userId: 'u', rawBody: body({ task: 'meal', image: { mimeType: 'image/png', dataBase64: jpegBytes() } }), deps: { config: CONFIG, provider: spy },
    });
    expect(mismatch.status).toBe(400);
    expect(called).toBe(false);
  });

  it('rate-limits images on a separate bucket with retry guidance', async () => {
    const deps = { config: CONFIG, provider: visionFake(MEAL_JSON), rateLimitMax: 1 };
    const first = await handleVisionRequest({
      userId: 'vision-limited', rawBody: body({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: jpegBytes() } }), deps,
    });
    expect(first.status).toBe(200);
    const second = await handleVisionRequest({
      userId: 'vision-limited', rawBody: body({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: jpegBytes() } }), deps,
    });
    expect(second.status).toBe(429);
    expect((second.body as { code: string }).code).toBe('AI_RATE_LIMITED');
  });

  it('fails fast for unsupported setups and maps provider failures', async () => {
    const textOnly: AiProvider = { name: 'text-only', generateText: async () => ({ text: '{}', model: 't', latencyMs: 1 }) };
    const unsupported = await handleVisionRequest({
      userId: 'vision-u-3', rawBody: body({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: jpegBytes() } }),
      deps: { config: CONFIG, provider: textOnly },
    });
    expect(unsupported.status).toBe(503);
    expect((unsupported.body as { code: string }).code).toBe('AI_IMAGE_UNSUPPORTED');

    const failing: AiProvider = {
      name: 'failing', supportsVision: true,
      generateText: async () => ({ text: '{}', model: 't', latencyMs: 1 }),
      generateVision: async () => { throw new AiError('AI_TIMEOUT', 'slow', true); },
    };
    const timeout = await handleVisionRequest({
      userId: 'vision-u-4', rawBody: body({ task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: jpegBytes() } }),
      deps: { config: CONFIG, provider: failing },
    });
    expect(timeout.status).toBe(504);

    const malformed = await handleVisionRequest({
      userId: 'vision-u-5', rawBody: body({ task: 'nutrition_label', image: { mimeType: 'image/jpeg', dataBase64: jpegBytes() } }),
      deps: { config: CONFIG, provider: visionFake('{"label":{}}') },
    });
    expect(malformed.status).toBe(502);
    expect((malformed.body as { code: string }).code).toBe('AI_INVALID_OUTPUT');
  });
});

describe('visionStatusExtension', () => {
  it('reports support flag and per-caller image allowance', () => {
    const ext = visionStatusExtension({ userId: 'vision-u-6', deps: { config: CONFIG } });
    expect(ext.visionSupported).toBe(true);
    expect(ext.imageRequestsRemaining).toBeGreaterThan(0);
    const off = visionStatusExtension({ userId: 'vision-u-6', deps: { config: getAiConfig({}) } });
    expect(off.visionSupported).toBe(false);
  });
});
