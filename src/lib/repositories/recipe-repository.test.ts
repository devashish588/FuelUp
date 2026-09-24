import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { FoodItem, Recipe, RecipeIngredient } from '@/lib/types';
import { saveCustomFood } from './nutrition-repository';
import {
  getRecipeBundle,
  listAllIngredients,
  listIngredientsForRecipe,
  listRecipes,
  removeRecipeBundle,
  saveRecipeBundle,
} from './recipe-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

const now = () => new Date().toISOString();

function chicken(id = 'ch-1', calories = 165): FoodItem {
  return {
    id,
    name: 'Chicken breast',
    brand: '',
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: calories,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
    fiber_g: 0,
    barcode: null,
    is_custom: true,
    created_by: null,
    created_at: now(),
  };
}

function recipe(id = 'r-1'): Recipe {
  return {
    id,
    user_id: OWNER_A,
    food_item_id: id,
    name: 'Chicken Curry',
    description: '',
    category: 'curry',
    preparation: 'curry',
    yield_quantity: 760,
    yield_unit: 'g',
    serving_quantity: 190,
    serving_description: '1 bowl ≈ 190 g',
    source: 'user',
    is_estimated: false,
    created_at: now(),
    updated_at: now(),
  };
}

function ingredient(id: string, foodId: string, quantity: number): RecipeIngredient {
  return {
    id,
    recipe_id: 'r-1',
    user_id: OWNER_A,
    food_id: foodId,
    food_name: 'Chicken breast',
    quantity,
    quantity_unit: 'g',
    sort_order: 0,
    notes: '',
    created_at: now(),
  };
}

function materialized(id = 'r-1'): FoodItem {
  return {
    ...chicken(id),
    name: 'Chicken Curry',
    serving_size: 100,
    calories_per_serving: 152.6,
    source: 'recipe',
    source_id: id,
  };
}

describe('recipe repository', () => {
  it('saves a recipe bundle atomically (recipe + ingredients + food item)', async () => {
    await saveCustomFood(OWNER_A, chicken(), db);
    await saveRecipeBundle(OWNER_A, {
      recipe: recipe(),
      ingredients: [ingredient('i-1', 'ch-1', 500), ingredient('i-2', 'ch-1', 260)],
      foodItem: materialized(),
      removedIngredientIds: [],
    }, db);

    expect(await listRecipes(OWNER_A, db)).toHaveLength(1);
    expect(await listIngredientsForRecipe(OWNER_A, 'r-1', db)).toHaveLength(2);
    expect(await listAllIngredients(OWNER_A, db)).toHaveLength(2);
    expect(await listRecipes(OWNER_B, db)).toHaveLength(0);
    const bundle = await getRecipeBundle(OWNER_A, 'r-1', db);
    expect(bundle?.recipe.name).toBe('Chicken Curry');
    expect(bundle?.ingredients.map((r) => r.id).sort()).toEqual(['i-1', 'i-2']);
    expect(await getRecipeBundle(OWNER_B, 'r-1', db)).toBeNull();
  });

  it('replaces the ingredient set on edit and tombstones removed ids', async () => {
    await saveRecipeBundle(OWNER_A, {
      recipe: recipe(),
      ingredients: [ingredient('i-1', 'ch-1', 500), ingredient('i-2', 'ch-1', 260)],
      foodItem: materialized(),
      removedIngredientIds: [],
    }, db);
    await saveRecipeBundle(OWNER_A, {
      recipe: { ...recipe(), name: 'Chicken Curry v2' },
      ingredients: [ingredient('i-3', 'ch-1', 760)],
      foodItem: { ...materialized(), name: 'Chicken Curry v2' },
      removedIngredientIds: ['i-1', 'i-2'],
    }, db);

    expect((await listIngredientsForRecipe(OWNER_A, 'r-1', db)).map((r) => r.id)).toEqual(['i-3']);
    const outbox = await db.outbox.where('[ownerId+status]').equals([OWNER_A, 'pending']).toArray();
    const deletes = outbox.filter((e) => e.operation === 'delete').map((e) => `${e.entity}:${e.entityId}`).sort();
    expect(deletes).toContain('recipeIngredient:i-1');
    expect(deletes).toContain('recipeIngredient:i-2');
  });

  it('duplicates by saving the same structure under new ids (original untouched)', async () => {
    await saveRecipeBundle(OWNER_A, {
      recipe: recipe(),
      ingredients: [ingredient('i-1', 'ch-1', 500)],
      foodItem: materialized(),
      removedIngredientIds: [],
    }, db);
    const bundle = await getRecipeBundle(OWNER_A, 'r-1', db);
    expect(bundle).not.toBeNull();
    await saveRecipeBundle(OWNER_A, {
      recipe: { ...recipe('r-2'), name: 'Chicken Curry — High Protein' },
      ingredients: [{ ...ingredient('i-9', 'ch-1', 500), recipe_id: 'r-2' }],
      foodItem: { ...materialized('r-2'), name: 'Chicken Curry — High Protein' },
      removedIngredientIds: [],
    }, db);

    expect((await listRecipes(OWNER_A, db)).map((r) => r.id).sort()).toEqual(['r-1', 'r-2']);
    expect((await getRecipeBundle(OWNER_A, 'r-1', db))?.recipe.name).toBe('Chicken Curry');
  });

  it('deletes the bundle but keeps historical food logs intact', async () => {
    await saveRecipeBundle(OWNER_A, {
      recipe: recipe(),
      ingredients: [ingredient('i-1', 'ch-1', 500)],
      foodItem: materialized(),
      removedIngredientIds: [],
    }, db);
    const { addFoodLog, listFoodLogsForDate } = await import('./nutrition-repository');
    await addFoodLog(OWNER_A, {
      id: 'fl-1',
      user_id: OWNER_A,
      food_item_id: 'r-1',
      food_name: 'Chicken Curry',
      date: '2026-09-22',
      meal_type: 'dinner',
      servings: 2.3,
      quantity: 230,
      quantity_unit: 'g',
      calories: 351,
      protein_g: 30,
      carbs_g: 5,
      fat_g: 20,
      notes: '',
      created_at: now(),
    }, db);

    await removeRecipeBundle(OWNER_A, 'r-1', db);
    expect(await listRecipes(OWNER_A, db)).toHaveLength(0);
    expect(await listIngredientsForRecipe(OWNER_A, 'r-1', db)).toHaveLength(0);
    // History survives with its frozen snapshot.
    const logs = await listFoodLogsForDate(OWNER_A, '2026-09-22', db);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ food_name: 'Chicken Curry', calories: 351 });
    // All three deletions are queued for sync.
    const outbox = await db.outbox.where('[ownerId+status]').equals([OWNER_A, 'pending']).toArray();
    const deletes = outbox.filter((e) => e.operation === 'delete').map((e) => `${e.entity}:${e.entityId}`).sort();
    expect(deletes).toContain('recipe:r-1');
    expect(deletes).toContain('foodItem:r-1');
    expect(deletes).toContain('recipeIngredient:i-1');
  });

  it('is a cross-owner no-op on save and delete', async () => {
    await saveRecipeBundle(OWNER_A, {
      recipe: recipe(),
      ingredients: [ingredient('i-1', 'ch-1', 500)],
      foodItem: materialized(),
      removedIngredientIds: [],
    }, db);
    await removeRecipeBundle(OWNER_B, 'r-1', db);
    expect(await listRecipes(OWNER_A, db)).toHaveLength(1);
    await saveRecipeBundle(OWNER_B, {
      recipe: { ...recipe(), name: 'Hijacked' },
      ingredients: [],
      foodItem: materialized(),
      removedIngredientIds: [],
    }, db);
    expect((await getRecipeBundle(OWNER_A, 'r-1', db))?.recipe.name).toBe('Chicken Curry');
  });

  it('enqueues outbox events offline without network', async () => {
    await saveRecipeBundle(OWNER_A, {
      recipe: recipe(),
      ingredients: [ingredient('i-1', 'ch-1', 500)],
      foodItem: materialized(),
      removedIngredientIds: [],
    }, db);
    const pending = await db.outbox.where('[ownerId+status]').equals([OWNER_A, 'pending']).toArray();
    const keys = pending.map((e) => `${e.entity}:${e.entityId}:${e.operation}`).sort();
    expect(keys).toContain('recipe:r-1:upsert');
    expect(keys).toContain('foodItem:r-1:upsert');
    expect(keys).toContain('recipeIngredient:i-1:upsert');
  });

  it('mandatory snapshot integrity: food edits never rewrite logged history', async () => {
    // Chicken at 165 kcal/100g → recipe → log 200 g (330 kcal).
    await saveCustomFood(OWNER_A, chicken('ch-1', 165), db);
    await saveRecipeBundle(OWNER_A, {
      recipe: recipe(),
      ingredients: [ingredient('i-1', 'ch-1', 760)],
      foodItem: { ...materialized(), calories_per_serving: 165 },
      removedIngredientIds: [],
    }, db);
    const { addFoodLog, listFoodLogsForDate } = await import('./nutrition-repository');
    await addFoodLog(OWNER_A, {
      id: 'fl-old',
      user_id: OWNER_A,
      food_item_id: 'r-1',
      food_name: 'Chicken Curry',
      date: '2026-09-22',
      meal_type: 'dinner',
      servings: 2,
      quantity: 200,
      quantity_unit: 'g',
      calories: 330,
      protein_g: 62,
      carbs_g: 0,
      fat_g: 7.2,
      notes: '',
      created_at: now(),
    }, db);

    // Six months later the chicken data is corrected to 180.
    await saveCustomFood(OWNER_A, chicken('ch-1', 180), db);

    // Old log is frozen…
    const logs = await listFoodLogsForDate(OWNER_A, '2026-09-22', db);
    expect(logs[0]).toMatchObject({ calories: 330, protein_g: 62 });
    // …and a new log uses the new calculation (200 g × 180 / 100).
    await addFoodLog(OWNER_A, {
      id: 'fl-new',
      user_id: OWNER_A,
      food_item_id: 'r-1',
      food_name: 'Chicken Curry',
      date: '2026-09-22',
      meal_type: 'dinner',
      servings: 2,
      quantity: 200,
      quantity_unit: 'g',
      calories: 360,
      protein_g: 67.6,
      carbs_g: 0,
      fat_g: 7.9,
      notes: '',
      created_at: now(),
    }, db);
    const both = await listFoodLogsForDate(OWNER_A, '2026-09-22', db);
    expect(both.find((l) => l.id === 'fl-old')).toMatchObject({ calories: 330 });
    expect(both.find((l) => l.id === 'fl-new')).toMatchObject({ calories: 360 });
  });
});
