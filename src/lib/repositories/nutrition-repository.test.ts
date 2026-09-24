import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import {
  addFavorite,
  addFoodLog,
  listAllFoodLogs,
  listCustomFoods,
  listFavorites,
  listFoodLogsForDate,
  removeFavorite,
  removeFoodLog,
  saveCustomFood,
  updateFoodLog,
} from './nutrition-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

function food(id: string) {
  return {
    id,
    name: 'Oats',
    brand: '',
    serving_size: 1,
    serving_unit: 'serving',
    calories_per_serving: 150,
    protein_g: 5,
    carbs_g: 27,
    fat_g: 3,
    fiber_g: 4,
    barcode: null,
    is_custom: true,
    created_by: null,
    created_at: new Date().toISOString(),
  };
}

function foodLog(id: string, date: string) {
  return {
    id,
    user_id: OWNER_A,
    food_item_id: 'food-0',
    date,
    meal_type: 'breakfast' as const,
    servings: 1,
    calories: 150,
    protein_g: 5,
    carbs_g: 27,
    fat_g: 3,
    notes: '',
    created_at: new Date().toISOString(),
  };
}

describe('nutrition repository', () => {
  it('stores custom foods and logs per owner', async () => {
    await saveCustomFood(OWNER_A, food('cf-1'), db);
    await addFoodLog(OWNER_A, foodLog('fl-1', '2026-09-22'), db);
    await addFoodLog(OWNER_A, foodLog('fl-2', '2026-09-22'), db);
    expect(await listCustomFoods(OWNER_A, db)).toHaveLength(1);
    expect(await listFoodLogsForDate(OWNER_A, '2026-09-22', db)).toHaveLength(2);
    expect(await listCustomFoods(OWNER_B, db)).toHaveLength(0);
    expect(await listAllFoodLogs(OWNER_B, db)).toHaveLength(0);
  });

  it('allows repeated logs on the same day (legit events, not dupes)', async () => {
    await addFoodLog(OWNER_A, foodLog('fl-1', '2026-09-22'), db);
    await addFoodLog(OWNER_A, foodLog('fl-2', '2026-09-22'), db);
    expect(await listFoodLogsForDate(OWNER_A, '2026-09-22', db)).toHaveLength(2);
  });

  it('deletes only within the owner namespace', async () => {
    await addFoodLog(OWNER_A, foodLog('fl-1', '2026-09-22'), db);
    await removeFoodLog(OWNER_B, 'fl-1', db);
    expect(await listFoodLogsForDate(OWNER_A, '2026-09-22', db)).toHaveLength(1);
    await removeFoodLog(OWNER_A, 'fl-1', db);
    expect(await listFoodLogsForDate(OWNER_A, '2026-09-22', db)).toHaveLength(0);
  });

  it('edits a log and re-syncs the merged snapshot', async () => {
    await addFoodLog(OWNER_A, foodLog('fl-1', '2026-09-22'), db);
    const updated = await updateFoodLog(
      OWNER_A,
      'fl-1',
      { quantity: 250, quantity_unit: 'g', servings: 2.5, calories: 375, meal_type: 'lunch' as const },
      db
    );
    expect(updated).toMatchObject({ quantity: 250, quantity_unit: 'g', servings: 2.5, calories: 375, meal_type: 'lunch' });
    const rows = await listFoodLogsForDate(OWNER_A, '2026-09-22', db);
    expect(rows[0]).toMatchObject({ quantity: 250, meal_type: 'lunch' });
    // Cross-owner edit is a no-op.
    expect(await updateFoodLog(OWNER_B, 'fl-1', { calories: 1 }, db)).toBeNull();
    // Outbox carries the merged upsert.
    const outbox = await db.outbox.where('[ownerId+status]').equals([OWNER_A, 'pending']).toArray();
    expect(outbox.some((e) => e.entity === 'foodLog' && e.entityId === 'fl-1' && e.operation === 'upsert')).toBe(true);
  });

  it('freezes snapshots: later food edits never rewrite logged history', async () => {
    await saveCustomFood(OWNER_A, { ...food('cf-1'), calories_per_serving: 150 }, db);
    await addFoodLog(
      OWNER_A,
      { ...foodLog('fl-1', '2026-09-22'), food_name: 'Oats', calories: 150 },
      db
    );
    // Food definition changes tomorrow...
    await saveCustomFood(OWNER_A, { ...food('cf-1'), name: 'Oats (new recipe)', calories_per_serving: 200 }, db);
    // ...yesterday's log keeps its snapshot.
    const rows = await listFoodLogsForDate(OWNER_A, '2026-09-22', db);
    expect(rows[0]).toMatchObject({ food_name: 'Oats', calories: 150 });
  });

  it('manages explicit favorites per owner (seed + custom ids alike)', async () => {
    const fav = { id: 'fav-1', user_id: OWNER_A, food_id: 'food-7', created_at: new Date().toISOString() };
    await addFavorite(OWNER_A, fav, db);
    expect(await listFavorites(OWNER_A, db)).toHaveLength(1);
    expect(await listFavorites(OWNER_B, db)).toHaveLength(0);
    await removeFavorite(OWNER_B, 'fav-1', db); // cross-owner: no-op
    expect(await listFavorites(OWNER_A, db)).toHaveLength(1);
    await removeFavorite(OWNER_A, 'fav-1', db);
    expect(await listFavorites(OWNER_A, db)).toHaveLength(0);
  });

  it('creates outbox mutations offline (no network involved)', async () => {
    await addFoodLog(OWNER_A, foodLog('fl-off', '2026-09-22'), db);
    const pending = await db.outbox.where('[ownerId+status]').equals([OWNER_A, 'pending']).toArray();
    expect(pending.map((e) => `${e.entity}:${e.entityId}`)).toContain('foodLog:fl-off');
  });
});
