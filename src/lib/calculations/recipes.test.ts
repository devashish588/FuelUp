import { describe, expect, it } from 'vitest';
import {
  calculateRecipeNutrition,
  calculateRecipePer100g,
  materializeRecipeFoodItem,
  servingNutrition,
  validateYield,
  type ResolvedIngredient,
} from './recipes';
import type { FoodItem, RecipeIngredient } from '@/lib/types';

function food(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: 'f-1',
    name: 'Ingredient',
    brand: '',
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: 100,
    protein_g: 10,
    carbs_g: 10,
    fat_g: 5,
    fiber_g: 2,
    sugar_g: 1,
    sodium_mg: 10,
    barcode: null,
    is_custom: false,
    created_by: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function resolved(
  id: string,
  f: FoodItem,
  quantity: number,
  unit: 'g' | 'kg' | 'ml' | 'L' | 'count' | 'serving' = 'g'
): ResolvedIngredient {
  return {
    ingredient: {
      id,
      recipe_id: 'r-1',
      user_id: 'u-1',
      food_id: f.id,
      food_name: f.name,
      quantity,
      quantity_unit: unit,
      sort_order: 0,
      notes: '',
      created_at: '',
    } satisfies RecipeIngredient,
    food: f,
  };
}

describe('calculateRecipeNutrition', () => {
  it('sums ingredient contributions via the quantity engine', () => {
    const totals = calculateRecipeNutrition([
      resolved('i-1', food({ calories_per_serving: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, sugar_g: null, sodium_mg: null }), 500, 'g'),
      resolved('i-2', food({ calories_per_serving: 884, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: 0, sugar_g: null, sodium_mg: null }), 20, 'g'),
    ]);
    expect(totals.calories).toBeCloseTo(825 + 176.8, 6);
    expect(totals.protein_g).toBeCloseTo(155, 6);
    expect(totals.fat_g).toBeCloseTo(18 + 20, 6);
    expect(totals.is_estimated).toBe(false);
    expect(totals.unresolved).toEqual([]);
  });

  it('marks the recipe estimated when any ingredient is estimated', () => {
    const totals = calculateRecipeNutrition([
      resolved('i-1', food(), 100, 'g'),
      resolved('i-2', food({ is_estimated: true }), 100, 'g'),
    ]);
    expect(totals.is_estimated).toBe(true);
  });

  it('keeps sugar/sodium null unless some ingredient carries them', () => {
    const none = calculateRecipeNutrition([
      resolved('i-1', food({ sugar_g: null, sodium_mg: null }), 100, 'g'),
    ]);
    expect(none.sugar_g).toBeNull();
    expect(none.sodium_mg).toBeNull();
    const some = calculateRecipeNutrition([
      resolved('i-1', food({ sugar_g: null, sodium_mg: null }), 100, 'g'),
      resolved('i-2', food({ sugar_g: 5, sodium_mg: 50 }), 100, 'g'),
    ]);
    expect(some.sugar_g).toBeCloseTo(5);
    expect(some.sodium_mg).toBeCloseTo(50);
  });

  it('treats explicit zero-calorie ingredients as zero (documented rule)', () => {
    const totals = calculateRecipeNutrition([
      resolved('i-1', food(), 100, 'g'),
      resolved('i-2', food({ name: 'Water', calories_per_serving: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }), 500, 'g'),
    ]);
    expect(totals.calories).toBeCloseTo(100, 6);
  });

  it('reports unresolvable ingredients instead of zero-filling', () => {
    const totals = calculateRecipeNutrition([
      resolved('i-1', food(), 100, 'g'),
      // ml input against a gram-basis food cannot normalize.
      resolved('i-2', food(), 250, 'ml'),
    ]);
    expect(totals.unresolved).toEqual(['i-2']);
    expect(totals.calories).toBeCloseTo(100, 6);
  });

  it('handles a single ingredient and an empty list', () => {
    const single = calculateRecipeNutrition([resolved('i-1', food(), 200, 'g')]);
    expect(single.calories).toBeCloseTo(200, 6);
    const empty = calculateRecipeNutrition([]);
    expect(empty).toMatchObject({ calories: 0, protein_g: 0, sugar_g: null, sodium_mg: null, unresolved: [] });
  });
});

describe('calculateRecipePer100g', () => {
  it('derives per-100g from totals and explicit cooked yield', () => {
    const per100 = calculateRecipePer100g(
      { calories: 1280, protein_g: 100, carbs_g: 80, fat_g: 60, fiber_g: 10, sugar_g: 4, sodium_mg: 800 },
      760
    );
    expect(per100).not.toBeNull();
    expect(per100!.calories).toBeCloseTo(168.42, 1);
    expect(per100!.protein_g).toBeCloseTo(13.16, 1);
    expect(per100!.sodium_mg).toBeCloseTo(105.26, 1);
  });

  it('supports yields larger than raw weight (water absorption) and smaller (cooking loss)', () => {
    const totals = { calories: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, fiber_g: 5, sugar_g: null, sodium_mg: null };
    expect(calculateRecipePer100g(totals, 1200)!.calories).toBeCloseTo(83.33, 1);
    expect(calculateRecipePer100g(totals, 500)!.calories).toBeCloseTo(200, 6);
  });

  it('rejects zero, negative, and non-finite yields (divide-by-zero guard)', () => {
    const totals = { calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0, sugar_g: null, sodium_mg: null };
    expect(calculateRecipePer100g(totals, 0)).toBeNull();
    expect(calculateRecipePer100g(totals, -10)).toBeNull();
    expect(calculateRecipePer100g(totals, NaN)).toBeNull();
  });
});

describe('servingNutrition', () => {
  it('scales per-100 nutrition to a household serving', () => {
    const portion = servingNutrition(
      { calories: 168.4, protein_g: 13.2, carbs_g: 10, fat_g: 8, fiber_g: 1, sugar_g: 0.5, sodium_mg: 100 },
      190
    );
    expect(portion).not.toBeNull();
    expect(portion!.calories).toBeCloseTo(320, 0);
    expect(portion!.protein_g).toBeCloseTo(25.1, 1);
  });

  it('rejects invalid serving sizes', () => {
    const per100 = { calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0, sugar_g: null, sodium_mg: null };
    expect(servingNutrition(per100, 0)).toBeNull();
    expect(servingNutrition(per100, NaN)).toBeNull();
  });
});

describe('validateYield', () => {
  it('accepts positive yields and rejects the rest with reasons', () => {
    expect(validateYield(760)).toEqual({ ok: true });
    expect(validateYield(0).ok).toBe(false);
    expect(validateYield(-5).ok).toBe(false);
    expect(validateYield(NaN).ok).toBe(false);
    const r = validateYield(0);
    if (!r.ok) expect(typeof r.reason).toBe('string');
  });
});

describe('materializeRecipeFoodItem', () => {
  it('emits a per-100 FoodItem sharing the recipe id', () => {
    const item = materializeRecipeFoodItem(
      { id: 'r-1', name: 'Chicken Curry', category: 'curry', preparation: 'curry', serving_description: '1 bowl ≈ 190 g', is_estimated: true, created_at: '2026-01-01T00:00:00.000Z' },
      { calories: 168.4, protein_g: 13.2, carbs_g: 10, fat_g: 8, fiber_g: 1, sugar_g: 0.5, sodium_mg: 100 },
      'g'
    );
    expect(item).toMatchObject({
      id: 'r-1',
      name: 'Chicken Curry',
      serving_size: 100,
      serving_unit: 'g',
      source: 'recipe',
      source_id: 'r-1',
      is_custom: true,
      is_estimated: true,
    });
    expect(item.calories_per_serving).toBeCloseTo(168.4);
  });
});

describe('acceptance: chicken curry (Phase 6 §38 math)', () => {
  const chicken = food({ name: 'Chicken breast', calories_per_serving: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, sugar_g: null, sodium_mg: 60 });
  const oil = food({ name: 'Oil', calories_per_serving: 884, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: 0, sugar_g: null, sodium_mg: null });
  const onion = food({ name: 'Onion', calories_per_serving: 40, protein_g: 1.1, carbs_g: 9, fat_g: 0, fiber_g: 1.7, sugar_g: null, sodium_mg: 4 });
  const tomato = food({ name: 'Tomato', calories_per_serving: 17.9, protein_g: 0.9, carbs_g: 3.9, fat_g: 0.2, fiber_g: 1.2, sugar_g: null, sodium_mg: 4 });
  const curd = food({ name: 'Curd', calories_per_serving: 62, protein_g: 3.5, carbs_g: 4.7, fat_g: 3.3, fiber_g: 0, sugar_g: null, sodium_mg: 40 });
  const spices = food({ name: 'Spices', calories_per_serving: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: null, sodium_mg: null });

  const inputs: [string, FoodItem, number][] = [
    ['i-1', chicken, 500],
    ['i-2', oil, 20],
    ['i-3', onion, 150],
    ['i-4', tomato, 200],
    ['i-5', curd, 100],
    ['i-6', spices, 15],
  ];

  it('totals 500/20/150/200/100/15 g correctly', () => {
    const totals = calculateRecipeNutrition(inputs.map(([id, f, q]) => resolved(id, f, q)));
    expect(totals.unresolved).toEqual([]);
    // 825 + 176.8 + 60 + 35.8 + 62 + 0
    expect(totals.calories).toBeCloseTo(1159.6, 1);
    expect(totals.protein_g).toBeCloseTo(155 + 0 + 1.65 + 1.8 + 3.5, 1);
    expect(totals.is_estimated).toBe(false);
  });

  it('derives per-100g from the 760 g yield and prices a 230 g portion', () => {
    const totals = calculateRecipeNutrition(inputs.map(([id, f, q]) => resolved(id, f, q)));
    const per100 = calculateRecipePer100g(totals, 760);
    expect(per100).not.toBeNull();
    expect(per100!.calories).toBeCloseTo(152.6, 1);
    const portion = servingNutrition(per100!, 230)!;
    expect(portion.calories).toBeCloseTo(351, 0);
    expect(portion.protein_g).toBeCloseTo((per100!.protein_g * 230) / 100, 6);
  });
});
