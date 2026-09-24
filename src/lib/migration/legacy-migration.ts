// =============================================
// FuelUp - Legacy localStorage → IndexedDB migration
// Versioned, idempotent, retry-safe, non-destructive:
// - Reads the Phase-1 zustand/persist payloads (STORAGE_KEYS).
// - Skips static seed catalog entries (rebuilt from constants).
// - `put`/`bulkPut` (upsert by id) → reruns never duplicate.
// - Marks each key complete in the `meta` table per owner.
// - NEVER deletes the legacy keys (reset flow clears them explicitly).
// - Malformed payloads are skipped + logged, never thrown.
// =============================================
import { STORAGE_KEYS } from '@/config/app';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { getLocalDb } from '@/lib/db/local-db';
import type {
  LocalBodyMetric,
  LocalExercise,
  LocalFoodItem,
  LocalFoodLog,
  LocalHabit,
  LocalHabitLog,
  LocalProfile,
  LocalWeeklyPlan,
  LocalWorkout,
  LocalWorkoutExercise,
  LocalExerciseSet,
} from '@/lib/db/local-entities';
import { logger } from '@/lib/logger/logger';
import { withoutKeys } from '@/lib/repositories/base';
import type { BodyMetric, Exercise, FoodItem, FoodLog, Habit, HabitLog, Profile, Workout } from '@/lib/types';

const MIGRATION_NAME = 'legacy-localstorage-v1';

function markerFor(key: string, ownerId: string): string {
  return `${MIGRATION_NAME}:${key}:${ownerId}`;
}

function readLegacyState<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: T };
    if (!parsed || typeof parsed !== 'object' || !('state' in parsed)) return null;
    return (parsed.state ?? null) as T | null;
  } catch (error) {
    logger.error(`Legacy migration: unreadable payload for ${key}`, {});
    void error;
    return null;
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function hasIdDate(value: unknown): value is { id: string; date: string } {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.date === 'string';
}

function hasId(value: unknown): value is { id: string } {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>).id === 'string';
}

export interface MigrationResult {
  migrated: string[];
  skipped: string[];
}

/**
 * Migrate all legacy keys into `ownerId`'s IndexedDB namespace.
 * Safe to call on every boot; completed keys are skipped via markers.
 */
export async function migrateLegacyStorageToIdb(
  ownerId: string,
  db: FuelUpLocalDb = getLocalDb()
): Promise<MigrationResult> {
  const migrated: string[] = [];
  const skipped: string[] = [];

  async function alreadyDone(key: string): Promise<boolean> {
    try {
      return !!(await db.meta.get(markerFor(key, ownerId)));
    } catch {
      return false;
    }
  }

  async function done(key: string): Promise<void> {
    await db.meta.put({
      key: markerFor(key, ownerId),
      value: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // ---- profile ----
  try {
    if (await alreadyDone(STORAGE_KEYS.profile)) {
      skipped.push(STORAGE_KEYS.profile);
    } else {
      const state = readLegacyState<{ profile: unknown }>(STORAGE_KEYS.profile);
      if (state && hasId(state.profile)) {
        const row: LocalProfile = { ...(state.profile as Profile), ownerId };
        await db.profiles.put(row);
      }
      await done(STORAGE_KEYS.profile);
      migrated.push(STORAGE_KEYS.profile);
    }
  } catch (error) {
    logger.error('Legacy migration: profile failed', {});
    void error;
    skipped.push(STORAGE_KEYS.profile);
  }

  // ---- metrics ----
  try {
    if (await alreadyDone(STORAGE_KEYS.metrics)) {
      skipped.push(STORAGE_KEYS.metrics);
    } else {
      const state = readLegacyState<{ metrics: unknown }>(STORAGE_KEYS.metrics);
      const rows: LocalBodyMetric[] = asArray<BodyMetric>(state?.metrics)
        .filter(hasIdDate)
        .map((m) => ({ ...(m as BodyMetric), ownerId }));
      if (rows.length > 0) await db.bodyMetrics.bulkPut(rows);
      await done(STORAGE_KEYS.metrics);
      migrated.push(STORAGE_KEYS.metrics);
    }
  } catch (error) {
    logger.error('Legacy migration: metrics failed', {});
    void error;
    skipped.push(STORAGE_KEYS.metrics);
  }

  // ---- nutrition (custom foods + logs only; seeds rebuild from constants) ----
  try {
    if (await alreadyDone(STORAGE_KEYS.calories)) {
      skipped.push(STORAGE_KEYS.calories);
    } else {
      const state = readLegacyState<{ foodItems: unknown; foodLogs: unknown }>(STORAGE_KEYS.calories);
      const foods: LocalFoodItem[] = asArray<FoodItem>(state?.foodItems)
        .filter(
          (f): f is FoodItem => hasId(f) && (f as FoodItem).is_custom === true && !String((f as FoodItem).id).startsWith('food-')
        )
        .map((f) => ({ ...f, ownerId }));
      const logs: LocalFoodLog[] = asArray<FoodLog>(state?.foodLogs)
        .filter(hasIdDate)
        .map((l) => ({ ...(l as FoodLog), ownerId }));
      if (foods.length > 0) await db.foodItems.bulkPut(foods);
      if (logs.length > 0) await db.foodLogs.bulkPut(logs);
      await done(STORAGE_KEYS.calories);
      migrated.push(STORAGE_KEYS.calories);
    }
  } catch (error) {
    logger.error('Legacy migration: nutrition failed', {});
    void error;
    skipped.push(STORAGE_KEYS.calories);
  }

  // ---- workouts (finished only; the active draft is UI state) + customs ----
  try {
    if (await alreadyDone(STORAGE_KEYS.exercise)) {
      skipped.push(STORAGE_KEYS.exercise);
    } else {
      const state = readLegacyState<{ exercises: unknown; workouts: unknown }>(STORAGE_KEYS.exercise);
      const customs: LocalExercise[] = asArray<Exercise>(state?.exercises)
        .filter((e): e is Exercise => hasId(e) && (e as Exercise).is_custom === true)
        .map((e) => ({ ...e, ownerId }));
      if (customs.length > 0) await db.exercises.bulkPut(customs);
      const workouts = asArray<Workout>(state?.workouts).filter(hasId);
      for (const w of workouts) {
        const workout = w as Workout;
        const row: LocalWorkout = { ...workout, exercises: [], ownerId };
        await db.workouts.put(row);
        for (const we of workout.exercises ?? []) {
          if (!hasId(we)) continue;
          const { sets } = we;
          const weRow = withoutKeys(we, 'sets', 'exercise');
          const weLocal: LocalWorkoutExercise = { ...(weRow as typeof weRow), sets: [], ownerId };
          await db.workoutExercises.put(weLocal);
          for (const s of asArray(sets)) {
            if (!hasId(s)) continue;
            const setLocal: LocalExerciseSet = { ...(s as object), ownerId } as LocalExerciseSet;
            await db.exerciseSets.put(setLocal);
          }
        }
      }
      await done(STORAGE_KEYS.exercise);
      migrated.push(STORAGE_KEYS.exercise);
    }
  } catch (error) {
    logger.error('Legacy migration: workouts failed', {});
    void error;
    skipped.push(STORAGE_KEYS.exercise);
  }

  // ---- habits + logs (all, including former defaults — logs reference them) ----
  try {
    if (await alreadyDone(STORAGE_KEYS.habits)) {
      skipped.push(STORAGE_KEYS.habits);
    } else {
      const state = readLegacyState<{ habits: unknown; habitLogs: unknown }>(STORAGE_KEYS.habits);
      const habits: LocalHabit[] = asArray<Habit>(state?.habits)
        .filter(hasId)
        .map((h) => ({ ...(h as Habit), ownerId }));
      const logs: LocalHabitLog[] = asArray<HabitLog>(state?.habitLogs)
        .filter(hasIdDate)
        .map((l) => ({ ...(l as HabitLog), ownerId }));
      if (habits.length > 0) await db.habits.bulkPut(habits);
      if (logs.length > 0) await db.habitLogs.bulkPut(logs);
      await done(STORAGE_KEYS.habits);
      migrated.push(STORAGE_KEYS.habits);
    }
  } catch (error) {
    logger.error('Legacy migration: habits failed', {});
    void error;
    skipped.push(STORAGE_KEYS.habits);
  }

  // ---- planner (weekly plan + PRs, one row per owner) ----
  try {
    if (await alreadyDone(STORAGE_KEYS.workoutPlanner)) {
      skipped.push(STORAGE_KEYS.workoutPlanner);
    } else {
      const state = readLegacyState<{ weeklyPlan: unknown; prs: unknown }>(STORAGE_KEYS.workoutPlanner);
      const days = asArray<LocalWeeklyPlan['days'][number]>(state?.weeklyPlan).filter(
        (d) => !!d && typeof d === 'object' && typeof (d as { day?: unknown }).day === 'string'
      );
      const prs = asArray<LocalWeeklyPlan['prs'][number]>(state?.prs).filter(hasId);
      if (days.length > 0 || prs.length > 0) {
        const row: LocalWeeklyPlan = {
          ownerId,
          days: days as LocalWeeklyPlan['days'],
          prs: prs as LocalWeeklyPlan['prs'],
          updatedAt: new Date().toISOString(),
        };
        await db.weeklyPlans.put(row);
      }
      await done(STORAGE_KEYS.workoutPlanner);
      migrated.push(STORAGE_KEYS.workoutPlanner);
    }
  } catch (error) {
    logger.error('Legacy migration: planner failed', {});
    void error;
    skipped.push(STORAGE_KEYS.workoutPlanner);
  }

  return { migrated, skipped };
}
