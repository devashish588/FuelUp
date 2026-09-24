// =============================================
// FuelUp - Recipe repository (IndexedDB)
// A saved recipe persists as three linked rows sharing one id space:
// Recipe + RecipeIngredient[] + the materialized FoodItem (source='recipe',
// same id, per-100 basis). All three write in ONE transaction; outbox
// events enqueue per entity so Phase 3 sync replays them independently.
// Historical FoodLogs are separate rows and are never touched here.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { FoodItem, Recipe, RecipeIngredient } from '@/lib/types';
import { enqueueSyncEvent } from '@/lib/sync/outbox';
import { omitOwner, repoContext, repoError } from './base';

function strip<T extends { ownerId: string }>(row: T): Omit<T, 'ownerId'> {
  return omitOwner(row);
}

export interface RecipeBundleInput {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  /** Materialized per-100 FoodItem (id === recipe.id). */
  foodItem: FoodItem;
  /** Ingredient ids replaced by this save (tombstoned on sync). */
  removedIngredientIds: string[];
}

export async function listRecipes(ownerId: string, db?: FuelUpLocalDb): Promise<Recipe[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.recipes.where('ownerId').equals(o).toArray();
    return rows.map((r) => strip(r) as Recipe);
  } catch (error) {
    repoError('recipes', 'load', error);
  }
}

export async function listIngredientsForRecipe(
  ownerId: string,
  recipeId: string,
  db?: FuelUpLocalDb
): Promise<RecipeIngredient[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.recipeIngredients
      .where('[ownerId+recipe_id]')
      .equals([o, recipeId])
      .toArray();
    return rows
      .map((r) => strip(r) as RecipeIngredient)
      .sort((a, b) => a.sort_order - b.sort_order);
  } catch (error) {
    repoError('recipe ingredients', 'load', error);
  }
}

export async function listAllIngredients(ownerId: string, db?: FuelUpLocalDb): Promise<RecipeIngredient[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.recipeIngredients.where('[ownerId+recipe_id]').between([o, ''], [o, '￿']).toArray();
    return rows.map((r) => strip(r) as RecipeIngredient);
  } catch (error) {
    repoError('recipe ingredients', 'load', error);
  }
}

export async function getRecipeBundle(
  ownerId: string,
  recipeId: string,
  db?: FuelUpLocalDb
): Promise<{ recipe: Recipe; ingredients: RecipeIngredient[] } | null> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.recipes.get(recipeId);
    if (!row || row.ownerId !== o) return null;
    const ingredients = await listIngredientsForRecipe(o, recipeId, d);
    return { recipe: strip(row) as Recipe, ingredients };
  } catch (error) {
    repoError('recipe', 'load', error);
  }
}

/**
 * Save a recipe + replace its ingredient set + materialize the FoodItem,
 * atomically. Removed ingredient ids are tombstoned for sync. Historical
 * FoodLogs are separate rows and are never modified.
 */
export async function saveRecipeBundle(
  ownerId: string,
  input: RecipeBundleInput,
  db?: FuelUpLocalDb
): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const existing = await d.recipes.get(input.recipe.id);
    // Never overwrite another owner's row (ids are uuids; defensive).
    if (existing && existing.ownerId !== o) return;
    await d.transaction('rw', [d.recipes, d.recipeIngredients, d.foodItems], async () => {
      await d.recipes.put({ ...input.recipe, user_id: o, ownerId: o });
      await d.recipeIngredients.where('[ownerId+recipe_id]').equals([o, input.recipe.id]).delete();
      if (input.ingredients.length > 0) {
        await d.recipeIngredients.bulkPut(
          input.ingredients.map((ing, i) => ({ ...ing, recipe_id: input.recipe.id, user_id: o, sort_order: i, ownerId: o }))
        );
      }
      await d.foodItems.put({ ...input.foodItem, id: input.recipe.id, ownerId: o });
    });
    await enqueueSyncEvent(o, { entity: 'recipe', entityId: input.recipe.id, operation: 'upsert', payload: { ...input.recipe } }, d);
    await enqueueSyncEvent(o, { entity: 'foodItem', entityId: input.recipe.id, operation: 'upsert', payload: { ...input.foodItem, id: input.recipe.id } }, d);
    for (const ing of input.ingredients) {
      await enqueueSyncEvent(o, { entity: 'recipeIngredient', entityId: ing.id, operation: 'upsert', payload: { ...ing } }, d);
    }
    for (const removedId of input.removedIngredientIds) {
      await enqueueSyncEvent(o, { entity: 'recipeIngredient', entityId: removedId, operation: 'delete', payload: { id: removedId } }, d);
    }
  } catch (error) {
    repoError('recipe', 'save', error);
  }
}

/**
 * Delete a recipe + its ingredients + its materialized FoodItem. Historical
 * FoodLogs keep their frozen snapshots and stay visible. Each deletion is
 * journaled via its own outbox event (tombstones on sync).
 */
export async function removeRecipeBundle(
  ownerId: string,
  recipeId: string,
  db?: FuelUpLocalDb
): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.recipes.get(recipeId);
    if (!row || row.ownerId !== o) return;
    const ingredients = await d.recipeIngredients.where('[ownerId+recipe_id]').equals([o, recipeId]).toArray();
    const item = await d.foodItems.get(recipeId);
    await d.transaction('rw', [d.recipes, d.recipeIngredients, d.foodItems], async () => {
      await d.recipeIngredients.where('[ownerId+recipe_id]').equals([o, recipeId]).delete();
      await d.recipes.delete(recipeId);
      if (item && item.ownerId === o) await d.foodItems.delete(recipeId);
    });
    await enqueueSyncEvent(o, { entity: 'recipe', entityId: recipeId, operation: 'delete', payload: { id: recipeId } }, d);
    await enqueueSyncEvent(o, { entity: 'foodItem', entityId: recipeId, operation: 'delete', payload: { id: recipeId } }, d);
    for (const ing of ingredients) {
      await enqueueSyncEvent(o, { entity: 'recipeIngredient', entityId: ing.id, operation: 'delete', payload: { id: ing.id } }, d);
    }
  } catch (error) {
    repoError('recipe', 'delete', error);
  }
}
