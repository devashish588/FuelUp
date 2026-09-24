// =============================================
// FuelUp - Local (IndexedDB) schema definition (single place)
// Database: FuelUpLocalDB v5 (v2 adds the sync `outbox`, v3 adds
// `favoriteFoods`, v4 adds `recipes` + `recipeIngredients`, v5 adds
// `targetHistory`; Dexie upgrades older databases in place — domain data is
// preserved, only tables added).
// Bump LOCAL_DB_VERSION + extend version blocks in local-db.ts on change.
// =============================================

export const LOCAL_DB_NAME = 'FuelUpLocalDB';
export const LOCAL_DB_VERSION = 5;

/**
 * Date convention (binding for all repositories):
 * - `date` fields are LOCAL calendar-day strings `YYYY-MM-DD`
 *   (see toDateString). Never UTC-shift them; habit heatmaps group by them.
 * - `created_at` / ISO timestamps are audit/order fields, never grouping keys.
 */
export const LOCAL_STORES = {
  profiles: 'ownerId',
  foodItems: 'id, ownerId',
  foodLogs: 'id, [ownerId+date], [ownerId+date+meal_type]',
  exercises: 'id, ownerId',
  workouts: 'id, [ownerId+date], ownerId',
  workoutExercises: 'id, workout_id, ownerId',
  exerciseSets: 'id, workout_exercise_id, ownerId',
  bodyMetrics: 'id, [ownerId+date], ownerId',
  habits: 'id, ownerId',
  habitLogs: 'id, [ownerId+habit_id+date], [ownerId+date]',
  weeklyPlans: 'ownerId',
  meta: 'key',
  /** Sync outbox: pending mutations awaiting push (Phase 3). */
  outbox: 'id, [ownerId+status], [ownerId+status+nextAttemptAt]',
  /** Explicit user favorites (seed + custom foods). Phase 5. */
  favoriteFoods: 'id, [ownerId+food_id], ownerId',
  /** Saved recipes + their ingredient rows. Phase 6. */
  recipes: 'id, ownerId',
  recipeIngredients: 'id, [ownerId+recipe_id], ownerId',
  /** Append-only target-change events. Phase 7. */
  targetHistory: 'id, [ownerId+date], ownerId',
} as const;

/** v1 shape (pre-sync): identical minus the outbox, for in-place upgrades. */
export const LOCAL_STORES_V1: Record<string, string> = {
  profiles: LOCAL_STORES.profiles,
  foodItems: LOCAL_STORES.foodItems,
  foodLogs: LOCAL_STORES.foodLogs,
  exercises: LOCAL_STORES.exercises,
  workouts: LOCAL_STORES.workouts,
  workoutExercises: LOCAL_STORES.workoutExercises,
  exerciseSets: LOCAL_STORES.exerciseSets,
  bodyMetrics: LOCAL_STORES.bodyMetrics,
  habits: LOCAL_STORES.habits,
  habitLogs: LOCAL_STORES.habitLogs,
  weeklyPlans: LOCAL_STORES.weeklyPlans,
  meta: LOCAL_STORES.meta,
};

/** v2 shape (pre-favorites): identical minus favoriteFoods. */
export const LOCAL_STORES_V2: Record<string, string> = {
  ...LOCAL_STORES_V1,
  outbox: LOCAL_STORES.outbox,
};

/** v3 shape (pre-recipes): identical minus recipes + recipeIngredients. */
export const LOCAL_STORES_V3: Record<string, string> = {
  ...LOCAL_STORES_V2,
  favoriteFoods: LOCAL_STORES.favoriteFoods,
};

/** v4 shape (pre-target-history): identical minus targetHistory. */
export const LOCAL_STORES_V4: Record<string, string> = {
  ...LOCAL_STORES_V3,
  recipes: LOCAL_STORES.recipes,
  recipeIngredients: LOCAL_STORES.recipeIngredients,
};
