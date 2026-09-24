// =============================================
// FuelUp - Local persistence entities (IndexedDB rows)
// Rule: every user-owned row carries `ownerId` (the local owner namespace,
// see src/lib/session). Static seed catalogs (FOOD_DATABASE,
// EXERCISE_DATABASE) are NOT stored here — they ship with the bundle.
// Entities otherwise mirror the domain shapes in @/lib/types exactly so
// local <-> domain mapping is a trivial ownerId strip/add (see mappers).
// =============================================
import type {
  BodyMetric,
  Exercise,
  ExerciseSet,
  FavoriteFood,
  FoodItem,
  FoodLog,
  Habit,
  HabitLog,
  Profile,
  Recipe,
  RecipeIngredient,
  TargetHistory,
  Workout,
  WorkoutExercise,
} from '@/lib/types';

export type Owned<T> = T & { ownerId: string };

export type LocalProfile = Owned<Profile>;
export type LocalFoodItem = Owned<FoodItem>;
export type LocalFoodLog = Owned<FoodLog> & { food_item?: FoodItem };
export type LocalFavoriteFood = Owned<FavoriteFood>;
export type LocalRecipe = Owned<Recipe>;
export type LocalRecipeIngredient = Owned<RecipeIngredient>;
/** Append-only target-change events (Phase 7). Derived analytics are never stored. */
export type LocalTargetHistory = Owned<TargetHistory>;
export type LocalExercise = Owned<Exercise>;
export type LocalWorkout = Owned<Workout>;
export type LocalWorkoutExercise = Owned<WorkoutExercise>;
export type LocalExerciseSet = Owned<ExerciseSet>;
export type LocalBodyMetric = Owned<BodyMetric>;
export type LocalHabit = Owned<Habit>;
export type LocalHabitLog = Owned<HabitLog>;

/** Weekly routine plan + lightweight PRs: one row per owner.
 *  PRs here are the legacy planner shape (heaviest set per exercise name),
 *  distinct from the canonical PersonalRecord server model (a future table).
 *  Water/sleep/activity need no tables: water + sleep are habits, activity
 *  level lives on the profile, and daily summaries are derived (see
 *  calculations/nutrition + analytics), never stored. */
export interface LocalWeeklyPlan {
  ownerId: string;
  days: {
    day: string;
    label: string;
    exercises: {
      id: string;
      exercise_id: string;
      exercise_name: string;
      sets: number;
      reps: string;
      notes: string;
    }[];
  }[];
  prs: {
    id: string;
    exercise_id: string;
    exercise_name: string;
    weight_kg: number;
    reps: number;
    date: string;
    notes: string;
  }[];
  updatedAt: string;
}

/** Migration / bookkeeping markers. Keyed `scope:name[:owner]`. */
export interface LocalMeta {
  key: string;
  value: string;
  updatedAt: string;
}
