// =============================================
// FuelUp App - TypeScript Type Definitions
// =============================================

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  activity_level: ActivityLevel;
  goal: GoalType;
  unit_system: 'metric' | 'imperial';
  daily_calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  /** Phase 7: explicit weekly target rate (kg/week magnitude). Null = goal default. */
  target_rate_kg_per_week: number | null;
  /** Phase 7: who set the current target — onboarding estimate, adaptive engine, or manual edit. */
  target_source: 'initial' | 'adaptive' | 'manual';
  created_at: string;
  updated_at: string;
}

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active';

export type GoalType = 'cut' | 'bulk' | 'recomp' | 'maintain' | 'custom';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'legs'
  | 'arms'
  | 'core'
  | 'cardio'
  | 'full_body';

export interface BodyMetric {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  height_cm: number;
  body_fat_percentage: number | null;
  bmi: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arms_cm: number | null;
  thighs_cm: number | null;
  notes: string;
  created_at: string;
}

export interface FoodItem {
  id: string;
  name: string;
  brand: string;
  serving_size: number;
  serving_unit: string;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  barcode: string | null;
  is_custom: boolean;
  created_by: string | null;
  created_at: string;
  // --- Phase 5: quantity-first model, provenance, classification ---
  /** Stable category key, e.g. 'staples' | 'protein' | 'legumes'. */
  category?: string;
  /** Where this nutrition data came from (see FoodSource). */
  source?: FoodSource;
  /** External id within the source system, if any. */
  source_id?: string | null;
  /** Alternate names matched by search, e.g. ['chapati', 'phulka']. */
  aliases?: string[];
  /** Grams per 1 count (e.g. egg ≈ 50). Enables count ⇄ gram conversion. */
  count_weight_g?: number | null;
  /** raw | cooked | prepared — part of the definition, not the name. */
  food_state?: FoodState;
  /** Free-text method where known, e.g. 'grilled', 'curry'. */
  preparation?: string;
  /** Household serving hint, e.g. '1 roti (40 g)'. Display only. */
  serving_description?: string;
  sugar_g?: number | null;
  sodium_mg?: number | null;
  /** True when values are approximate — UI must not show false precision. */
  is_estimated?: boolean;
}

export interface FoodLog {
  id: string;
  user_id: string;
  food_item_id: string;
  food_item?: FoodItem;
  date: string;
  meal_type: MealType;
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string;
  created_at: string;
  // --- Phase 5: quantity-first input + frozen snapshot ---
  /** Quantity as entered by the user. */
  quantity?: number;
  /** Unit the quantity was entered in. */
  quantity_unit?: QuantityUnit;
  /** Snapshot of the food name at log time (survives food edits/deletes). */
  food_name?: string;
  /** Snapshot of the food's estimate flag at log time. */
  is_estimated?: boolean;
  fiber_g?: number | null;
  sugar_g?: number | null;
  sodium_mg?: number | null;
}

/** Normalized measurable quantity units supported for food input. */
export type QuantityUnit = 'g' | 'kg' | 'ml' | 'L' | 'count' | 'serving';

/** Provenance of a food's nutrition data. */
export type FoodSource =
  | 'builtin'
  | 'verified'
  | 'branded'
  | 'user'
  | 'recipe'
  | 'imported'
  | 'estimated';

/** Physical state captured in the food definition (key for raw⇄cooked). */
export type FoodState = 'raw' | 'cooked' | 'prepared' | '';

/** Explicit user favorite — works for seed and custom foods alike. */
export interface FavoriteFood {
  id: string;
  user_id: string;
  food_id: string;
  created_at: string;
}

/** Canonical daily nutrition rollup (see calculateDailyNutrition). */
export interface DailyNutrition {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  /** Null when no contributing log carries the value ("where data exists"). */
  sugar_g: number | null;
  /** Null when no contributing log carries the value. */
  sodium_mg: number | null;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
}

export interface Exercise {
  id: string;
  name: string;
  muscle_group: MuscleGroup;
  equipment: string;
  instructions: string;
  is_custom: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Workout {
  id: string;
  user_id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  calories_burned: number | null;
  notes: string;
  exercises: WorkoutExercise[];
  created_at: string;
}

export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise?: Exercise;
  sort_order: number;
  notes: string;
  sets: ExerciseSet[];
  created_at: string;
}

export interface ExerciseSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  is_warmup: boolean;
  is_pr: boolean;
  rpe: number | null;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  target_value: number;
  unit: string;
  frequency: 'daily' | 'weekly';
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface HabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  date: string;
  value: number;
  completed: boolean;
  notes: string;
  created_at: string;
}

export interface PersonalRecord {
  id: string;
  user_id: string;
  exercise_id: string;
  exercise?: Exercise;
  record_type: '1rm' | '3rm' | '5rm' | 'max_reps' | 'max_duration' | 'max_distance';
  value: number;
  unit: string;
  date_achieved: string;
  workout_id: string | null;
  notes: string;
  created_at: string;
}

export interface DailySummary {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
}

export interface Recommendation {
  goal: GoalType;
  reason: string;
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  tdee: number;
  bmr: number;
  bmi: number;
}

// =============================================
// Phase 6: Recipes + home-cooked meal engine
// A saved recipe materializes as a FoodItem (source='recipe', same id,
// per-100g basis) so search / recent / favorites / logging / snapshots all
// work unchanged. Recipe + RecipeIngredient tables hold the editable
// structure; FoodLog rows hold the frozen consumed snapshot.
// =============================================

/** Yield/serving quantity unit for a recipe (weight or volume only). */
export type RecipeYieldUnit = 'g' | 'ml';

export interface Recipe {
  id: string;
  user_id: string;
  /** Same id as the materialized FoodItem row. */
  food_item_id: string;
  name: string;
  description: string;
  category: string;
  preparation: string;
  /** Final cooked weight/volume. Basis for per-100 nutrition. */
  yield_quantity: number;
  yield_unit: RecipeYieldUnit;
  /** Optional household serving, expressed in yield units (e.g. 190 g). */
  serving_quantity: number | null;
  /** Display hint only, e.g. '1 bowl ≈ 190 g'. Never a stored quantity. */
  serving_description: string;
  source: FoodSource;
  is_estimated: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  user_id: string;
  food_id: string;
  /** Food name at add time (survives food renames in the builder). */
  food_name: string;
  quantity: number;
  quantity_unit: QuantityUnit;
  sort_order: number;
  notes: string;
  created_at: string;
}

// =============================================
// Phase 7: Adaptive energy + weight trend engine
// Raw facts (food logs, weight measurements, profile, goals) are stored;
// maintenance estimates, trends, and targets are derived deterministically.
// TargetHistory rows are append-only change events so users can see why
// their target moved. Never store daily TDEE / chart points / trend arrays.
// =============================================

/** Where the current calorie target came from. */
export type TargetSource = 'initial' | 'adaptive' | 'manual';

/** Append-only record of an applied target change (synced like other facts). */
export interface TargetHistory {
  id: string;
  user_id: string;
  /** Local calendar day the change was applied (YYYY-MM-DD). */
  date: string;
  previous_target: number;
  new_target: number;
  /** Deterministic, rule-generated reason (never AI text). */
  reason: string;
  /** Observed maintenance estimate behind the change, if adaptive. */
  maintenance_estimate: number | null;
  /** Valid nutrition days used in the window. */
  valid_days: number;
  /** Estimate confidence at apply time. */
  confidence: 'high' | 'medium' | 'low';
  /** Goal the new target was computed under (detects goal-driven changes). */
  goal: GoalType;
  /** Average valid-day intake (kcal) behind the change, if adaptive. */
  avg_intake_kcal: number | null;
  /** Phase 10.5: weekly target rate before/after a rate change (null when N/A). */
  previous_rate_kg_per_week: number | null;
  new_rate_kg_per_week: number | null;
  created_at: string;
}
