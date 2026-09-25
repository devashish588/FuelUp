// =============================================
// FuelUp - Sync payload validation (server, Zod)
// Client rows are snake_case domain shapes; these schemas validate both
// shape and value bounds before anything reaches Prisma. Never spread
// validated payloads blindly — apply-push maps fields explicitly.
// =============================================
import { z } from 'zod';
import { dateString, mealTypeSchema } from './common';
import { SYNC_ENTITIES, SYNC_OPERATIONS, SYNC_PUSH_BATCH_LIMIT } from '@/lib/sync/sync-contracts';

const idString = z.string().min(1).max(128);
const finiteNumber = z.number().finite();
const optText = (max: number) => z.string().max(max).nullable().optional();

const syncProfilePayload = z.object({
  id: idString,
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).or(z.literal('')),
  date_of_birth: z.string().max(32),
  gender: z.enum(['male', 'female', 'other']),
  activity_level: z.string().max(32),
  goal: z.enum(['cut', 'bulk', 'recomp', 'maintain', 'custom']),
  unit_system: z.enum(['metric', 'imperial']),
  daily_calorie_target: z.number().int().min(800).max(15000),
  protein_target_g: z.number().int().min(0).max(1000),
  carbs_target_g: z.number().int().min(0).max(2000),
  fat_target_g: z.number().int().min(0).max(1000),
  // --- Phase 7: adaptive energy preferences (optional so older clients pass) ---
  target_rate_kg_per_week: z.number().finite().min(0).max(1.5).nullable().optional(),
  target_source: z.enum(['initial', 'adaptive', 'manual']).nullable().optional(),
}).passthrough();

const syncFoodItemPayload = z.object({
  id: idString,
  name: z.string().trim().min(1).max(200),
  brand: z.string().max(200).nullable().optional(),
  serving_size: finiteNumber.min(0).max(100000),
  serving_unit: z.string().max(32),
  calories_per_serving: finiteNumber.min(0).max(100000),
  protein_g: finiteNumber.min(0).max(100000),
  carbs_g: finiteNumber.min(0).max(100000),
  fat_g: finiteNumber.min(0).max(100000),
  fiber_g: finiteNumber.min(0).max(100000).nullable().optional(),
  barcode: z.string().max(64).nullable().optional(),
  is_custom: z.boolean(),
  // --- Phase 5: model, provenance, classification (all optional) ---
  category: z.string().max(64).nullable().optional(),
  source: z.enum(['builtin', 'verified', 'branded', 'user', 'recipe', 'imported', 'estimated']).nullable().optional(),
  source_id: z.string().max(128).nullable().optional(),
  aliases: z.array(z.string().max(100)).max(20).nullable().optional(),
  count_weight_g: finiteNumber.min(0).max(100000).nullable().optional(),
  food_state: z.string().max(32).nullable().optional(),
  preparation: z.string().max(100).nullable().optional(),
  serving_description: z.string().max(200).nullable().optional(),
  sugar_g: finiteNumber.min(0).max(100000).nullable().optional(),
  sodium_mg: finiteNumber.min(0).max(1000000).nullable().optional(),
  is_estimated: z.boolean().nullable().optional(),
}).passthrough();

const syncFoodLogPayload = z.object({
  id: idString,
  food_item_id: idString,
  date: dateString,
  meal_type: mealTypeSchema,
  servings: finiteNumber.min(0).max(1000),
  calories: finiteNumber.min(0).max(100000),
  protein_g: finiteNumber.min(0).max(100000),
  carbs_g: finiteNumber.min(0).max(100000),
  fat_g: finiteNumber.min(0).max(100000),
  notes: z.string().max(1000).nullable().optional(),
  // --- Phase 5: quantity-first input + snapshot (all optional) ---
  quantity: finiteNumber.min(0).max(1000000).nullable().optional(),
  quantity_unit: z.enum(['g', 'kg', 'ml', 'L', 'count', 'serving']).nullable().optional(),
  fiber_g: finiteNumber.min(0).max(100000).nullable().optional(),
  sugar_g: finiteNumber.min(0).max(100000).nullable().optional(),
  sodium_mg: finiteNumber.min(0).max(1000000).nullable().optional(),
  food_name: z.string().max(200).nullable().optional(),
  is_estimated: z.boolean().nullable().optional(),
}).passthrough();

const syncExercisePayload = z.object({
  id: idString,
  name: z.string().trim().min(1).max(200),
  muscle_group: z.string().max(32),
  equipment: optText(200),
  instructions: optText(4000),
  is_custom: z.boolean(),
}).passthrough();

const syncSetPayload = z.object({
  id: idString,
  set_number: z.number().int().min(1).max(1000),
  reps: z.number().int().min(0).max(100000).nullable().optional(),
  weight_kg: finiteNumber.min(0).max(5000).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(1000000).nullable().optional(),
  distance_meters: finiteNumber.min(0).max(1000000).nullable().optional(),
  is_warmup: z.boolean().nullable().optional(),
}).passthrough();

const syncWorkoutExercisePayload = z.object({
  id: idString,
  exercise_id: idString,
  sort_order: z.number().int().min(0).max(10000).nullable().optional(),
  notes: optText(2000),
  sets: z.array(syncSetPayload).max(500).optional().default([]),
}).passthrough();

const syncWorkoutPayload = z.object({
  id: idString,
  name: z.string().trim().min(1).max(200),
  date: dateString,
  start_time: z.string().max(64),
  end_time: z.string().max(64).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  calories_burned: z.number().int().min(0).max(100000).nullable().optional(),
  notes: optText(2000),
  exercises: z.array(syncWorkoutExercisePayload).max(200).optional().default([]),
}).passthrough();

const syncBodyMetricPayload = z.object({
  id: idString,
  date: dateString,
  weight_kg: finiteNumber.min(20).max(500),
  height_cm: finiteNumber.min(50).max(300).nullable().optional(),
  bmi: finiteNumber.min(5).max(100).nullable().optional(),
  body_fat_percentage: z.number().min(0).max(100).nullable().optional(),
  waist_cm: finiteNumber.min(0).max(300).nullable().optional(),
  chest_cm: finiteNumber.min(0).max(300).nullable().optional(),
  arms_cm: finiteNumber.min(0).max(200).nullable().optional(),
  thighs_cm: finiteNumber.min(0).max(300).nullable().optional(),
  notes: optText(1000),
}).passthrough();

const syncHabitPayload = z.object({
  id: idString,
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(64).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  target_value: z.number().int().min(1).max(1000000),
  unit: z.string().max(32),
  frequency: z.enum(['daily', 'weekly']),
  is_active: z.boolean().nullable().optional(),
}).passthrough();

const syncHabitLogPayload = z.object({
  id: idString,
  habit_id: idString,
  date: dateString,
  value: z.number().int().min(0).max(1000000),
  completed: z.boolean(),
}).passthrough();

const syncFavoritePayload = z.object({
  id: idString,
  food_id: idString,
}).passthrough();

const syncRecipePayload = z.object({
  id: idString,
  food_item_id: idString,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
  preparation: z.string().max(100).nullable().optional(),
  yield_quantity: finiteNumber.min(0).max(1000000),
  yield_unit: z.enum(['g', 'ml']),
  serving_quantity: finiteNumber.min(0).max(1000000).nullable().optional(),
  serving_description: z.string().max(200).nullable().optional(),
  source: z.string().max(32).nullable().optional(),
  is_estimated: z.boolean().nullable().optional(),
}).passthrough();

const syncRecipeIngredientPayload = z.object({
  id: idString,
  recipe_id: idString,
  food_id: idString,
  food_name: z.string().max(200).nullable().optional(),
  quantity: finiteNumber.min(0).max(1000000),
  quantity_unit: z.enum(['g', 'kg', 'ml', 'L', 'count', 'serving']),
  sort_order: z.number().int().min(0).max(10000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
}).passthrough();

// --- Phase 7: append-only target-change events (reasons are rule-generated) ---
const syncTargetHistoryPayload = z.object({
  id: idString,
  date: dateString,
  previous_target: z.number().int().min(800).max(15000),
  new_target: z.number().int().min(800).max(15000),
  reason: z.string().max(1000),
  maintenance_estimate: z.number().int().min(0).max(15000).nullable().optional(),
  valid_days: z.number().int().min(0).max(366).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  goal: z.enum(['cut', 'bulk', 'recomp', 'maintain', 'custom']).nullable().optional(),
  avg_intake_kcal: z.number().int().min(0).max(15000).nullable().optional(),
  previous_rate_kg_per_week: z.number().finite().min(0).max(1.5).nullable().optional(),
  new_rate_kg_per_week: z.number().finite().min(0).max(1.5).nullable().optional(),
}).passthrough();

export const SYNC_PAYLOAD_SCHEMAS = {
  profile: syncProfilePayload,
  foodItem: syncFoodItemPayload,
  foodLog: syncFoodLogPayload,
  exercise: syncExercisePayload,
  workout: syncWorkoutPayload,
  bodyMetric: syncBodyMetricPayload,
  habit: syncHabitPayload,
  habitLog: syncHabitLogPayload,
  favorite: syncFavoritePayload,
  recipe: syncRecipePayload,
  recipeIngredient: syncRecipeIngredientPayload,
  targetHistory: syncTargetHistoryPayload,
} as const;

const syncPushEventSchema = z.object({
  mutationId: z.string().min(1).max(128),
  entity: z.enum(SYNC_ENTITIES),
  entityId: idString,
  operation: z.enum(SYNC_OPERATIONS),
  payload: z.record(z.string(), z.unknown()),
});

export const syncPushRequestSchema = z.object({
  events: z.array(syncPushEventSchema).min(1).max(SYNC_PUSH_BATCH_LIMIT),
});

export const syncPullQuerySchema = z.object({
  cursor: z.string().datetime({ offset: true }).max(64).optional(),
});

export type SyncPushEventInput = z.infer<typeof syncPushEventSchema>;
