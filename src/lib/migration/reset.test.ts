// Phase 10.5 — reset/carryover regression: owner-scoped helpers must work
// on EVERY table, including compound-only indexes (foodLogs, habitLogs,
// outbox) where plain .where('ownerId') silently matches nothing.
import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, metric, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { whereOwner } from '@/lib/repositories/base';
import { clearOwnerLocalData } from '@/lib/migration/reset';
import { carryOverDeviceDataToUser } from '@/lib/migration/carryover';
import { addFoodLog } from '@/lib/repositories/nutrition-repository';
import { upsertHabitLog } from '@/lib/repositories/habit-repository';
import { countPendingEvents } from '@/lib/sync/outbox';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

const now = () => new Date().toISOString();

async function seedFoodLog(owner: string, id = 'fl-1') {
  await addFoodLog(owner, {
    id, user_id: owner, food_item_id: 'f', date: '2026-09-22', meal_type: 'breakfast',
    servings: 1, calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1, notes: '', created_at: now(),
  }, db);
}

async function seedHabitLog(owner: string, id = 'hl-1') {
  await upsertHabitLog(owner, {
    id, habit_id: 'h-1', user_id: owner, date: '2026-09-22', value: 1,
    completed: true, notes: '', created_at: now(),
  }, db);
}

describe('clearOwnerLocalData', () => {
  it('clears compound-index tables (foodLogs, habitLogs) and the outbox', async () => {
    await seedFoodLog(OWNER_A);
    await seedHabitLog(OWNER_A);
    expect(await countPendingEvents(OWNER_A, db)).toBeGreaterThan(0);
    await clearOwnerLocalData(OWNER_A, db);
    expect(await whereOwner(db.foodLogs, OWNER_A)).toHaveLength(0);
    expect(await whereOwner(db.habitLogs, OWNER_A)).toHaveLength(0);
    expect(await countPendingEvents(OWNER_A, db)).toBe(0);
    expect(await db.profiles.get(OWNER_A)).toBeUndefined();
  });

  it('never touches another owner namespace', async () => {
    await seedFoodLog(OWNER_A);
    await seedFoodLog(OWNER_B, 'fl-2');
    await clearOwnerLocalData(OWNER_A, db);
    expect((await whereOwner(db.foodLogs, OWNER_B)).length).toBe(1);
  });
});

describe('carryOverDeviceDataToUser', () => {
  it('copies compound-index rows (foodLogs, habitLogs) on sign-in', async () => {
    await seedFoodLog(OWNER_A);
    await seedHabitLog(OWNER_A);
    const result = await carryOverDeviceDataToUser(OWNER_A, OWNER_B, db);
    expect(result.skipped).toBe(false);
    expect((await whereOwner(db.foodLogs, OWNER_B)).length).toBe(1);
    expect((await whereOwner(db.habitLogs, OWNER_B)).length).toBe(1);
    // Copy-by-id: the same primary key now lives under the new owner
    // (device-local namespaces are abandoned after sign-in).
    expect(await db.foodLogs.get('fl-1')).toMatchObject({ ownerId: OWNER_B });
  });
});

describe('whereOwner helper', () => {
  it('finds rows regardless of declared indexes', async () => {
    await seedFoodLog(OWNER_A);
    await seedHabitLog(OWNER_A);
    const { saveMetricForDate } = await import('@/lib/repositories/metrics-repository');
    await saveMetricForDate(OWNER_A, { ...metric({}), user_id: OWNER_A }, db);
    expect((await whereOwner(db.foodLogs, OWNER_A)).length).toBe(1);
    expect((await whereOwner(db.habitLogs, OWNER_A)).length).toBe(1);
    expect((await whereOwner(db.bodyMetrics, OWNER_A)).length).toBe(1);
    expect((await whereOwner(db.foodLogs, OWNER_B)).length).toBe(0);
  });
});
