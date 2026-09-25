// =============================================
// FuelUp - Backup format validation (Phase 10.5)
// Backups are user-controlled input: every envelope, version, and entity
// row is validated before anything touches IndexedDB. Schemas mirror the
// stored snake_case row shapes WITHOUT identity fields (ownerId/user_id
// are stripped on export and re-attached to the current owner on import —
// never trusted from the file). Unknown keys are stripped (default Zod
// behavior): import normalizes to the current domain model.
// =============================================
import { z } from 'zod';
import { dateString } from './common';
import { quantityUnitSchema, foodSourceSchema, foodStateSchema } from './food';

export const BACKUP_FORMAT = 'fuelup-backup' as const;
/** Current backup version. Bump only with a documented migration path. */
export const BACKUP_FORMAT_VERSION = 1;

const idString = z.string().min(1).max(128);
const finiteNumber = z.number().finite();
const optText = (max: number) => z.string().max(max).nullable().optional();
const isoString = z.string().min(1).max(64);

const backupProfileSchema = z.object({
  id: idString,
  full_name: z.string().max(100),
  email: z.string().max(255),
  date_of_birth: z.string().max(32),
  gender: z.enum(['male', 'female', 'other']),
  activity_level: z.string().max(32),
  goal: z.enum(['cut', 'bulk', 'recomp', 'maintain', 'custom']),
  unit_system: z.enum(['metric', 'imperial']),
  daily_calorie_target: z.number().int().min(800).max(15000),
  protein_target_g: z.number().int().min(0).max(1000),
  carbs_target_g: z.number().int().min(0).max(2000),
  fat_target_g: z.number().int().min(0).max(1000),
  target_rate_kg_per_week: z.number().finite().min(0).max(1.5).nullable(),
  target_source: z.enum(['initial', 'adaptive', 'manual']),
  created_at: isoString,
  updated_at: isoString,
});

const backupFoodItemSchema = z.object({
  id: idString,
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional().default(''),
  serving_size: finiteNumber.min(0).max(100000),
  serving_unit: z.string().max(32),
  calories_per_serving: finiteNumber.min(0).max(100000),
  protein_g: finiteNumber.min(0).max(100000),
  carbs_g: finiteNumber.min(0).max(100000),
  fat_g: finiteNumber.min(0).max(100000),
  fiber_g: finiteNumber.min(0).max(100000),
  barcode: z.string().max(64).nullable().optional(),
  is_custom: z.boolean(),
  created_by: z.string().max(128).nullable().optional(),
  created_at: isoString,
  category: z.string().max(64).optional(),
  source: foodSourceSchema.optional(),
  source_id: z.string().max(128).nullable().optional(),
  aliases: z.array(z.string().max(100)).max(20).optional(),
  count_weight_g: finiteNumber.min(0).max(100000).nullable().optional(),
  food_state: foodStateSchema.optional(),
  preparation: z.string().max(100).optional(),
  serving_description: z.string().max(200).optional(),
  sugar_g: finiteNumber.min(0).max(100000).nullable().optional(),
  sodium_mg: finiteNumber.min(0).max(1000000).nullable().optional(),
  is_estimated: z.boolean().optional(),
});

const backupFoodLogSchema = z.object({
  id: idString,
  food_item_id: idString,
  food_item: z.record(z.string(), z.unknown()).optional(),
  date: dateString,
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  servings: finiteNumber.min(0).max(1000),
  calories: finiteNumber.min(0).max(100000),
  protein_g: finiteNumber.min(0).max(100000),
  carbs_g: finiteNumber.min(0).max(100000),
  fat_g: finiteNumber.min(0).max(100000),
  notes: z.string().max(1000).optional().default(''),
  created_at: isoString,
  quantity: finiteNumber.min(0).max(1000000).nullable().optional(),
  quantity_unit: quantityUnitSchema.nullable().optional(),
  food_name: z.string().max(200).nullable().optional(),
  is_estimated: z.boolean().optional(),
  fiber_g: finiteNumber.min(0).max(100000).nullable().optional(),
  sugar_g: finiteNumber.min(0).max(100000).nullable().optional(),
  sodium_mg: finiteNumber.min(0).max(1000000).nullable().optional(),
});

const backupFavoriteFoodSchema = z.object({
  id: idString,
  food_id: idString,
  created_at: isoString,
});

const backupRecipeSchema = z.object({
  id: idString,
  food_item_id: idString,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  category: z.string().max(64).optional().default(''),
  preparation: z.string().max(100).optional().default(''),
  yield_quantity: finiteNumber.min(0).max(1000000),
  yield_unit: z.enum(['g', 'ml']),
  serving_quantity: finiteNumber.min(0).max(1000000).nullable().optional(),
  serving_description: z.string().max(200).optional().default(''),
  source: foodSourceSchema.optional().default('user'),
  is_estimated: z.boolean().optional().default(false),
  created_at: isoString,
  updated_at: isoString,
});

const backupRecipeIngredientSchema = z.object({
  id: idString,
  recipe_id: idString,
  food_id: idString,
  food_name: z.string().max(200).optional().default(''),
  quantity: finiteNumber.min(0).max(1000000),
  quantity_unit: quantityUnitSchema,
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
  notes: z.string().max(500).optional().default(''),
  created_at: isoString,
});

const backupExerciseSchema = z.object({
  id: idString,
  name: z.string().min(1).max(200),
  muscle_group: z.string().max(32),
  equipment: z.string().max(200).optional().default(''),
  instructions: z.string().max(4000).optional().default(''),
  is_custom: z.boolean(),
  created_by: z.string().max(128).nullable().optional(),
  created_at: isoString,
});

const backupWorkoutSchema = z.object({
  id: idString,
  name: z.string().min(1).max(200),
  date: dateString,
  start_time: z.string().max(64),
  end_time: z.string().max(64).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  calories_burned: z.number().int().min(0).max(100000).nullable().optional(),
  notes: optText(2000),
  exercises: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  created_at: isoString,
});

const backupWorkoutExerciseSchema = z.object({
  id: idString,
  workout_id: idString,
  exercise_id: idString,
  exercise: z.record(z.string(), z.unknown()).nullable().optional(),
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
  notes: z.string().max(2000).optional().default(''),
  sets: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  created_at: isoString,
});

const backupExerciseSetSchema = z.object({
  id: idString,
  workout_exercise_id: idString,
  set_number: z.number().int().min(1).max(1000),
  reps: z.number().int().min(0).max(100000).nullable().optional(),
  weight_kg: finiteNumber.min(0).max(5000).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(1000000).nullable().optional(),
  distance_km: finiteNumber.min(0).max(1000000).nullable().optional(),
  is_warmup: z.boolean().optional().default(false),
  is_pr: z.boolean().optional().default(false),
  rpe: finiteNumber.min(0).max(10).nullable().optional(),
  created_at: isoString,
});

const backupBodyMetricSchema = z.object({
  id: idString,
  date: dateString,
  weight_kg: finiteNumber.min(20).max(500),
  height_cm: finiteNumber.min(50).max(300),
  body_fat_percentage: z.number().min(0).max(100).nullable().optional(),
  bmi: finiteNumber.min(5).max(100).nullable().optional(),
  waist_cm: finiteNumber.min(0).max(300).nullable().optional(),
  chest_cm: finiteNumber.min(0).max(300).nullable().optional(),
  arms_cm: finiteNumber.min(0).max(200).nullable().optional(),
  thighs_cm: finiteNumber.min(0).max(300).nullable().optional(),
  notes: z.string().max(1000).optional().default(''),
  created_at: isoString,
});

const backupHabitSchema = z.object({
  id: idString,
  name: z.string().min(1).max(100),
  icon: z.string().max(64).optional().default(''),
  color: z.string().max(32).optional().default('#f59e0b'),
  target_value: z.number().int().min(1).max(1000000),
  unit: z.string().max(32),
  frequency: z.enum(['daily', 'weekly']),
  is_default: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
  created_at: isoString,
  updated_at: isoString,
});

const backupHabitLogSchema = z.object({
  id: idString,
  habit_id: idString,
  date: dateString,
  value: z.number().int().min(0).max(1000000),
  completed: z.boolean(),
  notes: z.string().max(1000).optional().default(''),
  created_at: isoString,
});

const backupTargetHistorySchema = z.object({
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
  created_at: isoString,
});

const backupWeeklyPlanSchema = z
  .object({
    days: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    prs: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    updatedAt: z.string().max(64).optional().default(''),
  })
  .nullable();

export const backupDataSchema = z.object({
  profile: backupProfileSchema.nullable(),
  foodItems: z.array(backupFoodItemSchema).max(5000),
  foodLogs: z.array(backupFoodLogSchema).max(20000),
  favoriteFoods: z.array(backupFavoriteFoodSchema).max(2000),
  recipes: z.array(backupRecipeSchema).max(2000),
  recipeIngredients: z.array(backupRecipeIngredientSchema).max(10000),
  exercises: z.array(backupExerciseSchema).max(2000),
  workouts: z.array(backupWorkoutSchema).max(5000),
  workoutExercises: z.array(backupWorkoutExerciseSchema).max(20000),
  exerciseSets: z.array(backupExerciseSetSchema).max(100000),
  bodyMetrics: z.array(backupBodyMetricSchema).max(5000),
  habits: z.array(backupHabitSchema).max(1000),
  habitLogs: z.array(backupHabitLogSchema).max(20000),
  targetHistory: z.array(backupTargetHistorySchema).max(2000),
  weeklyPlan: backupWeeklyPlanSchema.optional(),
});

export const backupEnvelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int(),
  exportedAt: z.string().min(1).max(64),
  appVersion: z.string().max(32),
  data: backupDataSchema,
});

export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;
export type BackupData = z.infer<typeof backupDataSchema>;
