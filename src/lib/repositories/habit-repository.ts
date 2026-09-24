// =============================================
// FuelUp - Habit repository
// Habits are user configuration; habit logs are event rows keyed by
// habit+date (upsert — rapid double-taps toggle one row, never duplicate).
// Heatmap/chart queries are date-bounded by construction.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { Habit, HabitLog } from '@/lib/types';
import { enqueueSyncEvent } from '@/lib/sync/outbox';
import { omitOwner, repoContext, repoError, withoutKeys } from './base';

function stripHabit(row: Habit & { ownerId: string }): Habit {
  return omitOwner(row);
}

function stripLog(row: HabitLog & { ownerId: string }): HabitLog {
  return omitOwner(row);
}

export async function listHabits(ownerId: string, db?: FuelUpLocalDb): Promise<Habit[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.habits.where('ownerId').equals(o).sortBy('created_at');
    return rows.map(stripHabit);
  } catch (error) {
    repoError('habits', 'load', error);
  }
}

export async function createHabit(ownerId: string, habit: Habit, db?: FuelUpLocalDb): Promise<Habit> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.habits.put({ ...habit, ownerId: o });
    await enqueueSyncEvent(o, { entity: 'habit', entityId: habit.id, operation: 'upsert', payload: { ...habit } }, d);
    return habit;
  } catch (error) {
    repoError('habit', 'save', error);
  }
}

export async function updateHabit(
  ownerId: string,
  id: string,
  updates: Partial<Habit>,
  db?: FuelUpLocalDb
): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.habits.get(id);
    if (!row || row.ownerId !== o) return;
    await d.habits.update(id, withoutKeys(updates, 'id', 'user_id'));
    const merged = await d.habits.get(id);
    if (merged) {
      await enqueueSyncEvent(o, { entity: 'habit', entityId: id, operation: 'upsert', payload: { ...omitOwner(merged) } }, d);
    }
  } catch (error) {
    repoError('habit', 'save', error);
  }
}

export async function removeHabit(ownerId: string, id: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.transaction('rw', d.habits, d.habitLogs, async () => {
      const row = await d.habits.get(id);
      if (!row || row.ownerId !== o) return;
      await d.habits.delete(id);
      const logKeys = await d.habitLogs
        .where('[ownerId+habit_id+date]')
        .between([o, id, ''], [o, id, '\uffff'])
        .primaryKeys();
      await d.habitLogs.bulkDelete(logKeys);
    });
    await enqueueSyncEvent(o, { entity: 'habit', entityId: id, operation: 'delete', payload: { id } }, d);
  } catch (error) {
    repoError('habit', 'delete', error);
  }
}

/** Create or replace the log for one habit on one calendar day. */
export async function upsertHabitLog(ownerId: string, log: HabitLog, db?: FuelUpLocalDb): Promise<HabitLog> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.transaction('rw', d.habitLogs, async () => {
      const existing = await d.habitLogs
        .where('[ownerId+habit_id+date]')
        .equals([o, log.habit_id, log.date])
        .primaryKeys();
      if (existing.length > 0) await d.habitLogs.bulkDelete(existing);
      await d.habitLogs.put({ ...log, ownerId: o });
    });
    await enqueueSyncEvent(o, { entity: 'habitLog', entityId: log.id, operation: 'upsert', payload: { ...log } }, d);
    return log;
  } catch (error) {
    repoError('habit log', 'save', error);
  }
}

export async function listHabitLogsForDate(
  ownerId: string,
  date: string,
  db?: FuelUpLocalDb
): Promise<HabitLog[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.habitLogs.where('[ownerId+date]').equals([o, date]).toArray();
    return rows.map(stripLog);
  } catch (error) {
    repoError('habit logs', 'load', error);
  }
}

export async function listHabitLogsInRange(
  ownerId: string,
  habitId: string,
  startDate: string,
  endDate: string,
  db?: FuelUpLocalDb
): Promise<HabitLog[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.habitLogs
      .where('[ownerId+habit_id+date]')
      .between([o, habitId, startDate], [o, habitId, endDate])
      .toArray();
    return rows.map(stripLog);
  } catch (error) {
    repoError('habit logs', 'load', error);
  }
}

export async function listAllHabitLogs(ownerId: string, db?: FuelUpLocalDb): Promise<HabitLog[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.habitLogs.where('[ownerId+date]').between([o, ''], [o, '\uffff']).toArray();
    return rows.map(stripLog);
  } catch (error) {
    repoError('habit logs', 'load', error);
  }
}

