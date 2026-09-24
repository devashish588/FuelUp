// =============================================
// FuelUp - Nutrition calculations (deterministic, no AI)
//
// Core rule: nutritionPerBasis × normalizedQuantity = loggedNutrition.
// Compute at full float precision; round ONLY at the presentation/storage
// boundary per the rounding policy below. Macro split preserved from
// recommendation-engine.
// =============================================
import { calculateBMI } from './metrics';
import { calculateBMR, calculateTDEE, resolveGoalAdjustment } from './energy';
import type { EnergyInput } from './energy';
import { normalizeFoodQuantity, scaleFactorFor } from './quantity';
import type { DailyNutrition, FoodItem, FoodLog, GoalType, MealType, QuantityUnit, Recommendation } from '@/lib/types';

export function calculateMacroTargets(dailyCalories: number, weightKg: number, goal: GoalType) {
  // Phase 7: maintain + custom use the recomp protein factor (2.0 g/kg) —
  // maintenance-oriented targets, never a directed deficit/surplus.
  const protein_g = Math.round(weightKg * (goal === 'cut' ? 2.2 : goal === 'bulk' ? 1.8 : 2.0));
  const fat_g = Math.round((dailyCalories * 0.25) / 9);
  const carbs_g = Math.max(Math.round((dailyCalories - protein_g * 4 - fat_g * 9) / 4), 50);
  return { protein_g, carbs_g, fat_g };
}

export function generateRecommendation(metrics: EnergyInput & { body_fat_percentage: number | null }): Recommendation {
  const tdee = calculateTDEE(metrics);
  const bmr = calculateBMR(metrics);
  const bmi = calculateBMI(metrics.weight_kg, metrics.height_cm);
  const { goal, reason, calorieAdjustment } = resolveGoalAdjustment({
    gender: metrics.gender,
    body_fat_percentage: metrics.body_fat_percentage,
    bmi,
  });
  const daily_calories = Math.max(tdee + calorieAdjustment, 1200);
  const { protein_g, carbs_g, fat_g } = calculateMacroTargets(daily_calories, metrics.weight_kg, goal);
  return { goal, reason, daily_calories, protein_g, carbs_g, fat_g, tdee, bmr: Math.round(bmr), bmi };
}

export function summarizeFoodLogs(
  logs: { calories: number; protein_g: number; carbs_g: number; fat_g: number }[]
): { calories: number; protein_g: number; carbs_g: number; fat_g: number } {
  return logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein_g: acc.protein_g + l.protein_g,
      carbs_g: acc.carbs_g + l.carbs_g,
      fat_g: acc.fat_g + l.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

/**
 * Rounding policy (presentation/storage boundary — never mid-calculation):
 * calories → whole kcal, protein/carbs/fat/fiber/sugar → 1 decimal,
 * sodium → whole mg. Null stays null (unknown is not zero).
 */
export function roundNutrientsForDisplay<T extends {
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  fiber_g?: number | null; sugar_g?: number | null; sodium_mg?: number | null;
}>(n: T): T & { calories: number; protein_g: number; carbs_g: number; fat_g: number } {
  const one = (v: number) => Math.round(v * 10) / 10;
  return {
    ...n,
    calories: Math.round(n.calories),
    protein_g: one(n.protein_g),
    carbs_g: one(n.carbs_g),
    fat_g: one(n.fat_g),
    ...(n.fiber_g == null ? {} : { fiber_g: one(n.fiber_g) }),
    ...(n.sugar_g == null ? {} : { sugar_g: one(n.sugar_g) }),
    ...(n.sodium_mg == null ? {} : { sodium_mg: Math.round(n.sodium_mg) }),
  };
}

export interface LoggedNutrition {
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
}

/**
 * Canonical quantity-first calculation: normalize the entered quantity to
 * the food's basis, then scale per-basis nutrition. Full float precision —
 * callers round via roundNutrientsForDisplay.
 */
export function calculateNutritionForQuantity(
  food: FoodItem,
  quantity: number,
  unit: QuantityUnit
): { ok: true; nutrition: LoggedNutrition } | { ok: false; reason: string } {
  const normalized = normalizeFoodQuantity(food, quantity, unit);
  if (!normalized.ok) return normalized;
  const factor = scaleFactorFor(food, normalized.value);
  const scaled = (perBasis: number) => perBasis * factor;
  const opt = (v: number | null | undefined) => (v == null ? null : v * factor);
  return {
    ok: true,
    nutrition: {
      servings: factor,
      calories: scaled(food.calories_per_serving),
      protein_g: scaled(food.protein_g),
      carbs_g: scaled(food.carbs_g),
      fat_g: scaled(food.fat_g),
      fiber_g: opt(food.fiber_g),
      sugar_g: opt(food.sugar_g),
      sodium_mg: opt(food.sodium_mg),
    },
  };
}

export interface MealNutrition {
  meal: MealType;
  count: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number | null;
  sodium_mg: number | null;
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

/** Canonical meal rollup over that meal's logs (full precision). */
export function calculateMealNutrition(logs: FoodLog[], meal: MealType): MealNutrition {
  const rows = logs.filter((l) => l.meal_type === meal);
  return {
    meal,
    count: rows.length,
    calories: rows.reduce((s, l) => s + l.calories, 0),
    protein_g: rows.reduce((s, l) => s + l.protein_g, 0),
    carbs_g: rows.reduce((s, l) => s + l.carbs_g, 0),
    fat_g: rows.reduce((s, l) => s + l.fat_g, 0),
    fiber_g: rows.reduce((s, l) => s + (l.fiber_g ?? 0), 0),
    sugar_g: sumOpt(rows.map((l) => l.sugar_g)),
    sodium_mg: sumOpt(rows.map((l) => l.sodium_mg)),
  };
}

/**
 * Canonical daily rollup for one local calendar date, with targets.
 * Dashboard, food page, and analytics consume THIS — no copies.
 */
export function calculateDailyNutrition(
  logs: FoodLog[],
  date: string,
  targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
): DailyNutrition {
  const rows = logs.filter((l) => l.date === date);
  return {
    date,
    calories: rows.reduce((s, l) => s + l.calories, 0),
    protein_g: rows.reduce((s, l) => s + l.protein_g, 0),
    carbs_g: rows.reduce((s, l) => s + l.carbs_g, 0),
    fat_g: rows.reduce((s, l) => s + l.fat_g, 0),
    fiber_g: rows.reduce((s, l) => s + (l.fiber_g ?? 0), 0),
    sugar_g: sumOpt(rows.map((l) => l.sugar_g)),
    sodium_mg: sumOpt(rows.map((l) => l.sodium_mg)),
    target_calories: targets.calories,
    target_protein_g: targets.protein_g,
    target_carbs_g: targets.carbs_g,
    target_fat_g: targets.fat_g,
  };
}

/** Calorie-share percentages of protein/carbs/fat (Atwater 4/4/9). */
export function calculateMacroPercentages(n: {
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
}): { protein_pct: number; carbs_pct: number; fat_pct: number } {
  const p = n.protein_g * 4;
  const c = n.carbs_g * 4;
  const f = n.fat_g * 9;
  const total = p + c + f;
  if (total <= 0) return { protein_pct: 0, carbs_pct: 0, fat_pct: 0 };
  const one = (v: number) => Math.round((v / total) * 1000) / 10;
  return { protein_pct: one(p), carbs_pct: one(c), fat_pct: one(f) };
}

export function scaleNutrientsPerServing(
  perServing: { calories: number; protein_g: number; carbs_g: number; fat_g: number },
  servings: number
) {
  return {
    calories: perServing.calories * servings,
    protein_g: perServing.protein_g * servings,
    carbs_g: perServing.carbs_g * servings,
    fat_g: perServing.fat_g * servings,
  };
}
