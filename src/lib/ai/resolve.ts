// =============================================
// FuelUp - Deterministic AI food resolution (client-safe, pure)
// Boundary: AI proposes candidates → resolver finds real FoodItems/recipes
// → quantity engine normalizes → nutrition engine calculates → user
// confirms → FoodLog. The resolver NEVER invents nutrition; resolution
// confidence comes from these deterministic rules, never a model score.
// =============================================
import { calculateMealNutrition, calculateNutritionForQuantity } from '@/lib/calculations/nutrition';
import type { LoggedNutrition, MealNutrition } from '@/lib/calculations/nutrition';
import { defaultUnitFor } from '@/lib/calculations/quantity';
import { normalizeFoodQuery, scoreFoodMatch } from '@/lib/nutrition/food-search';
import type { FoodItem, FoodLog, MealType, QuantityUnit } from '@/lib/types';
import { LOCAL_OWNER_ID } from '@/config/app';
import { AI_ENGINE_UNITS, AI_HOUSEHOLD_UNITS, type AiParsedItem } from './schemas';

export type ResolutionStatus = 'resolved' | 'ambiguous' | 'unresolved' | 'unsupported';

export interface RankedMatch {
  food: FoodItem;
  score: number;
}

export type QuantitySource = 'ai' | 'suggested' | 'missing';

export interface ResolvedFoodItem {
  key: string;
  candidate: AiParsedItem;
  status: ResolutionStatus;
  /** Top ranked matches (max 5) for user disambiguation. */
  matches: RankedMatch[];
  selectedFood: FoodItem | null;
  /** Engine-native quantity (null until the user provides one). */
  quantity: number | null;
  unit: QuantityUnit | null;
  quantitySource: QuantitySource;
  /** Original household unit for display (e.g. 'bowl'), if any. */
  enteredUnit: string | null;
  mealHint: MealType | null;
  preparationHint: string | null;
}

/** Serving-grounded suggestion for household measures ("1 bowl dal" →
 *  dal's own serving). Rough by design — the user confirms or edits. */
export function suggestQuantityFor(food: FoodItem, count = 1): { quantity: number; unit: QuantityUnit } {
  const unit = defaultUnitFor(food);
  const quantity = Math.round(count * (food.serving_size > 0 ? food.serving_size : 100) * 10) / 10;
  return { quantity, unit };
}

function decideStatus(ranked: RankedMatch[]): ResolutionStatus {
  const top = ranked[0];
  if (!top) return 'unsupported';
  if (top.score >= 100 && (!ranked[1] || ranked[1].score < 100)) return 'resolved';
  if (top.score >= 20 && (!ranked[1] || top.score > ranked[1].score)) return 'resolved';
  if (top.score >= 20) return 'ambiguous';
  if (top.score >= 10) return 'unresolved';
  return 'unsupported';
}

/**
 * Resolve AI candidates against the user's foods (seeds + customs +
 * materialized recipes — pass the calorie store's foodItems).
 * Pure: same candidates + same foods → same resolution.
 */
export function resolveFoodCandidates(candidates: AiParsedItem[], foods: FoodItem[]): ResolvedFoodItem[] {
  return candidates.map((candidate, index) => {
    const q = normalizeFoodQuery(candidate.name);
    const ranked: RankedMatch[] = foods
      .map((food) => ({ food, score: scoreFoodMatch(food, q, candidate.preparationHint) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
      .slice(0, 5);
    const status = decideStatus(ranked);
    const selectedFood = status === 'resolved' ? ranked[0].food : null;

    let quantity: number | null = null;
    let unit: QuantityUnit | null = null;
    let quantitySource: QuantitySource = 'missing';
    let enteredUnit: string | null = null;
    const qty = candidate.quantity;
    const hasQty = qty !== null && qty > 0;
    if (hasQty && candidate.unit && (AI_ENGINE_UNITS as readonly string[]).includes(candidate.unit)) {
      quantity = qty;
      unit = candidate.unit as QuantityUnit;
      quantitySource = 'ai';
    } else if (hasQty && candidate.unit && (AI_HOUSEHOLD_UNITS as readonly string[]).includes(candidate.unit)) {
      enteredUnit = candidate.unit;
      if (selectedFood) {
        const suggestion = suggestQuantityFor(selectedFood, qty);
        quantity = suggestion.quantity;
        unit = suggestion.unit;
        quantitySource = 'suggested';
      }
    }

    return {
      key: `ai-${index}`,
      candidate,
      status,
      matches: ranked,
      selectedFood,
      quantity,
      unit,
      quantitySource,
      enteredUnit,
      mealHint: candidate.mealHint,
      preparationHint: candidate.preparationHint,
    };
  });
}

/** Apply a user-picked food to a row (manual disambiguation). Re-suggests
 *  quantity when the row still lacks an engine quantity. */
export function applyFoodSelection(item: ResolvedFoodItem, food: FoodItem): ResolvedFoodItem {
  let { quantity, unit, quantitySource } = item;
  if (quantity === null || unit === null) {
    const count = item.candidate.quantity && item.candidate.quantity > 0 ? item.candidate.quantity : 1;
    const suggestion = suggestQuantityFor(food, item.enteredUnit ? count : 1);
    // Only auto-fill household-originated rows; missing quantities stay empty
    // (quantities are never invented — the user must enter them).
    if (item.enteredUnit) {
      quantity = suggestion.quantity;
      unit = suggestion.unit;
      quantitySource = 'suggested';
    }
  }
  return { ...item, status: 'resolved', selectedFood: food, quantity, unit, quantitySource };
}

// --- Preview (deterministic nutrition over resolved rows) ---

export interface PreviewRow {
  key: string;
  food: FoodItem | null;
  quantity: number | null;
  unit: QuantityUnit | null;
  nutrition: LoggedNutrition | null;
  error: string | null;
}

export interface FoodPreview {
  rows: PreviewRow[];
  totals: MealNutrition | null;
  allValid: boolean;
}

/** Every nutrition number here comes from the deterministic engine. */
export function buildFoodPreview(items: ResolvedFoodItem[], meal: MealType): FoodPreview {
  const rows: PreviewRow[] = items.map((item) => {
    if (!item.selectedFood) {
      return { key: item.key, food: null, quantity: item.quantity, unit: item.unit, nutrition: null, error: 'Pick a food for this item.' };
    }
    if (item.quantity === null || item.unit === null) {
      return { key: item.key, food: item.selectedFood, quantity: null, unit: null, nutrition: null, error: 'Enter how much was eaten.' };
    }
    const result = calculateNutritionForQuantity(item.selectedFood, item.quantity, item.unit);
    if (!result.ok) {
      return { key: item.key, food: item.selectedFood, quantity: item.quantity, unit: item.unit, nutrition: null, error: result.reason };
    }
    return { key: item.key, food: item.selectedFood, quantity: item.quantity, unit: item.unit, nutrition: result.nutrition, error: null };
  });
  const valid = rows.filter((r) => r.nutrition !== null);
  const totals =
    valid.length > 0
      ? calculateMealNutrition(
          valid.map((r) => ({
            meal_type: meal,
            calories: r.nutrition!.calories,
            protein_g: r.nutrition!.protein_g,
            carbs_g: r.nutrition!.carbs_g,
            fat_g: r.nutrition!.fat_g,
            fiber_g: r.nutrition!.fiber_g,
            sugar_g: r.nutrition!.sugar_g,
            sodium_mg: r.nutrition!.sodium_mg,
          })) as FoodLog[],
          meal
        )
      : null;
  return { rows, totals, allValid: rows.length > 0 && valid.length === rows.length };
}

// --- Confirmation (the ONLY path from AI review to FoodLog) ---

export interface ConfirmDeps {
  date: string;
  meal: MealType;
  userId?: string;
  addLog: (log: Omit<FoodLog, 'id' | 'created_at'>) => void;
}

/**
 * Persist confirmed rows through the standard FoodLog path
 * (IndexedDB → outbox → sync). Call only from explicit user confirmation —
 * parsing/resolution/preview never touch the store.
 */
export function confirmAiReview(preview: FoodPreview, deps: ConfirmDeps): { logged: number } {
  if (!preview.allValid || !preview.totals) return { logged: 0 };
  let logged = 0;
  for (const row of preview.rows) {
    if (!row.nutrition || !row.food || row.quantity === null || row.unit === null) continue;
    const n = row.nutrition;
    deps.addLog({
      user_id: deps.userId ?? LOCAL_OWNER_ID,
      food_item_id: row.food.id,
      food_item: row.food,
      food_name: row.food.name,
      is_estimated: row.food.is_estimated ?? false,
      date: deps.date,
      meal_type: deps.meal,
      quantity: row.quantity,
      quantity_unit: row.unit,
      servings: n.servings,
      calories: n.calories,
      protein_g: n.protein_g,
      carbs_g: n.carbs_g,
      fat_g: n.fat_g,
      fiber_g: n.fiber_g,
      sugar_g: n.sugar_g,
      sodium_mg: n.sodium_mg,
      notes: '',
    });
    logged += 1;
  }
  return { logged };
}
