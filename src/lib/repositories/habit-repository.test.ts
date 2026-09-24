import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import {
  createHabit,
  listAllHabitLogs,
  listHabitLogsForDate,
  listHabitLogsInRange,
  listHabits,
  removeHabit,
  updateHabit,
  upsertHabitLog,
} from './habit-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

function habit(id: string) {
  const now = new Date().toISOString();
  return {
    id,
    user_id: OWNER_A,
    name: `Habit ${id}`,
    icon: 'target',
    color: '#f59e0b',
    target_value: 1,
    unit: 'times',
    frequency: 'daily' as const,
    is_default: false,
    is_active: true,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };
}

function log(id: string, habitId: string, date: string, completed = true) {
  return {
    id,
    habit_id: habitId,
    user_id: OWNER_A,
    date,
    value: 1,
    completed,
    notes: '',
    created_at: new Date().toISOString(),
  };
}

describe('habit repository', () => {
  it('creates, lists, updates, and deletes habits', async () => {
    await createHabit(OWNER_A, habit('h-1'), db);
    expect(await listHabits(OWNER_A, db)).toHaveLength(1);
    expect(await listHabits(OWNER_B, db)).toHaveLength(0);
    await updateHabit(OWNER_A, 'h-1', { name: 'Renamed' }, db);
    expect((await listHabits(OWNER_A, db))[0].name).toBe('Renamed');
    await updateHabit(OWNER_B, 'h-1', { name: 'Hijacked' }, db);
    expect((await listHabits(OWNER_A, db))[0].name).toBe('Renamed');
    await removeHabit(OWNER_A, 'h-1', db);
    expect(await listHabits(OWNER_A, db)).toHaveLength(0);
  });

  it('upserts same-day logs (rapid double-tap creates one row)', async () => {
    await createHabit(OWNER_A, habit('h-1'), db);
    await upsertHabitLog(OWNER_A, log('l-1', 'h-1', '2026-09-22'), db);
    await upsertHabitLog(OWNER_A, log('l-2', 'h-1', '2026-09-22'), db);
    const logs = await listHabitLogsForDate(OWNER_A, '2026-09-22', db);
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe('l-2');
  });

  it('answers date-bounded heatmap queries (month slices)', async () => {
    await createHabit(OWNER_A, habit('h-1'), db);
    await upsertHabitLog(OWNER_A, log('l-aug', 'h-1', '2026-08-15'), db);
    await upsertHabitLog(OWNER_A, log('l-sep-1', 'h-1', '2026-09-01'), db);
    await upsertHabitLog(OWNER_A, log('l-sep-2', 'h-1', '2026-09-22'), db);
    const sept = await listHabitLogsInRange(OWNER_A, 'h-1', '2026-09-01', '2026-09-30', db);
    expect(sept.map((l) => l.date).sort()).toEqual(['2026-09-01', '2026-09-22']);
    expect(await listHabitLogsForDate(OWNER_B, '2026-09-22', db)).toHaveLength(0);
  });

  it('cascades log deletion with the habit, scoped to owner', async () => {
    await createHabit(OWNER_A, habit('h-1'), db);
    await upsertHabitLog(OWNER_A, log('l-1', 'h-1', '2026-09-22'), db);
    await removeHabit(OWNER_B, 'h-1', db); // cross-owner: no-op
    expect(await listHabits(OWNER_A, db)).toHaveLength(1);
    await removeHabit(OWNER_A, 'h-1', db);
    expect(await listAllHabitLogs(OWNER_A, db)).toHaveLength(0);
  });
});
