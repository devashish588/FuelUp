// =============================================
// FuelUp - Typed IndexedDB database (Dexie)
// Client-only. Never import from server code (API routes, services that
// run on the server). UI never touches this directly — only repositories.
// =============================================
import Dexie, { type Table } from 'dexie';
import { LOCAL_DB_NAME, LOCAL_DB_VERSION, LOCAL_STORES, LOCAL_STORES_V1, LOCAL_STORES_V2, LOCAL_STORES_V3, LOCAL_STORES_V4 } from './local-schema';
import type {
  LocalBodyMetric,
  LocalExercise,
  LocalExerciseSet,
  LocalFavoriteFood,
  LocalFoodItem,
  LocalFoodLog,
  LocalHabit,
  LocalHabitLog,
  LocalMeta,
  LocalProfile,
  LocalRecipe,
  LocalRecipeIngredient,
  LocalTargetHistory,
  LocalWeeklyPlan,
  LocalWorkout,
  LocalWorkoutExercise,
} from './local-entities';
import type { LocalOutboxEvent } from '@/lib/sync/sync-outbox-event';

export class FuelUpLocalDb extends Dexie {
  profiles!: Table<LocalProfile, string>;
  foodItems!: Table<LocalFoodItem, string>;
  foodLogs!: Table<LocalFoodLog, string>;
  exercises!: Table<LocalExercise, string>;
  workouts!: Table<LocalWorkout, string>;
  workoutExercises!: Table<LocalWorkoutExercise, string>;
  exerciseSets!: Table<LocalExerciseSet, string>;
  bodyMetrics!: Table<LocalBodyMetric, string>;
  habits!: Table<LocalHabit, string>;
  habitLogs!: Table<LocalHabitLog, string>;
  weeklyPlans!: Table<LocalWeeklyPlan, string>;
  meta!: Table<LocalMeta, string>;
  outbox!: Table<LocalOutboxEvent, string>;
  favoriteFoods!: Table<LocalFavoriteFood, string>;
  recipes!: Table<LocalRecipe, string>;
  recipeIngredients!: Table<LocalRecipeIngredient, string>;
  targetHistory!: Table<LocalTargetHistory, string>;

  constructor(name: string = LOCAL_DB_NAME) {
    super(name);
    // Baselines (existing installs upgrade in place; data preserved).
    this.version(1).stores({ ...LOCAL_STORES_V1 });
    this.version(2).stores({ ...LOCAL_STORES_V2 });
    this.version(3).stores({ ...LOCAL_STORES_V3 });
    this.version(4).stores({ ...LOCAL_STORES_V4 });
    this.version(LOCAL_DB_VERSION).stores({ ...LOCAL_STORES });
  }
}

let singleton: FuelUpLocalDb | undefined;

/** Lazily-created singleton. Safe to import on the server; never opened there. */
export function getLocalDb(): FuelUpLocalDb {
  if (!singleton) singleton = new FuelUpLocalDb();
  return singleton;
}

/** Throw a user-safe error when IndexedDB is unavailable (SSR/privacy mode). */
export function requireIndexedDB(): void {
  if (typeof indexedDB === 'undefined') {
    throw new Error('LOCAL_DB_UNAVAILABLE');
  }
}

/** Test-only: drop + recreate the database. Never call from app code. */
export async function resetLocalDbForTests(name?: string): Promise<FuelUpLocalDb> {
  const dbName = name ?? `${LOCAL_DB_NAME}-test-${Math.random().toString(36).slice(2)}`;
  await Dexie.delete(dbName);
  const db = new FuelUpLocalDb(dbName);
  await db.open();
  return db;
}
