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
  created_at: string;
  updated_at: string;
}

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extremely_active';

export type GoalType = 'cut' | 'bulk' | 'recomp';

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
