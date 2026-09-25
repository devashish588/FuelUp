// Phase 10.5 — backup export/restore: versioned envelope, secrets absent,
// validation gates, ownership remapping, transactional replace, outbox +
// cursor handling, snapshot integrity, heatmap reconstruction.
import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, metric, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { getSyncCursor } from '@/lib/sync/pull-apply';
import { countPendingEvents } from '@/lib/sync/outbox';
import { calculateCompletionRate } from '@/lib/calculations/habits';
import { whereOwner } from '@/lib/repositories/base';
import {
  BACKUP_MAX_BYTES,
  backupFileName,
  buildBackupSnapshot,
  getBackupMeta,
  parseBackupFile,
  previewBackup,
  restoreBackup,
} from './backup';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION } from '@/lib/validation/backup';
import { addFavorite, addFoodLog, saveCustomFood } from '@/lib/repositories/nutrition-repository';
import { saveRecipeBundle } from '@/lib/repositories/recipe-repository';
import { saveMetricForDate } from '@/lib/repositories/metrics-repository';
import { createHabit, upsertHabitLog } from '@/lib/repositories/habit-repository';
import { saveProfile } from '@/lib/repositories/profile-repository';
import { saveTargetHistory } from '@/lib/repositories/target-history-repository';
import { saveFinishedWorkout } from '@/lib/repositories/workout-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

const now = () => new Date().toISOString();

function customFood(id: string) {
  return {
    id, name: 'Oats', brand: '', serving_size: 1, serving_unit: 'serving',
    calories_per_serving: 150, protein_g: 5, carbs_g: 27, fat_g: 3, fiber_g: 4,
    barcode: null, is_custom: true, created_by: null, created_at: now(),
  };
}

function foodLog(id: string, date = '2026-09-22') {
  return {
    id, user_id: OWNER_A, food_item_id: 'food-0', date, meal_type: 'breakfast' as const,
    servings: 1, calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3, notes: '', created_at: now(),
  };
}

function profile() {
  return {
    id: 'p-1', full_name: 'Test', email: 't@example.com', date_of_birth: '1990-01-01',
    gender: 'male' as const, activity_level: 'moderately_active' as const, goal: 'recomp' as const,
    unit_system: 'metric' as const, daily_calorie_target: 2500, protein_target_g: 150,
    carbs_target_g: 250, fat_target_g: 70, target_rate_kg_per_week: 0.5 as number | null,
    target_source: 'initial' as const, created_at: now(), updated_at: now(),
  };
}

function habit(id: string) {
  return {
    id, user_id: OWNER_A, name: 'Read', icon: '', color: '#fff', target_value: 1,
    unit: 'times', frequency: 'daily' as const, is_default: false, is_active: true,
    sort_order: 0, created_at: now(), updated_at: now(),
  };
}

function habitLog(id: string, habitId: string, date: string) {
  return {
    id, habit_id: habitId, user_id: OWNER_A, date, value: 1, completed: true,
    notes: '', created_at: now(),
  };
}

function targetEntry(id: string) {
  return {
    id, user_id: OWNER_A, date: '2026-09-22', previous_target: 2500, new_target: 2400,
    reason: 'Adaptive update', maintenance_estimate: 2900, valid_days: 21, confidence: 'high' as const,
    goal: 'cut' as const, avg_intake_kcal: 2400,
    previous_rate_kg_per_week: 0.5 as number | null, new_rate_kg_per_week: 0.4 as number | null,
    created_at: now(),
  };
}

function recipeBundle() {
  const t = now();
  return {
    recipe: {
      id: 'r-1', user_id: OWNER_A, food_item_id: 'r-1', name: 'Dal', description: '', category: 'legumes',
      preparation: '', yield_quantity: 400, yield_unit: 'g' as const, serving_quantity: 200,
      serving_description: '1 bowl', source: 'user' as const, is_estimated: false, created_at: t, updated_at: t,
    },
    ingredients: [{
      id: 'ri-1', recipe_id: 'r-1', user_id: OWNER_A, food_id: 'cf-1', food_name: 'Oats',
      quantity: 100, quantity_unit: 'g' as const, sort_order: 0, notes: '', created_at: t,
    }],
    foodItem: {
      id: 'r-1', name: 'Dal', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 120,
      protein_g: 8, carbs_g: 20, fat_g: 1, fiber_g: 5, barcode: null, is_custom: true, created_by: null,
      created_at: t, category: 'legumes', source: 'recipe' as const, source_id: 'r-1',
    },
    removedIngredientIds: [] as string[],
  };
}

function workoutGraph() {
  const t = now();
  return {
    workout: {
      id: 'w-1', user_id: OWNER_A, name: 'Push', date: '2026-09-22', start_time: t,
      end_time: t, duration_minutes: 30, calories_burned: 200, notes: '',
      exercises: [] as import('@/lib/types').WorkoutExercise[], created_at: t,
    },
    exercises: [{
      id: 'we-1', workout_id: 'w-1', exercise_id: 'ex-0', sort_order: 0, notes: '',
      sets: [] as import('@/lib/types').ExerciseSet[], created_at: t,
    }],
    setsByExercise: {
      'we-1': [{
        id: 's-1', workout_exercise_id: 'we-1', set_number: 1, weight_kg: 60, reps: 8,
        duration_seconds: null, distance_km: null, is_warmup: false, is_pr: false, rpe: null, created_at: t,
      }],
    },
  };
}

async function seedAll(owner: string) {
  await saveProfile(owner, { ...profile(), id: 'p-1' }, db);
  await saveCustomFood(owner, customFood('cf-1'), db);
  await addFoodLog(owner, { ...foodLog('fl-1'), user_id: owner }, db);
  await addFavorite(owner, { id: 'fav-1', user_id: owner, food_id: 'cf-1', created_at: now() }, db);
  const bundle = recipeBundle();
  await saveRecipeBundle(owner, {
    ...bundle,
    recipe: { ...bundle.recipe },
    ingredients: bundle.ingredients.map((i) => ({ ...i, user_id: owner })),
    foodItem: bundle.foodItem,
    removedIngredientIds: [],
  }, db);
  await saveMetricForDate(owner, { ...metric({}), user_id: owner }, db);
  await createHabit(owner, { ...habit('h-1'), user_id: owner }, db);
  await upsertHabitLog(owner, { ...habitLog('hl-1', 'h-1', '2026-09-22'), user_id: owner }, db);
  await saveTargetHistory(owner, { ...targetEntry('th-1'), user_id: owner }, db);
  await saveFinishedWorkout(owner, workoutGraph(), db);
}

describe('backup export', () => {
  it('contains all required collections with version and no identity', async () => {
    await seedAll(OWNER_A);
    const envelope = await buildBackupSnapshot(OWNER_A, db);
    expect(envelope.format).toBe(BACKUP_FORMAT);
    expect(envelope.version).toBe(BACKUP_FORMAT_VERSION);
    expect(envelope.appVersion).toBeTruthy();
    expect(envelope.exportedAt).toBeTruthy();
    const d = envelope.data;
    expect(d.profile?.full_name).toBe('Test');
    // Custom food + recipe materialization (saveRecipeBundle writes both).
    expect(d.foodItems).toHaveLength(2);
    expect(d.foodLogs).toHaveLength(1);
    expect(d.favoriteFoods).toHaveLength(1);
    expect(d.recipes).toHaveLength(1);
    expect(d.recipeIngredients).toHaveLength(1);
    expect(d.exercises).toHaveLength(0);
    expect(d.workouts).toHaveLength(1);
    expect(d.workoutExercises).toHaveLength(1);
    expect(d.exerciseSets).toHaveLength(1);
    expect(d.bodyMetrics).toHaveLength(1);
    expect(d.habits).toHaveLength(1);
    expect(d.habitLogs).toHaveLength(1);
    expect(d.targetHistory).toHaveLength(1);
    // Identity stripped everywhere (owner remap on import).
    const dumped = JSON.stringify(envelope);
    expect(dumped).not.toContain('user-a');
    expect(dumped).not.toContain('ownerId');
    expect(dumped).not.toContain('user_id');
  });

  it('contains no secrets, tokens, or keys', async () => {
    await seedAll(OWNER_A);
    const dumped = JSON.stringify(await buildBackupSnapshot(OWNER_A, db)).toLowerCase();
    for (const secret of ['clerk', 'token', 'secret', 'api_key', 'apikey', 'password', 'bearer']) {
      expect(dumped).not.toContain(secret);
    }
  });

  it('exports an empty namespace as a valid empty backup', async () => {
    const envelope = await buildBackupSnapshot(OWNER_B, db);
    expect(envelope.data.profile).toBeNull();
    expect(envelope.data.foodLogs).toHaveLength(0);
    expect(previewBackup(envelope).totalRows).toBe(0);
  });

  it('builds filenames and previews from the envelope', async () => {
    await seedAll(OWNER_A);
    const envelope = await buildBackupSnapshot(OWNER_A, db);
    expect(backupFileName(envelope.exportedAt)).toMatch(/^fuelup-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const preview = previewBackup(envelope);
    expect(preview.version).toBe(BACKUP_FORMAT_VERSION);
    const labels = Object.fromEntries(preview.counts.map((c) => [c.label, c.count]));
    expect(labels['food logs']).toBe(1);
    expect(labels['recipes']).toBe(1);
    expect(labels['workouts']).toBe(1);
    expect(labels['habit logs']).toBe(1);
    expect(labels['weight entries']).toBe(1);
    expect(preview.totalRows).toBeGreaterThan(5);
  });
});

describe('backup import validation', () => {
  it('rejects invalid JSON, wrong format, and unsupported versions', async () => {
    await seedAll(OWNER_A);
    const good = JSON.stringify(await buildBackupSnapshot(OWNER_A, db));
    expect(parseBackupFile(good).ok).toBe(true);
    expect(parseBackupFile('{nope').ok).toBe(false);
    expect(parseBackupFile(JSON.stringify({ format: 'other', version: 1, data: {} })).ok).toBe(false);
    const future = JSON.parse(good) as Record<string, unknown>;
    future.version = 999;
    const parsed = parseBackupFile(JSON.stringify(future));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/version 999/i);
  });

  it('rejects malformed entities and oversized files', async () => {
    await seedAll(OWNER_A);
    const good = JSON.parse(JSON.stringify(await buildBackupSnapshot(OWNER_A, db))) as {
      data: { foodLogs: Record<string, unknown>[] };
    };
    good.data.foodLogs = [{ id: 'x' }];
    expect(parseBackupFile(JSON.stringify(good)).ok).toBe(false);
    const big = '{"format":"fuelup-backup","version":1,"x":"' + 'y'.repeat(BACKUP_MAX_BYTES) + '"}';
    const oversized = parseBackupFile(big);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toMatch(/too large/i);
  });

  it('reads backup metadata defensively', () => {
    expect(getBackupMeta()).toEqual({ lastExportAt: null, lastImportAt: null, lastImportCounts: null });
  });
});

describe('backup restore', () => {
  async function roundTrip() {
    await seedAll(OWNER_A);
    const envelope = await buildBackupSnapshot(OWNER_A, db);
    return JSON.parse(JSON.stringify(envelope)) as typeof envelope;
  }

  it('restores every collection with stable ids and relationships', async () => {
    const json = await roundTrip();
    const parsed = parseBackupFile(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Wipe locally, then restore into the same owner.
    const { clearOwnerLocalData } = await import('@/lib/migration/reset');
    await clearOwnerLocalData(OWNER_A, db);
    expect((await whereOwner(db.foodLogs, OWNER_A)).length).toBe(0);
    const progress: string[] = [];
    const { counts } = await restoreBackup(OWNER_A, parsed.envelope, db, (stage) => progress.push(stage));
    expect(counts.foodLogs).toBe(1);
    expect(counts.recipeIngredients).toBe(1);
    expect(counts.exerciseSets).toBe(1);
    expect(progress.length).toBeGreaterThan(3);
    // Relationships intact: ingredient → recipe, set → exercise → workout, log → habit.
    const ings = await db.recipeIngredients.where('ownerId').equals(OWNER_A).toArray();
    expect(ings[0].recipe_id).toBe('r-1');
    const recipes = await db.recipes.where('ownerId').equals(OWNER_A).toArray();
    expect(recipes).toHaveLength(1);
    const sets = await db.exerciseSets.where('ownerId').equals(OWNER_A).toArray();
    expect(sets[0]).toMatchObject({ workout_exercise_id: 'we-1', weight_kg: 60, reps: 8 });
    const logs = await whereOwner(db.habitLogs, OWNER_A);
    expect(logs[0]).toMatchObject({ habit_id: 'h-1', completed: true });
    const profile = await db.profiles.get(OWNER_A);
    expect(profile).toMatchObject({ full_name: 'Test' });
  });

  it('remaps ownership to the current owner (never trusts backup identity)', async () => {
    const json = await roundTrip();
    const parsed = parseBackupFile(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Fresh target namespace (e.g. another device): everything lands under B.
    const { clearOwnerLocalData } = await import('@/lib/migration/reset');
    await clearOwnerLocalData(OWNER_A, db);
    const result = await restoreBackup(OWNER_B, parsed.envelope, db);
    expect(result.skipped).toBe(0);
    for (const table of [db.foodLogs, db.recipes, db.recipeIngredients, db.habitLogs, db.targetHistory, db.workouts]) {
      const rows = (await whereOwner(table as never, OWNER_B)) as unknown as { ownerId: string; user_id?: string }[];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.ownerId).toBe(OWNER_B);
        if ('user_id' in row) expect(row.user_id).toBe(OWNER_B);
      }
    }
    // Stable ids preserved for dedupe/relationships.
    expect(await db.foodLogs.get('fl-1')).toBeTruthy();
  });

  it('never clobbers another local namespace on id collision', async () => {
    const json = await roundTrip();
    const parsed = parseBackupFile(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // OWNER_A still holds fl-1: restoring the same backup as OWNER_B must
    // skip the colliding rows instead of overwriting A's data.
    const result = await restoreBackup(OWNER_B, parsed.envelope, db);
    expect(result.skipped).toBeGreaterThan(0);
    const kept = await db.foodLogs.get('fl-1');
    expect(kept).toMatchObject({ ownerId: OWNER_A, user_id: OWNER_A, calories: 150 });
    expect((await whereOwner(db.foodLogs, OWNER_A)).length).toBe(1);
  });

  it('clears stale outbox mutations but keeps the sync cursor', async () => {
    await seedAll(OWNER_A);
    expect(await countPendingEvents(OWNER_A, db)).toBeGreaterThan(0);
    await db.meta.put({ key: `sync:cursor:${OWNER_A}`, value: '2026-09-22T00:00:00.000Z', updatedAt: now() });
    const envelope = await buildBackupSnapshot(OWNER_A, db);
    await restoreBackup(OWNER_A, envelope, db);
    // Pre-restore mutations must never overwrite restored data.
    expect(await countPendingEvents(OWNER_A, db)).toBe(0);
    // Local restore only: incremental sync resumes from the kept cursor.
    expect(await getSyncCursor(OWNER_A, db)).toBe('2026-09-22T00:00:00.000Z');
  });

  it('is idempotent across repeated restores (stable ids dedupe)', async () => {
    const json = await roundTrip();
    const first = parseBackupFile(JSON.stringify(json));
    const second = parseBackupFile(JSON.stringify(json));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    await restoreBackup(OWNER_A, first.envelope, db);
    await restoreBackup(OWNER_A, second.envelope, db);
    expect((await whereOwner(db.foodLogs, OWNER_A)).length).toBe(1);
    expect(await db.recipes.where('ownerId').equals(OWNER_A).count()).toBe(1);
  });

  it('leaves current data intact when validation fails', async () => {
    await seedAll(OWNER_A);
    const bad = {
      format: 'fuelup-backup', version: 1, exportedAt: now(), appVersion: 'x',
      data: { profile: null, foodItems: [{ id: 'broken' }], foodLogs: [] },
    };
    await expect(restoreBackup(OWNER_A, bad as never, db)).rejects.toThrow();
    // Original rows untouched (validation runs before any write).
    expect((await whereOwner(db.foodLogs, OWNER_A)).length).toBe(1);
    expect(await db.recipes.where('ownerId').equals(OWNER_A).count()).toBe(1);
  });

  it('preserves frozen snapshots and target history across restore', async () => {
    const json = await roundTrip();
    const parsed = parseBackupFile(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { clearOwnerLocalData } = await import('@/lib/migration/reset');
    await clearOwnerLocalData(OWNER_A, db);
    await restoreBackup(OWNER_A, parsed.envelope, db);
    const log = await db.foodLogs.get('fl-1');
    expect(log).toMatchObject({ calories: 150, protein_g: 5 });
    const history = await db.targetHistory.where('ownerId').equals(OWNER_A).toArray();
    expect(history[0]).toMatchObject({
      previous_target: 2500, new_target: 2400,
      previous_rate_kg_per_week: 0.5, new_rate_kg_per_week: 0.4,
    });
  });

  it('reconstructs heatmap inputs from restored habit logs', async () => {
    const json = await roundTrip();
    const parsed = parseBackupFile(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { clearOwnerLocalData } = await import('@/lib/migration/reset');
    await clearOwnerLocalData(OWNER_A, db);
    await restoreBackup(OWNER_A, parsed.envelope, db);
    const restored = await db.habitLogs.where('ownerId').equals(OWNER_A).toArray();
    const completedDates = restored.filter((l) => l.completed).map((l) => l.date);
    expect(calculateCompletionRate(completedDates, 7, new Date('2026-09-22T12:00:00'))).toBeGreaterThan(0);
  });
});
