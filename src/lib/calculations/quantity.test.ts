import { describe, expect, it } from 'vitest';
import {
  availableUnitsFor,
  basisUnitOf,
  defaultUnitFor,
  normalizeFoodQuantity,
  scaleFactorFor,
} from './quantity';
import type { FoodItem } from '@/lib/types';

function food(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: 'f-1',
    name: 'Cooked white rice',
    brand: '',
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: 130,
    protein_g: 2.7,
    carbs_g: 28,
    fat_g: 0.3,
    fiber_g: 0.4,
    barcode: null,
    is_custom: false,
    created_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('basisUnitOf', () => {
  it('classifies g/kg, ml/L, count, and serving bases', () => {
    expect(basisUnitOf({ serving_unit: 'g' })).toBe('g');
    expect(basisUnitOf({ serving_unit: 'kg' })).toBe('g');
    expect(basisUnitOf({ serving_unit: 'ml' })).toBe('ml');
    expect(basisUnitOf({ serving_unit: 'L' })).toBe('ml');
    expect(basisUnitOf({ serving_unit: 'count' })).toBe('count');
    expect(basisUnitOf({ serving_unit: 'serving' })).toBe('serving');
    expect(basisUnitOf({ serving_unit: '' })).toBe('serving');
  });

  it('picks natural UI defaults', () => {
    expect(defaultUnitFor(food())).toBe('g');
    expect(defaultUnitFor(food({ serving_unit: 'ml' }))).toBe('ml');
    expect(defaultUnitFor(food({ serving_unit: 'count' }))).toBe('count');
  });

  it('offers only compatible units', () => {
    expect(availableUnitsFor(food())).toEqual(['g', 'kg', 'serving']);
    expect(availableUnitsFor(food({ count_weight_g: 50 }))).toEqual(['g', 'kg', 'count', 'serving']);
    expect(availableUnitsFor(food({ serving_unit: 'ml' }))).toEqual(['ml', 'L', 'serving']);
    expect(availableUnitsFor(food({ serving_unit: 'serving' }))).toEqual(['serving']);
  });
});

describe('normalizeFoodQuantity', () => {
  it('passes grams through and converts kilograms', () => {
    expect(normalizeFoodQuantity(food(), 180, 'g')).toEqual({ ok: true, value: { value: 180, unit: 'g' } });
    expect(normalizeFoodQuantity(food(), 1, 'kg')).toEqual({ ok: true, value: { value: 1000, unit: 'g' } });
  });

  it('passes milliliters through and converts liters', () => {
    const milk = food({ serving_unit: 'ml', serving_size: 250 });
    expect(normalizeFoodQuantity(milk, 250, 'ml')).toEqual({ ok: true, value: { value: 250, unit: 'ml' } });
    expect(normalizeFoodQuantity(milk, 0.5, 'L')).toEqual({ ok: true, value: { value: 500, unit: 'ml' } });
  });

  it('converts count via the food-specific gram mapping', () => {
    const egg = food({ count_weight_g: 50 });
    expect(normalizeFoodQuantity(egg, 3, 'count')).toEqual({ ok: true, value: { value: 150, unit: 'g' } });
  });

  it('accepts servings for any food', () => {
    expect(normalizeFoodQuantity(food(), 1.5, 'serving')).toEqual({ ok: true, value: { value: 1.5, unit: 'serving' } });
  });

  it('rejects non-positive, non-finite, and absurd quantities', () => {
    for (const bad of [0, -50, NaN, Infinity]) {
      expect(normalizeFoodQuantity(food(), bad, 'g').ok).toBe(false);
    }
    expect(normalizeFoodQuantity(food(), 2e7, 'g').ok).toBe(false);
  });

  it('never converts grams ⇄ milliliters (density unknown)', () => {
    expect(normalizeFoodQuantity(food(), 250, 'ml').ok).toBe(false);
    expect(normalizeFoodQuantity(food({ serving_unit: 'ml' }), 200, 'g').ok).toBe(false);
    expect(normalizeFoodQuantity(food(), 1, 'L').ok).toBe(false);
  });

  it('rejects count without a gram mapping', () => {
    const result = normalizeFoodQuantity(food(), 2, 'count');
    expect(result.ok).toBe(false);
  });
});

describe('scaleFactorFor', () => {
  it('scales grams against a 100 g basis and servings directly', () => {
    expect(scaleFactorFor(food(), { value: 180, unit: 'g' })).toBeCloseTo(1.8);
    expect(scaleFactorFor(food(), { value: 1.5, unit: 'serving' })).toBe(1.5);
  });

  it('scales against non-100 bases (e.g. 158 g cup of rice)', () => {
    const cup = food({ serving_size: 158 });
    expect(scaleFactorFor(cup, { value: 158, unit: 'g' })).toBeCloseTo(1);
  });
});
