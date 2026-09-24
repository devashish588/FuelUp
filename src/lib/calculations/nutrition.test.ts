import { describe, expect, it } from 'vitest';
import {
  calculateDailyNutrition,
  calculateMacroPercentages,
  calculateMealNutrition,
  calculateNutritionForQuantity,
  roundNutrientsForDisplay,
} from './nutrition';
import type { FoodItem, FoodLog } from '@/lib/types';

function food(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: 'f-rice',
    name: 'Cooked white rice',
    brand: '',
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: 130,
    protein_g: 2.7,
    carbs_g: 28,
    fat_g: 0.3,
    fiber_g: 0.4,
    sugar_g: 0.1,
    sodium_mg: 1,
    barcode: null,
    is_custom: false,
    created_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function log(overrides: Partial<FoodLog> = {}): FoodLog {
  return {
    id: `l-${Math.random().toString(36).slice(2)}`,
    user_id: 'u-1',
    food_item_id: 'f-rice',
    food_name: 'Cooked white rice',
    date: '2026-09-22',
    meal_type: 'lunch',
    servings: 1.8,
    quantity: 180,
    quantity_unit: 'g',
    calories: 234,
    protein_g: 4.86,
    carbs_g: 50.4,
    fat_g: 0.54,
    fiber_g: 0.72,
    sugar_g: 0.18,
    sodium_mg: 1.8,
    is_estimated: false,
    notes: '',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('calculateNutritionForQuantity', () => {
  it('computes exact values for 180 g of rice (per-100 g basis)', () => {
    const result = calculateNutritionForQuantity(food(), 180, 'g');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nutrition.calories).toBeCloseTo(234);
    expect(result.nutrition.protein_g).toBeCloseTo(4.86);
    expect(result.nutrition.carbs_g).toBeCloseTo(50.4);
    expect(result.nutrition.servings).toBeCloseTo(1.8);
    expect(result.nutrition.sugar_g).toBeCloseTo(0.18);
    expect(result.nutrition.sodium_mg).toBeCloseTo(1.8);
  });

  it('keeps full float precision (no early rounding)', () => {
    const result = calculateNutritionForQuantity(food(), 33, 'g');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 130 × 0.33 = 42.9 (float), NOT rounded to 43 yet.
    expect(result.nutrition.calories).toBeCloseTo(42.9, 10);
    expect(result.nutrition.calories).not.toBe(43);
  });

  it('scales count-based input (3 eggs × 50 g)', () => {
    const egg = food({ serving_size: 50, calories_per_serving: 72, protein_g: 6.3, carbs_g: 0.4, fat_g: 4.8, fiber_g: 0, count_weight_g: 50 });
    const result = calculateNutritionForQuantity(egg, 3, 'count');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nutrition.calories).toBeCloseTo(216);
    expect(result.nutrition.servings).toBeCloseTo(3);
  });

  it('propagates invalid quantities with reasons', () => {
    expect(calculateNutritionForQuantity(food(), 0, 'g').ok).toBe(false);
    const ml = calculateNutritionForQuantity(food(), 250, 'ml');
    expect(ml.ok).toBe(false);
  });

  it('emits null for unknown micros instead of zero', () => {
    const plain = food({ sugar_g: null, sodium_mg: null });
    const result = calculateNutritionForQuantity(plain, 100, 'g');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nutrition.sugar_g).toBeNull();
    expect(result.nutrition.sodium_mg).toBeNull();
  });
});

describe('roundNutrientsForDisplay', () => {
  it('rounds kcal to whole, macros to 1 decimal, sodium to whole mg', () => {
    const rounded = roundNutrientsForDisplay({
      calories: 234.4, protein_g: 4.86, carbs_g: 50.44, fat_g: 0.54,
      fiber_g: 0.72, sugar_g: 0.18, sodium_mg: 1.8,
    });
    expect(rounded).toMatchObject({
      calories: 234, protein_g: 4.9, carbs_g: 50.4, fat_g: 0.5,
      fiber_g: 0.7, sugar_g: 0.2, sodium_mg: 2,
    });
  });

  it('preserves nulls (unknown stays unknown)', () => {
    const rounded = roundNutrientsForDisplay({ calories: 100, protein_g: 1, carbs_g: 2, fat_g: 3, sugar_g: null, sodium_mg: null });
    expect(rounded.sugar_g).toBeNull();
    expect(rounded.sodium_mg).toBeNull();
  });
});

describe('calculateMealNutrition', () => {
  it('totals multiple foods in one meal', () => {
    const rows = [
      log({ meal_type: 'lunch', calories: 234, protein_g: 4.86, carbs_g: 50.4, fat_g: 0.54 }),
      log({ meal_type: 'lunch', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, sugar_g: null, sodium_mg: null }),
    ];
    const meal = calculateMealNutrition(rows, 'lunch');
    expect(meal).toMatchObject({ meal: 'lunch', count: 2, calories: 399, protein_g: 35.86 });
    // Only one row carries sugar/sodium — totals reflect known data.
    expect(meal.sugar_g).toBeCloseTo(0.18);
    expect(meal.sodium_mg).toBeCloseTo(1.8);
  });

  it('returns zeros and nulls for an empty meal', () => {
    const meal = calculateMealNutrition([log({ meal_type: 'lunch' })], 'dinner');
    expect(meal).toMatchObject({ count: 0, calories: 0, sugar_g: null, sodium_mg: null });
  });
});

describe('calculateDailyNutrition', () => {
  const targets = { calories: 2650, protein_g: 150, carbs_g: 300, fat_g: 80 };

  it('sums one local calendar date with targets', () => {
    const rows = [
      log({ date: '2026-09-22', meal_type: 'breakfast', calories: 200, protein_g: 10, carbs_g: 20, fat_g: 8 }),
      log({ date: '2026-09-22', meal_type: 'lunch', calories: 400, protein_g: 30, carbs_g: 40, fat_g: 12 }),
      log({ date: '2026-09-23', meal_type: 'breakfast', calories: 9999, protein_g: 999, carbs_g: 999, fat_g: 999 }),
    ];
    const day = calculateDailyNutrition(rows, '2026-09-22', targets);
    expect(day).toMatchObject({
      date: '2026-09-22', calories: 600, protein_g: 40, carbs_g: 60, fat_g: 20,
      target_calories: 2650, target_protein_g: 150,
    });
  });

  it('groups by date string exactly (no UTC shifting)', () => {
    // A log stamped 2026-09-22 must never leak into 2026-09-23, even across
    // timezone boundaries — grouping is pure string equality.
    const rows = [log({ date: '2026-09-22T23:59:00'.slice(0, 10) })];
    expect(calculateDailyNutrition(rows, '2026-09-22', targets).calories).toBe(234);
    expect(calculateDailyNutrition(rows, '2026-09-23', targets).calories).toBe(0);
  });
});

describe('calculateMacroPercentages', () => {
  it('splits calories by Atwater factors', () => {
    // P 25g (100) + C 50g (200) + F 10g (90) = 390
    const pct = calculateMacroPercentages({ calories: 390, protein_g: 25, carbs_g: 50, fat_g: 10 });
    expect(pct.protein_pct).toBeCloseTo(25.6, 1);
    expect(pct.carbs_pct).toBeCloseTo(51.3, 1);
    expect(pct.fat_pct).toBeCloseTo(23.1, 1);
  });

  it('returns zeros for empty nutrition', () => {
    expect(calculateMacroPercentages({ calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })).toEqual({
      protein_pct: 0, carbs_pct: 0, fat_pct: 0,
    });
  });
});
