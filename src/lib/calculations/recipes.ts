// =============================================
// FuelUp - Recipe nutrition engine (deterministic, no AI)
//
// Ingredients → total → cooked yield → per-100g → portion.
// Reuses calculateNutritionForQuantity; no duplicated arithmetic.
// Full float precision; round only at display via roundNutrientsForDisplay.
// =============================================
import { calculateNutritionForQuantity } from './nutrition';
import type { FoodItem, QuantityUnit, Recipe, RecipeIngredient, RecipeYieldUnit } from '@/lib/types';

export interface RecipeTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number | null;
  sodium_mg: number | null;
  /** True when any resolved ingredient is estimated. */
  is_estimated: boolean;
  /** Ingredient ids whose food could not be resolved or normalized. */
  unresolved: string[];
}

export interface ResolvedIngredient {
  ingredient: RecipeIngredient;
  food: FoodItem;
}

function sumOpt(values: (number | null | undefined)[]): number | null {
  let total = 0;
  let seen = false;
  for (const v of values) {
    if (v == null) continue;
    seen = true;
    total += v;
  }
  return seen ? total : null;
}

/**
 * Sum ingredient contributions. Each ingredient normalizes through the
 * Phase 5 quantity engine against its CURRENT food definition. Unresolvable
 * ingredients are skipped (reported in `unresolved`) — never zero-filled
 * silently, never assumed.
 */
export function calculateRecipeNutrition(resolved: ResolvedIngredient[]): RecipeTotals {
  let calories = 0;
  let protein_g = 0;
  let carbs_g = 0;
  let fat_g = 0;
  let fiber_g = 0;
  const sugars: (number | null)[] = [];
  const sodiums: (number | null)[] = [];
  let is_estimated = false;
  const unresolved: string[] = [];

  for (const { ingredient, food } of resolved) {
    if (food.is_estimated) is_estimated = true;
    const result = calculateNutritionForQuantity(food, ingredient.quantity, ingredient.quantity_unit);
    if (!result.ok) {
      unresolved.push(ingredient.id);
      continue;
    }
    const n = result.nutrition;
    calories += n.calories;
    protein_g += n.protein_g;
    carbs_g += n.carbs_g;
    fat_g += n.fat_g;
    fiber_g += n.fiber_g ?? 0;
    sugars.push(n.sugar_g);
    sodiums.push(n.sodium_mg);
  }

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    sugar_g: sumOpt(sugars),
    sodium_mg: sumOpt(sodiums),
    is_estimated,
    unresolved,
  };
}

/** Per-100 (g or ml) nutrition from totals + explicit cooked yield. */
export function calculateRecipePer100g(
  totals: Omit<RecipeTotals, 'is_estimated' | 'unresolved'>,
  yieldQuantity: number
): Omit<RecipeTotals, 'is_estimated' | 'unresolved'> | null {
  if (!Number.isFinite(yieldQuantity) || yieldQuantity <= 0) return null;
  const factor = 100 / yieldQuantity;
  const scaled = (v: number) => v * factor;
  const opt = (v: number | null) => (v == null ? null : v * factor);
  return {
    calories: scaled(totals.calories),
    protein_g: scaled(totals.protein_g),
    carbs_g: scaled(totals.carbs_g),
    fat_g: scaled(totals.fat_g),
    fiber_g: scaled(totals.fiber_g),
    sugar_g: opt(totals.sugar_g),
    sodium_mg: opt(totals.sodium_mg),
  };
}

/**
 * Nutrition for a household serving (e.g. 190 g of a 760 g yield).
 * Serving is converted to yield units first — the basis stays per-100.
 */
export function servingNutrition(
  per100: Omit<RecipeTotals, 'is_estimated' | 'unresolved'>,
  servingQuantity: number
): Omit<RecipeTotals, 'is_estimated' | 'unresolved'> | null {
  if (!Number.isFinite(servingQuantity) || servingQuantity <= 0) return null;
  const factor = servingQuantity / 100;
  const scaled = (v: number) => v * factor;
  const opt = (v: number | null) => (v == null ? null : v * factor);
  return {
    calories: scaled(per100.calories),
    protein_g: scaled(per100.protein_g),
    carbs_g: scaled(per100.carbs_g),
    fat_g: scaled(per100.fat_g),
    fiber_g: scaled(per100.fiber_g),
    sugar_g: opt(per100.sugar_g),
    sodium_mg: opt(per100.sodium_mg),
  };
}

/**
 * Materialize a saved recipe as a FoodItem (source='recipe', same id,
 * per-100 basis) so search / recent / favorites / logging / snapshots /
 * sync all work through the existing food flows unchanged.
 */
export function materializeRecipeFoodItem(
  recipe: Pick<Recipe, 'id' | 'name' | 'category' | 'preparation' | 'serving_description' | 'is_estimated' | 'created_at'>,
  per100: Omit<RecipeTotals, 'is_estimated' | 'unresolved'>,
  yieldUnit: RecipeYieldUnit
): FoodItem {
  return {
    id: recipe.id,
    name: recipe.name,
    brand: '',
    serving_size: 100,
    serving_unit: yieldUnit,
    calories_per_serving: per100.calories,
    protein_g: per100.protein_g,
    carbs_g: per100.carbs_g,
    fat_g: per100.fat_g,
    fiber_g: per100.fiber_g,
    barcode: null,
    is_custom: true,
    created_by: null,
    created_at: recipe.created_at,
    category: recipe.category || 'recipe',
    source: 'recipe',
    source_id: recipe.id,
    preparation: recipe.preparation,
    serving_description: recipe.serving_description,
    sugar_g: per100.sugar_g,
    sodium_mg: per100.sodium_mg,
    is_estimated: recipe.is_estimated,
  };
}

/** Validate a cooked yield before any per-100 math (divide-by-zero guard). */
export function validateYield(
  yieldQuantity: number
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(yieldQuantity)) return { ok: false, reason: 'Enter a valid cooked yield.' };
  if (yieldQuantity <= 0) return { ok: false, reason: 'Cooked yield must be greater than zero.' };
  if (yieldQuantity > 1_000_000) return { ok: false, reason: 'That cooked yield looks too large.' };
  return { ok: true };
}

export type { QuantityUnit };
