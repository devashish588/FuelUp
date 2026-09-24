// =============================================
// FuelUp - Domain <-> API mappers (explicit conversions)
// snake_case local domain <-> camelCase Prisma payloads.
// =============================================
import type { BodyMetric, FoodItem, FoodLog, Habit, HabitLog } from '@/lib/types';

export function toFoodLogCreate(input: {
  foodItemId: string;
  date: string;
  mealType: string;
  servings: number;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  notes?: string;
}) {
  return {
    foodItemId: input.foodItemId,
    date: input.date,
    mealType: input.mealType,
    servings: input.servings,
    calories: input.calories,
    proteinG: input.proteinG ?? 0,
    carbsG: input.carbsG ?? 0,
    fatG: input.fatG ?? 0,
    notes: input.notes,
  };
}

export function toBodyMetricCreate(input: {
  date: string;
  weightKg: number;
  heightCm?: number;
  bmi?: number;
  bodyFatPercentage?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  armsCm?: number | null;
  thighsCm?: number | null;
  notes?: string;
}) {
  return { ...input };
}

export function toHabitLogUpsert(input: { habitId: string; date: string; value: number; completed: boolean }) {
  return { ...input };
}

// Re-export domain types for convenience at mapper boundary.
export type { BodyMetric, FoodItem, FoodLog, Habit, HabitLog };
