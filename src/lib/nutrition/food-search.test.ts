// Phase 8 — shared food-match scoring (guards the calorie-store refactor:
// identical ranking behavior through the extracted module).
import { describe, expect, it } from 'vitest';
import { normalizeFoodQuery, scoreFoodMatch, searchFoods } from './food-search';
import type { FoodItem } from '@/lib/types';

function food(name: string, extra: Partial<FoodItem> = {}): FoodItem {
  return {
    id: `f-${name}`,
    name,
    brand: '',
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 2,
    fiber_g: 0,
    barcode: null,
    is_custom: false,
    created_by: null,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

const FOODS = [
  food('Egg', { count_weight_g: 50 }),
  food('Egg curry', { category: 'curry' }),
  food('Chicken Curry'),
  food('Chicken Curry — homemade', { aliases: ['homemade chicken curry'] }),
  food('Milk', { category: 'dairy' }),
];

describe('normalizeFoodQuery', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeFoodQuery('  Chicken   CURRY ')).toBe('chicken curry');
    expect(normalizeFoodQuery('')).toBe('');
  });
});

describe('scoreFoodMatch', () => {
  it('ranks exact above prefix above substring above weak', () => {
    expect(scoreFoodMatch(FOODS[2], 'chicken curry')).toBe(100);
    expect(scoreFoodMatch(FOODS[0], 'egg')).toBe(100);
    expect(scoreFoodMatch(FOODS[1], 'egg')).toBe(30);
    expect(scoreFoodMatch(FOODS[2], 'curry')).toBe(20);
    expect(scoreFoodMatch(FOODS[4], 'dairy')).toBe(10);
    expect(scoreFoodMatch(FOODS[0], 'paneer')).toBe(0);
  });

  it('matches exact aliases and boosts preparation hints', () => {
    expect(scoreFoodMatch(FOODS[3], 'homemade chicken curry')).toBe(100);
    const breast = food('Chicken Breast');
    const plain = scoreFoodMatch(breast, 'chicken', 'grilled');
    const boosted = scoreFoodMatch({ ...breast, preparation: 'grilled' }, 'chicken', 'grilled');
    expect(plain).toBe(30);
    expect(boosted).toBe(35);
  });
});

describe('searchFoods', () => {
  it('returns ranked matches capped at the limit, [] for empty queries', () => {
    const results = searchFoods(FOODS, 'egg');
    expect(results.map((r) => r.food.name)).toEqual(['Egg', 'Egg curry']);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(searchFoods(FOODS, '   ')).toEqual([]);
    expect(searchFoods(FOODS, 'egg', 1)).toHaveLength(1);
  });
});
