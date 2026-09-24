import { describe, expect, it } from 'vitest';
import { favoriteFoodSchema, foodItemSchema, foodLogSchema } from './food';

describe('foodItemSchema (custom foods)', () => {
  it('accepts a complete homemade food with basis and optionals', () => {
    const parsed = foodItemSchema.safeParse({
      name: 'Homemade Paneer',
      serving_size: 100,
      serving_unit: 'g',
      calories_per_serving: 265,
      protein_g: 18,
      carbs_g: 6,
      fat_g: 20,
      fiber_g: 0,
      sugar_g: 3,
      sodium_mg: 18,
      category: 'protein',
      food_state: 'prepared',
      count_weight_g: null,
      is_estimated: false,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty names, negatives, NaN, and Infinity', () => {
    expect(foodItemSchema.safeParse({ name: '', calories_per_serving: 100 }).success).toBe(false);
    expect(foodItemSchema.safeParse({ name: '   ', calories_per_serving: 100 }).success).toBe(false);
    expect(foodItemSchema.safeParse({ name: 'X', calories_per_serving: -5 }).success).toBe(false);
    expect(foodItemSchema.safeParse({ name: 'X', calories_per_serving: 100, protein_g: -1 }).success).toBe(false);
    expect(foodItemSchema.safeParse({ name: 'X', calories_per_serving: NaN }).success).toBe(false);
    expect(foodItemSchema.safeParse({ name: 'X', calories_per_serving: Infinity }).success).toBe(false);
    expect(foodItemSchema.safeParse({ name: 'X', calories_per_serving: 100, sodium_mg: Infinity }).success).toBe(false);
  });

  it('fills safe defaults without blocking legitimate data', () => {
    const parsed = foodItemSchema.safeParse({ name: 'Dal', calories_per_serving: 120 });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      brand: '',
      serving_size: 1,
      serving_unit: 'serving',
      protein_g: 0,
      source: 'user',
      is_estimated: false,
    });
  });

  it('bounds aliases and text lengths', () => {
    expect(foodItemSchema.safeParse({ name: 'X', calories_per_serving: 10, aliases: Array(21).fill('a') }).success).toBe(false);
    expect(foodItemSchema.safeParse({ name: 'X', calories_per_serving: 10, category: 'ok' }).success).toBe(true);
  });
});

describe('foodLogSchema', () => {
  const base = {
    foodItemId: 'f-1',
    date: '2026-09-22',
    mealType: 'lunch',
    servings: 1.8,
    calories: 234,
    proteinG: 4.86,
    carbsG: 50.4,
    fatG: 0.54,
  } as const;

  it('accepts quantity-first logs with snapshot fields', () => {
    const parsed = foodLogSchema.safeParse({
      ...base,
      quantity: 180,
      quantityUnit: 'g',
      fiberG: 0.72,
      foodName: 'Cooked white rice',
      isEstimated: false,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects negative/invalid quantities and bad dates or meals', () => {
    expect(foodLogSchema.safeParse({ ...base, quantity: -10, quantityUnit: 'g' }).success).toBe(false);
    expect(foodLogSchema.safeParse({ ...base, quantityUnit: 'bowls' }).success).toBe(false);
    expect(foodLogSchema.safeParse({ ...base, date: '22-09-2026' }).success).toBe(false);
    expect(foodLogSchema.safeParse({ ...base, mealType: 'brunch' }).success).toBe(false);
    expect(foodLogSchema.safeParse({ ...base, servings: Infinity }).success).toBe(false);
  });
});

describe('favoriteFoodSchema', () => {
  it('accepts food ids and rejects empties', () => {
    expect(favoriteFoodSchema.safeParse({ foodId: 'food-7' }).success).toBe(true);
    expect(favoriteFoodSchema.safeParse({ foodId: '' }).success).toBe(false);
  });
});
