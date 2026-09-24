// Phase 9 — vision contract tests: meal/label schemas, image validation,
// magic-byte sniffing. The model is untrusted: unknown keys stripped,
// malformed output rejected, no prose salvage.
import { describe, expect, it } from 'vitest';
import {
  AI_MAX_IMAGE_BASE64_CHARS,
  aiLabelVisionResponseSchema,
  aiMealVisionResponseSchema,
  aiVisionRequestSchema,
  sniffImageMime,
} from './vision-schemas';

function b64(bytes: number[]): string {
  return Buffer.from(bytes).toString('base64');
}

const JPEG = b64([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = b64([0x52, 0x49, 0x46, 0x46, 0x2a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const GIF = b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00]);
const TEXT = Buffer.from('hello, not an image').toString('base64');

describe('sniffImageMime', () => {
  it('detects JPEG, PNG, and WebP magic bytes', () => {
    expect(sniffImageMime(JPEG)).toBe('image/jpeg');
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(WEBP)).toBe('image/webp');
  });

  it('rejects GIF, text, and garbage', () => {
    expect(sniffImageMime(GIF)).toBeNull();
    expect(sniffImageMime(TEXT)).toBeNull();
    expect(sniffImageMime('!!!not-base64!!!')).toBeNull();
    expect(sniffImageMime('')).toBeNull();
  });
});

describe('aiVisionRequestSchema', () => {
  const base = { task: 'meal', image: { mimeType: 'image/jpeg', dataBase64: JPEG } };

  it('accepts a meal request with optional clarification text', () => {
    const parsed = aiVisionRequestSchema.safeParse({ ...base, text: 'homemade chicken curry' });
    expect(parsed.success).toBe(true);
  });

  it('accepts a label request without text', () => {
    expect(aiVisionRequestSchema.safeParse({ task: 'nutrition_label', image: base.image }).success).toBe(true);
  });

  it('rejects bad tasks, MIMEs, oversized payloads, and long text', () => {
    expect(aiVisionRequestSchema.safeParse({ ...base, task: 'selfie' }).success).toBe(false);
    expect(aiVisionRequestSchema.safeParse({ ...base, image: { ...base.image, mimeType: 'image/gif' } }).success).toBe(false);
    expect(
      aiVisionRequestSchema.safeParse({ ...base, image: { ...base.image, dataBase64: 'a'.repeat(AI_MAX_IMAGE_BASE64_CHARS + 1) } }).success
    ).toBe(false);
    expect(aiVisionRequestSchema.safeParse({ ...base, text: 'x'.repeat(301) }).success).toBe(false);
  });
});

describe('aiMealVisionResponseSchema', () => {
  const item = {
    name: 'rice', quantity: null, unit: null, mealHint: null,
    preparationHint: null, visualPortionHint: 'medium bowl', foodState: 'cooked',
  };

  it('accepts uncertain portions with visual hints (no invented grams)', () => {
    const parsed = aiMealVisionResponseSchema.safeParse({ items: [item], clarificationRequired: false });
    expect(parsed.success).toBe(true);
  });

  it('strips calories/macros/confidence and rejects bad states', () => {
    const parsed = aiMealVisionResponseSchema.safeParse({
      items: [{ ...item, calories: 500, confidence: 0.97 }],
      clarificationRequired: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('calories' in parsed.data.items[0]).toBe(false);
      expect('confidence' in parsed.data.items[0]).toBe(false);
    }
    expect(
      aiMealVisionResponseSchema.safeParse({ items: [{ ...item, foodState: 'teleported' }], clarificationRequired: false }).success
    ).toBe(false);
  });

  it('rejects invented precision violations structurally (quantity bounds)', () => {
    expect(
      aiMealVisionResponseSchema.safeParse({ items: [{ ...item, quantity: -5 }], clarificationRequired: false }).success
    ).toBe(false);
  });
});

describe('aiLabelVisionResponseSchema', () => {
  const label = {
    name: 'Protein Bar', brand: 'Example', servingQuantity: 40, servingUnit: 'g',
    calories: 180, protein: 8, carbs: 22, fat: 7, fiber: 3, sugar: 5, sodium: 140,
  };

  it('accepts a complete label and sparse labels with nulls', () => {
    expect(aiLabelVisionResponseSchema.safeParse({ label, clarificationRequired: false }).success).toBe(true);
    const sparse = { ...label, brand: null, fiber: null, sugar: null, sodium: null };
    const parsed = aiLabelVisionResponseSchema.safeParse({ label: sparse, clarificationRequired: false });
    expect(parsed.success).toBe(true);
  });

  it('rejects negative nutrients and unknown serving units', () => {
    expect(aiLabelVisionResponseSchema.safeParse({ label: { ...label, calories: -10 }, clarificationRequired: false }).success).toBe(false);
    expect(aiLabelVisionResponseSchema.safeParse({ label: { ...label, servingUnit: 'cup' }, clarificationRequired: false }).success).toBe(false);
  });

  it('accepts decimal calories', () => {
    const parsed = aiLabelVisionResponseSchema.safeParse({
      label: { ...label, calories: 182.5 },
      clarificationRequired: false,
    });
    expect(parsed.success).toBe(true);
  });
});
