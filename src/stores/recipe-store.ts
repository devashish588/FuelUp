'use client';
import { create } from 'zustand';
import type { FoodItem, QuantityUnit, Recipe, RecipeIngredient, RecipeYieldUnit } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { LOCAL_OWNER_ID } from '@/config/app';
import { availableUnitsFor } from '@/lib/calculations/quantity';
import {
  calculateRecipeNutrition,
  calculateRecipePer100g,
  materializeRecipeFoodItem,
  validateYield,
  type ResolvedIngredient,
} from '@/lib/calculations/recipes';
import {
  listAllIngredients,
  listRecipes,
  removeRecipeBundle,
  saveRecipeBundle,
} from '@/lib/repositories/recipe-repository';
import { useCalorieStore } from './calorie-store';
import { writeThrough } from './write-through';

export interface RecipeDraftIngredient {
  food_id: string;
  quantity: number;
  quantity_unit: QuantityUnit;
  notes: string;
}

export interface RecipeDraft {
  name: string;
  description: string;
  category: string;
  preparation: string;
  yield_quantity: number;
  yield_unit: RecipeYieldUnit;
  serving_quantity: number | null;
  serving_description: string;
  ingredients: RecipeDraftIngredient[];
}

interface RecipeState {
  recipes: Recipe[];
  ingredients: RecipeIngredient[];
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
  /** Create or update a recipe (recalculates + materializes the FoodItem). */
  saveRecipe: (recipeId: string | null, draft: RecipeDraft) => { ok: true; recipeId: string } | { ok: false; reason: string };
  removeRecipe: (recipeId: string) => void;
  duplicateRecipe: (recipeId: string, name: string) => void;
  getIngredients: (recipeId: string) => RecipeIngredient[];
  getRecipeFoodItem: (recipeId: string) => FoodItem | undefined;
}

interface BuiltPreview {
  totals: ReturnType<typeof calculateRecipeNutrition>;
  per100: ReturnType<typeof calculateRecipePer100g>;
}

function buildPreview(draft: RecipeDraft, foods: FoodItem[]): BuiltPreview {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const resolved: ResolvedIngredient[] = [];
  for (const ing of draft.ingredients) {
    const food = byId.get(ing.food_id);
    if (!food) continue;
    resolved.push({
      ingredient: {
        id: '',
        recipe_id: '',
        user_id: '',
        food_id: ing.food_id,
        food_name: food.name,
        quantity: ing.quantity,
        quantity_unit: ing.quantity_unit,
        sort_order: 0,
        notes: ing.notes,
        created_at: '',
      },
      food,
    });
  }
  const totals = calculateRecipeNutrition(resolved);
  const per100 = calculateRecipePer100g(totals, draft.yield_quantity);
  return { totals, per100 };
}

/** Live per-100 preview for the builder (pure; memoize at the call site). */
export function previewRecipeDraft(draft: RecipeDraft, foods: FoodItem[]): BuiltPreview {
  return buildPreview(draft, foods);
}

export const useRecipeStore = create<RecipeState>()((set, get) => ({
  recipes: [],
  ingredients: [],
  ownerId: null,
  ready: false,
  lastError: null,

  load: async (ownerId) => {
    if (get().ownerId === ownerId && get().ready) return;
    set({ ownerId });
    try {
      const [recipes, ingredients] = await Promise.all([
        listRecipes(ownerId),
        listAllIngredients(ownerId),
      ]);
      set({ recipes, ingredients, ready: true, lastError: null });
    } catch (error) {
      set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load your recipes.' });
    }
  },

  saveRecipe: (recipeId, draft) => {
    const ownerId = get().ownerId;
    const name = draft.name.trim();
    if (!name) return { ok: false, reason: 'Give the recipe a name.' };
    const yieldCheck = validateYield(draft.yield_quantity);
    if (!yieldCheck.ok) return { ok: false, reason: yieldCheck.reason };
    if (draft.ingredients.length === 0) return { ok: false, reason: 'Add at least one ingredient.' };

    const foods = useCalorieStore.getState().foodItems;
    const { totals, per100 } = buildPreview(draft, foods);
    if (!per100) return { ok: false, reason: 'Cooked yield must be greater than zero.' };

    const now = new Date().toISOString();
    const id = recipeId ?? generateId();
    const prev = recipeId ? get().recipes.find((r) => r.id === recipeId) : undefined;
    const recipe: Recipe = {
      id,
      user_id: ownerId ?? LOCAL_OWNER_ID,
      food_item_id: id,
      name,
      description: draft.description.trim(),
      category: draft.category.trim(),
      preparation: draft.preparation.trim(),
      yield_quantity: draft.yield_quantity,
      yield_unit: draft.yield_unit,
      serving_quantity: draft.serving_quantity,
      serving_description: draft.serving_description.trim(),
      source: 'user',
      is_estimated: totals.is_estimated,
      created_at: prev?.created_at ?? now,
      updated_at: now,
    };
    const ingredients: RecipeIngredient[] = draft.ingredients.map((ing, i) => {
      const food = foods.find((f) => f.id === ing.food_id);
      return {
        id: generateId(),
        recipe_id: id,
        user_id: ownerId ?? LOCAL_OWNER_ID,
        food_id: ing.food_id,
        food_name: food?.name ?? '',
        quantity: ing.quantity,
        quantity_unit: ing.quantity_unit,
        sort_order: i,
        notes: ing.notes,
        created_at: now,
      };
    });
    const foodItem = materializeRecipeFoodItem(recipe, per100, draft.yield_unit);

    // Stored ids replaced by this save are tombstoned for sync.
    const prevIds = recipeId ? get().ingredients.filter((r) => r.recipe_id === recipeId).map((r) => r.id) : [];
    const removedIngredientIds = prevIds.filter((storedId) => !ingredients.some((r) => r.id === storedId));

    set((s) => ({
      recipes: recipeId ? s.recipes.map((r) => (r.id === recipeId ? recipe : r)) : [...s.recipes, recipe],
      ingredients: [...s.ingredients.filter((r) => r.recipe_id !== id), ...ingredients],
    }));
    // Materialized item flows through the calorie mirror (search, recent,
    // favorites resolve it immediately, offline-first). Persistence of that
    // row lives in saveRecipeBundle — single writer, no double enqueue.
    useCalorieStore.setState((s) => ({
      foodItems: [...s.foodItems.filter((f) => f.id !== id), foodItem],
    }));

    if (ownerId) {
      writeThrough(
        saveRecipeBundle(ownerId, { recipe, ingredients, foodItem, removedIngredientIds }),
        'recipe',
        (message) => set({ lastError: message })
      );
    }
    return { ok: true, recipeId: id };
  },

  removeRecipe: (recipeId) => {
    set((s) => ({
      recipes: s.recipes.filter((r) => r.id !== recipeId),
      ingredients: s.ingredients.filter((r) => r.recipe_id !== recipeId),
    }));
    useCalorieStore.setState((s) => ({ foodItems: s.foodItems.filter((f) => f.id !== recipeId) }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(
        removeRecipeBundle(ownerId, recipeId),
        'recipe',
        (message) => set({ lastError: message })
      );
    }
  },

  duplicateRecipe: (recipeId, name) => {
    const state = get();
    const source = state.recipes.find((r) => r.id === recipeId);
    if (!source || !name.trim()) return;
    const rows = state.ingredients.filter((r) => r.recipe_id === recipeId);
    const foods = useCalorieStore.getState().foodItems;
    get().saveRecipe(null, {
      name: name.trim(),
      description: source.description,
      category: source.category,
      preparation: source.preparation,
      yield_quantity: source.yield_quantity,
      yield_unit: source.yield_unit,
      serving_quantity: source.serving_quantity,
      serving_description: source.serving_description,
      ingredients: rows.map((r) => {
        const food = foods.find((f) => f.id === r.food_id);
        const allowed = food ? availableUnitsFor(food) : null;
        return {
          food_id: r.food_id,
          quantity: r.quantity,
          quantity_unit: allowed && (allowed as string[]).includes(r.quantity_unit) ? r.quantity_unit : (allowed?.[0] ?? 'g'),
          notes: r.notes,
        };
      }),
    });
  },

  getIngredients: (recipeId) =>
    get()
      .ingredients.filter((r) => r.recipe_id === recipeId)
      .sort((a, b) => a.sort_order - b.sort_order),

  getRecipeFoodItem: (recipeId) =>
    useCalorieStore.getState().foodItems.find((f) => f.id === recipeId),
}));
