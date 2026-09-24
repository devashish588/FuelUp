import { describe, expect, it } from 'vitest';
import { recipeIngredientSchema, recipeSchema } from './recipe';

const ingredient = (overrides: Record<string, unknown> = {}) => ({
  food_id: 'f-1',
  quantity: 500,
  quantity_unit: 'g',
  ...overrides,
});

const recipe = (overrides: Record<string, unknown> = {}) => ({
  name: 'Chicken Curry',
  yield_quantity: 760,
  yield_unit: 'g',
  ingredients: [ingredient()],
  ...overrides,
});

describe('recipeSchema', () => {
  it('accepts a complete home-cooked recipe', () => {
    const parsed = recipeSchema.safeParse(recipe({
      description: 'Weeknight curry',
      category: 'curry',
      preparation: 'curry',
      serving_quantity: 190,
      serving_description: '1 bowl ≈ 190 g',
    }));
    expect(parsed.success).toBe(true);
  });

  it('accepts a recipe with no serving definition', () => {
    expect(recipeSchema.safeParse(recipe({ serving_quantity: null })).success).toBe(true);
    expect(recipeSchema.safeParse(recipe()).success).toBe(true);
  });

  it('rejects blank names and empty ingredient lists', () => {
    expect(recipeSchema.safeParse(recipe({ name: '' })).success).toBe(false);
    expect(recipeSchema.safeParse(recipe({ name: '   ' })).success).toBe(false);
    expect(recipeSchema.safeParse(recipe({ ingredients: [] })).success).toBe(false);
  });

  it('rejects zero, negative, NaN, and infinite yields (divide-by-zero guard)', () => {
    for (const bad of [0, -760, NaN, Infinity]) {
      expect(recipeSchema.safeParse(recipe({ yield_quantity: bad })).success).toBe(false);
    }
  });

  it('rejects invalid yield units and serving sizes', () => {
    expect(recipeSchema.safeParse(recipe({ yield_unit: 'bowls' })).success).toBe(false);
    expect(recipeSchema.safeParse(recipe({ serving_quantity: 0 })).success).toBe(false);
    expect(recipeSchema.safeParse(recipe({ serving_quantity: Infinity })).success).toBe(false);
  });
});

describe('recipeIngredientSchema', () => {
  it('accepts grams, servings, and count where supported', () => {
    for (const unit of ['g', 'kg', 'ml', 'L', 'count', 'serving']) {
      expect(recipeIngredientSchema.safeParse(ingredient({ quantity_unit: unit })).success).toBe(true);
    }
  });

  it('rejects negative/zero/NaN quantities, bad units, and missing foods', () => {
    expect(recipeIngredientSchema.safeParse(ingredient({ quantity: 0 })).success).toBe(false);
    expect(recipeIngredientSchema.safeParse(ingredient({ quantity: -5 })).success).toBe(false);
    expect(recipeIngredientSchema.safeParse(ingredient({ quantity: NaN })).success).toBe(false);
    expect(recipeIngredientSchema.safeParse(ingredient({ quantity: Infinity })).success).toBe(false);
    expect(recipeIngredientSchema.safeParse(ingredient({ quantity_unit: 'bowls' })).success).toBe(false);
    expect(recipeIngredientSchema.safeParse(ingredient({ food_id: '' })).success).toBe(false);
  });
});
