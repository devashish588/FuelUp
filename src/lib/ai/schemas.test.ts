// Phase 8 — AI contract tests: error codes, request/response schemas.
// The model is untrusted: unknown keys (calories, confidence) are stripped.
import { describe, expect, it } from 'vitest';
import { AiError, AI_ERROR_CODES } from './types';
import {
  AI_MAX_ITEMS,
  aiFoodParseRequestSchema,
  aiFoodParseResponseSchema,
} from './schemas';

describe('AiError', () => {
  it('exposes normalized codes and retryability', () => {
    expect(AI_ERROR_CODES).toContain('AI_TIMEOUT');
    expect(AI_ERROR_CODES).toContain('AI_RATE_LIMITED');
    expect(new AiError('AI_TIMEOUT', 'slow', true)).toMatchObject({ code: 'AI_TIMEOUT', retryable: true });
    expect(new AiError('AI_QUOTA').retryable).toBe(false);
  });
});

describe('aiFoodParseRequestSchema', () => {
  it('accepts plain food text and strips unknown keys', () => {
    const parsed = aiFoodParseRequestSchema.safeParse({ text: '2 rotis and dal', user_id: 'other', email: 'x@y.z' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ text: '2 rotis and dal' });
  });

  it('rejects empty and oversized text', () => {
    expect(aiFoodParseRequestSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(aiFoodParseRequestSchema.safeParse({ text: 'x'.repeat(501) }).success).toBe(false);
    expect(aiFoodParseRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('aiFoodParseResponseSchema', () => {
  const item = { name: 'roti', quantity: 2, unit: 'count', mealHint: null, preparationHint: null };

  it('accepts a valid structured response', () => {
    const parsed = aiFoodParseResponseSchema.safeParse({ items: [item], clarificationRequired: false });
    expect(parsed.success).toBe(true);
  });

  it('strips AI-injected nutrition truth and confidence scores', () => {
    const parsed = aiFoodParseResponseSchema.safeParse({
      items: [{ ...item, calories: 9999, protein: 50, confidence: 0.99 }],
      clarificationRequired: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items[0]).toEqual(item);
      expect('calories' in parsed.data.items[0]).toBe(false);
      expect('confidence' in parsed.data.items[0]).toBe(false);
    }
  });

  it('rejects invalid units, negative quantities, missing names', () => {
    expect(aiFoodParseResponseSchema.safeParse({ items: [{ ...item, unit: 'km' }], clarificationRequired: false }).success).toBe(false);
    expect(aiFoodParseResponseSchema.safeParse({ items: [{ ...item, quantity: -2 }], clarificationRequired: false }).success).toBe(false);
    expect(aiFoodParseResponseSchema.safeParse({ items: [{ ...item, name: '' }], clarificationRequired: false }).success).toBe(false);
  });

  it('rejects more items than the documented cap', () => {
    const items = Array.from({ length: AI_MAX_ITEMS + 1 }, (_, i) => ({ ...item, name: `food-${i}` }));
    expect(aiFoodParseResponseSchema.safeParse({ items, clarificationRequired: false }).success).toBe(false);
    expect(AI_MAX_ITEMS).toBeLessThanOrEqual(20);
  });

  it('allows empty items (clarification path) and null quantities', () => {
    const parsed = aiFoodParseResponseSchema.safeParse({
      items: [{ name: 'chicken curry', quantity: null, unit: null, mealHint: 'dinner', preparationHint: 'curry' }],
      clarificationRequired: true,
    });
    expect(parsed.success).toBe(true);
  });
});
