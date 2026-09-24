// Phase 9 — vision service tests with a fake vision provider (no network).
// Covers meal/label parsing, capability gating, malformed output, and the
// foodState→preparationHint normalization for the unchanged resolver.
import { describe, expect, it } from 'vitest';
import { getAiConfig } from './config';
import { AiError, type AiProvider } from './types';
import {
  getVisionStats,
  parseLabelImage,
  parseMealImage,
  resetVisionStats,
} from './vision-service';
import type { AiImagePayload } from './vision-schemas';

const IMAGE: AiImagePayload = { mimeType: 'image/jpeg', dataBase64: 'aGVsbG8=' };
const CONFIG = getAiConfig({ AI_API_KEY: 'k' });

function visionFake(text: string): AiProvider {
  return {
    name: 'test-vision-fake',
    generateText: async () => ({ text: '{}', model: 'test', latencyMs: 1 }),
    supportsVision: true,
    generateVision: async () => ({ text, model: 'test-vision', latencyMs: 5 }),
  };
}

const MEAL_JSON = JSON.stringify({
  items: [
    { name: 'rice', quantity: null, unit: null, mealHint: null, preparationHint: null, visualPortionHint: 'medium bowl', foodState: 'cooked' },
    { name: 'dal', quantity: 200, unit: 'g', mealHint: null, preparationHint: null, visualPortionHint: null, foodState: null },
    { name: 'chicken curry', quantity: null, unit: null, mealHint: 'dinner', preparationHint: 'curry', visualPortionHint: 'small bowl', foodState: null },
    { name: 'unknown curry-like dish', quantity: null, unit: null, mealHint: null, preparationHint: null, visualPortionHint: null, foodState: null },
  ],
  clarificationRequired: false,
});

const LABEL_JSON = JSON.stringify({
  label: {
    name: 'Protein Bar', brand: 'Example', servingQuantity: 40, servingUnit: 'g',
    calories: 180, protein: 8, carbs: 22, fat: 7, fiber: 3, sugar: 5, sodium: 140,
  },
  clarificationRequired: false,
});

describe('parseMealImage', () => {
  it('parses a mixed Indian plate without invented grams', async () => {
    const result = await parseMealImage({ image: IMAGE, text: 'homemade please' }, { config: CONFIG, provider: visionFake(MEAL_JSON) });
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({ name: 'rice', quantity: null, unit: null, visualPortionHint: 'medium bowl' });
    // foodState feeds preparationHint for the unchanged resolver scoring.
    expect(result.items[0].preparationHint).toBe('cooked');
    expect(result.items[1]).toMatchObject({ name: 'dal', quantity: 200, unit: 'g' });
    expect(result.items[2].mealHint).toBe('dinner');
    expect(result.items[3].name).toBe('unknown curry-like dish');
    expect(result.clarificationRequired).toBe(false);
    expect(result.meta.provider).toBe('test-vision-fake');
  });

  it('rejects malformed model output safely', async () => {
    await expect(parseMealImage({ image: IMAGE }, { config: CONFIG, provider: visionFake('nope{{{') })).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    });
    await expect(
      parseMealImage({ image: IMAGE }, { config: CONFIG, provider: visionFake('{"items":[{"name":"x","quantity":1,"unit":"parsec"}],"clarificationRequired":false}') })
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });

  it('refuses when vision is unsupported or unconfigured', async () => {
    const textOnly: AiProvider = { name: 'text-only', generateText: async () => ({ text: '{}', model: 't', latencyMs: 1 }) };
    await expect(parseMealImage({ image: IMAGE }, { config: CONFIG, provider: textOnly })).rejects.toMatchObject({
      code: 'AI_IMAGE_UNSUPPORTED',
    });
    await expect(parseMealImage({ image: IMAGE }, { config: getAiConfig({}) })).rejects.toMatchObject({
      code: 'AI_CONFIGURATION_ERROR',
    });
    await expect(
      parseMealImage({ image: IMAGE }, { config: getAiConfig({ AI_API_KEY: 'k', AI_VISION_ENABLED: 'false' }), provider: visionFake(MEAL_JSON) })
    ).rejects.toMatchObject({ code: 'AI_IMAGE_UNSUPPORTED' });
  });

  it('propagates provider failures and counts image requests', async () => {
    resetVisionStats();
    const failing: AiProvider = {
      name: 'failing',
      supportsVision: true,
      generateText: async () => ({ text: '{}', model: 't', latencyMs: 1 }),
      generateVision: async () => {
        throw new AiError('AI_TIMEOUT', 'slow', true);
      },
    };
    await expect(parseMealImage({ image: IMAGE }, { config: CONFIG, provider: failing })).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(getVisionStats().imageRequests).toBe(1);
    resetVisionStats();
  });
});

describe('parseLabelImage', () => {
  it('extracts a complete label for user review', async () => {
    const result = await parseLabelImage({ image: IMAGE }, { config: CONFIG, provider: visionFake(LABEL_JSON) });
    expect(result.label).toMatchObject({ name: 'Protein Bar', brand: 'Example', servingQuantity: 40, servingUnit: 'g', calories: 180, sodium: 140 });
    expect(result.clarificationRequired).toBe(false);
  });

  it('rejects unreadable labels and ungated providers', async () => {
    await expect(
      parseLabelImage({ image: IMAGE }, { config: CONFIG, provider: visionFake('{"label":{"calories":"lots"},"clarificationRequired":false}') })
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    const textOnly: AiProvider = { name: 'text-only', generateText: async () => ({ text: '{}', model: 't', latencyMs: 1 }) };
    await expect(parseLabelImage({ image: IMAGE }, { config: CONFIG, provider: textOnly })).rejects.toMatchObject({
      code: 'AI_IMAGE_UNSUPPORTED',
    });
  });
});
