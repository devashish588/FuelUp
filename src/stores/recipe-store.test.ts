// Recipe store: save/edit/duplicate/remove with calorie-mirror Materialization.
// Pure in-memory paths (no owner) — persistence + sync covered by
// repository + engine tests.
import { beforeEach, describe, expect, it } from 'vitest';
import { useCalorieStore } from './calorie-store';
import { previewRecipeDraft, useRecipeStore, type RecipeDraft } from './recipe-store';
import { FOOD_DATABASE } from '@/lib/constants/food-database';
import type { FoodItem } from '@/lib/types';

function seedFoods(): FoodItem[] {
  return FOOD_DATABASE.map((item, i) => ({
    ...item,
    id: `food-${i}`,
    created_at: new Date().toISOString(),
    created_by: null,
  }));
}

function chicken(): FoodItem {
  return {
    id: 'ch-1',
    name: 'Chicken breast',
    brand: '',
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
    fiber_g: 0,
    barcode: null,
    is_custom: true,
    created_by: null,
    created_at: new Date().toISOString(),
  };
}

function draft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    name: 'Chicken Curry',
    description: '',
    category: 'curry',
    preparation: 'curry',
    yield_quantity: 760,
    yield_unit: 'g',
    serving_quantity: 190,
    serving_description: '1 bowl ≈ 190 g',
    ingredients: [{ food_id: 'ch-1', quantity: 500, quantity_unit: 'g', notes: '' }],
    ...overrides,
  };
}

beforeEach(() => {
  useCalorieStore.setState({
    foodItems: [...seedFoods(), chicken()],
    foodLogs: [],
    favorites: [],
    ownerId: null,
    ready: true,
    lastError: null,
  });
  useRecipeStore.setState({ recipes: [], ingredients: [], ownerId: null, ready: true, lastError: null });
});

describe('recipe store', () => {
  it('saves a recipe and materializes a per-100 food item in the mirror', () => {
    const result = useRecipeStore.getState().saveRecipe(null, draft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = useRecipeStore.getState().getRecipeFoodItem(result.recipeId);
    expect(item).toMatchObject({ source: 'recipe', serving_size: 100, serving_unit: 'g' });
    expect(item?.calories_per_serving).toBeCloseTo(108.6, 1); // 825 / 760 * 100
    // Searchable through the existing food search UX (alongside the seed curry).
    const hits = useCalorieStore.getState().searchFoodItems('chicken curry');
    expect(hits.map((f) => f.id)).toContain(result.recipeId);
  });

  it('rejects unnamed recipes and bad yields with reasons', () => {
    expect(useRecipeStore.getState().saveRecipe(null, draft({ name: '  ' }))).toMatchObject({ ok: false });
    expect(useRecipeStore.getState().saveRecipe(null, draft({ yield_quantity: 0 }))).toMatchObject({ ok: false });
    expect(useRecipeStore.getState().saveRecipe(null, draft({ ingredients: [] }))).toMatchObject({ ok: false });
    expect(useRecipeStore.getState().recipes).toHaveLength(0);
  });

  it('edits without touching the recipe id and duplicates under a new id', () => {
    const created = useRecipeStore.getState().saveRecipe(null, draft());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.recipeId;

    useRecipeStore.getState().saveRecipe(id, draft({ name: 'Chicken Curry v2', yield_quantity: 800 }));
    expect(useRecipeStore.getState().recipes).toHaveLength(1);
    expect(useRecipeStore.getState().recipes[0]).toMatchObject({ id, name: 'Chicken Curry v2', yield_quantity: 800 });

    useRecipeStore.getState().duplicateRecipe(id, 'Chicken Curry — High Protein');
    const names = useRecipeStore.getState().recipes.map((r) => r.name).sort();
    expect(names).toEqual(['Chicken Curry v2', 'Chicken Curry — High Protein']);
    // Duplicate carries the same ingredient structure under new ids.
    const copy = useRecipeStore.getState().recipes.find((r) => r.id !== id);
    expect(useRecipeStore.getState().getIngredients(copy!.id)).toHaveLength(1);
    expect(useRecipeStore.getState().getIngredients(copy!.id)[0].food_id).toBe('ch-1');
  });

  it('removes the recipe, its ingredients, and its mirror item', () => {
    const created = useRecipeStore.getState().saveRecipe(null, draft());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    useRecipeStore.getState().removeRecipe(created.recipeId);
    expect(useRecipeStore.getState().recipes).toHaveLength(0);
    expect(useRecipeStore.getState().getIngredients(created.recipeId)).toHaveLength(0);
    expect(useCalorieStore.getState().foodItems.find((f) => f.id === created.recipeId)).toBeUndefined();
  });

  it('previews totals and per-100 without saving', () => {
    const preview = previewRecipeDraft(draft(), [...seedFoods(), chicken()]);
    expect(preview.totals.calories).toBeCloseTo(825, 6);
    expect(preview.per100?.calories).toBeCloseTo(108.6, 1);
  });
});
