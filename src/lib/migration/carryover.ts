// =============================================
// FuelUp - Device → user carryover (client)
// When a device-local namespace (`local:<uuid>`) already holds data and the
// user signs in, copy it once into the authenticated owner's namespace.
// Merge-by-id (existing user rows win), never move/delete the source, and
// record a marker so reruns are no-ops.
// =============================================
import type { Table } from 'dexie';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { getLocalDb } from '@/lib/db/local-db';
import { logger } from '@/lib/logger/logger';

function markerFor(fromOwner: string, toOwner: string): string {
  return `carryover:${fromOwner}:${toOwner}`;
}

async function copyTable<T extends { ownerId: string; id: string }>(
  table: Table<T, string>,
  fromOwner: string,
  toOwner: string
): Promise<number> {
  const source = await table.where('ownerId').equals(fromOwner).toArray();
  let copied = 0;
  const batch: T[] = [];
  for (const row of source) {
    if (row.id) {
      const existing = await table.get(row.id);
      // Same id in the user namespace wins (e.g. migrated twice) — skip.
      if (existing && existing.ownerId === toOwner) continue;
    }
    batch.push({ ...row, ownerId: toOwner });
    copied++;
  }
  if (batch.length > 0) await table.bulkPut(batch);
  return copied;
}

export async function carryOverDeviceDataToUser(
  fromOwner: string,
  toOwner: string,
  db: FuelUpLocalDb = getLocalDb()
): Promise<{ copied: number; skipped: boolean }> {
  if (fromOwner === toOwner) return { copied: 0, skipped: true };
  try {
    const marker = markerFor(fromOwner, toOwner);
    if (await db.meta.get(marker)) return { copied: 0, skipped: true };

    let copied = 0;
    copied += await copyTable(db.bodyMetrics, fromOwner, toOwner);
    copied += await copyTable(db.foodItems, fromOwner, toOwner);
    copied += await copyTable(db.foodLogs, fromOwner, toOwner);
    copied += await copyTable(db.exercises, fromOwner, toOwner);
    copied += await copyTable(db.workouts, fromOwner, toOwner);
    copied += await copyTable(db.workoutExercises, fromOwner, toOwner);
    copied += await copyTable(db.exerciseSets, fromOwner, toOwner);
    copied += await copyTable(db.habits, fromOwner, toOwner);
    copied += await copyTable(db.habitLogs, fromOwner, toOwner);
    copied += await copyTable(db.favoriteFoods, fromOwner, toOwner);
    copied += await copyTable(db.recipes, fromOwner, toOwner);
    copied += await copyTable(db.recipeIngredients, fromOwner, toOwner);
    copied += await copyTable(db.targetHistory, fromOwner, toOwner);

    // Single-row tables: only carry over when the user has none.
    if (!(await db.profiles.get(toOwner))) {
      const profile = await db.profiles.get(fromOwner);
      if (profile) {
        await db.profiles.put({ ...profile, ownerId: toOwner });
        copied++;
      }
    }
    if (!(await db.weeklyPlans.get(toOwner))) {
      const plan = await db.weeklyPlans.get(fromOwner);
      if (plan) {
        await db.weeklyPlans.put({ ...plan, ownerId: toOwner });
        copied++;
      }
    }

    await db.meta.put({ key: marker, value: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return { copied, skipped: false };
  } catch (error) {
    logger.error('Carryover device → user failed', {});
    void error;
    return { copied: 0, skipped: true };
  }
}
