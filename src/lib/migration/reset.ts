// =============================================
// FuelUp - Local data reset (explicit user action only)
// Clears one owner's IndexedDB namespace + legacy localStorage payloads.
// Used by Settings → Reset. Never called automatically.
// =============================================
import { STORAGE_KEYS } from '@/config/app';
import { whereOwnerKeys } from '@/lib/repositories/base';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { getLocalDb } from '@/lib/db/local-db';
import { logger } from '@/lib/logger/logger';

async function deleteWhereOwner(
  table: Parameters<typeof whereOwnerKeys>[0] & { bulkDelete(k: string[]): Promise<unknown> },
  ownerId: string
): Promise<void> {
  const keys = await whereOwnerKeys(table, ownerId);
  if (keys.length > 0) await table.bulkDelete(keys);
}

/** Delete everything owned by `ownerId` locally (IndexedDB + legacy keys). */
export async function clearOwnerLocalData(
  ownerId: string,
  db: FuelUpLocalDb = getLocalDb()
): Promise<void> {
  try {
    await deleteWhereOwner(db.bodyMetrics, ownerId);
    await deleteWhereOwner(db.foodItems, ownerId);
    await deleteWhereOwner(db.foodLogs, ownerId);
    await deleteWhereOwner(db.exercises, ownerId);
    await deleteWhereOwner(db.workouts, ownerId);
    await deleteWhereOwner(db.workoutExercises, ownerId);
    await deleteWhereOwner(db.exerciseSets, ownerId);
    await deleteWhereOwner(db.habits, ownerId);
    await deleteWhereOwner(db.habitLogs, ownerId);
    await deleteWhereOwner(db.favoriteFoods, ownerId);
    await deleteWhereOwner(db.recipes, ownerId);
    await deleteWhereOwner(db.recipeIngredients, ownerId);
    await deleteWhereOwner(db.targetHistory, ownerId);
    await deleteWhereOwner(db.outbox, ownerId);
    await db.profiles.delete(ownerId);
    await db.weeklyPlans.delete(ownerId);
    // Meta markers embed the owner at the end (`name:key:owner`).
    const allMeta = await db.meta.toArray();
    await db.meta.bulkDelete(allMeta.filter((m) => m.key.endsWith(`:${ownerId}`)).map((m) => m.key));

    if (typeof window !== 'undefined') {
      for (const key of Object.values(STORAGE_KEYS)) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (error) {
    logger.error('Local reset failed', {});
    void error;
    throw error;
  }
}
