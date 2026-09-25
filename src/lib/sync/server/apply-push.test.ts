// Server push tests: auth-scoped, idempotent, validated, batched.
// Uses an in-memory Prisma fake (no database needed).
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createFakeDb, type FakeDb } from '@/test/fake-prisma';
import { applyPushEvents } from './apply-push';
import type { SyncPushEvent } from '@/lib/sync/sync-contracts';

const USER_A = 'user-a';
const USER_B = 'user-b';
let db: FakeDb;
let prisma: PrismaClient;

beforeEach(() => {
  db = createFakeDb();
  prisma = db as unknown as PrismaClient;
  db.user.rows.set(USER_A, { id: USER_A, email: 'a@x.test', updatedAt: new Date() });
  db.user.rows.set(USER_B, { id: USER_B, email: 'b@x.test', updatedAt: new Date() });
});

function habitEvent(id: string, name: string, mutationId = `m-${id}`): SyncPushEvent {
  return {
    mutationId,
    entity: 'habit',
    entityId: id,
    operation: 'upsert',
    payload: { id, name, icon: 'target', color: '#f59e0b', target_value: 1, unit: 'times', frequency: 'daily' },
  };
}

function habitLogEvent(id: string, habitId: string, date: string, mutationId = `m-${id}`): SyncPushEvent {
  return {
    mutationId,
    entity: 'habitLog',
    entityId: id,
    operation: 'upsert',
    payload: { id, habit_id: habitId, date, value: 1, completed: true },
  };
}

describe('applyPushEvents', () => {
  it('applies authenticated mutations scoped to the caller', async () => {
    const results = await applyPushEvents(USER_A, [habitEvent('h-1', 'Read'), habitLogEvent('l-1', 'h-1', '2026-09-22')], prisma);
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(db.habit.rows.get('h-1')).toMatchObject({ userId: USER_A, name: 'Read' });
    expect(db.habitLog.rows.get('l-1')).toMatchObject({ userId: USER_A, date: '2026-09-22' });
  });

  it('is idempotent: replaying a mutation never duplicates', async () => {
    const event = habitEvent('h-1', 'Read', 'm-replay');
    expect((await applyPushEvents(USER_A, [event], prisma))[0].status).toBe('ok');
    expect((await applyPushEvents(USER_A, [event], prisma))[0].status).toBe('duplicate');
    expect(db.habit.rows.size).toBe(1);
  });

  it('rejects cross-user writes as conflicts (never overwrites)', async () => {
    await applyPushEvents(USER_A, [habitEvent('h-1', 'Mine', 'm-a-1')], prisma);
    const results = await applyPushEvents(USER_B, [habitEvent('h-1', 'Theirs', 'm-b-1')], prisma);
    expect(results[0].status).toBe('conflict');
    expect(db.habit.rows.get('h-1')).toMatchObject({ userId: USER_A, name: 'Mine' });
  });

  it('rejects logs attached to another user’s habit', async () => {
    await applyPushEvents(USER_A, [habitEvent('h-1', 'Mine')], prisma);
    const results = await applyPushEvents(USER_B, [habitLogEvent('l-x', 'h-1', '2026-09-22')], prisma);
    expect(results[0].status).toBe('conflict');
    expect(db.habitLog.rows.size).toBe(0);
  });

  it('rejects invalid payloads without touching the database', async () => {
    const bad: SyncPushEvent = { mutationId: 'm-bad', entity: 'habit', entityId: 'h-bad', operation: 'upsert', payload: { id: 'h-bad', name: '' } };
    const results = await applyPushEvents(USER_A, [bad], prisma);
    expect(results[0].status).toBe('invalid');
    expect(db.habit.rows.has('h-bad')).toBe(false);
    // ...and a mismatched entityId is invalid too.
    const mismatch: SyncPushEvent = { ...habitEvent('h-2', 'X'), entityId: 'h-other' };
    expect((await applyPushEvents(USER_A, [mismatch], prisma))[0].status).toBe('invalid');
  });

  it('batches with partial results (one poison event keeps the rest)', async () => {
    const bad: SyncPushEvent = { mutationId: 'm-bad', entity: 'habit', entityId: 'h-bad', operation: 'upsert', payload: { id: 'h-bad' } };
    const results = await applyPushEvents(USER_A, [habitEvent('h-1', 'Read'), bad, habitEvent('h-2', 'Write')], prisma);
    expect(results.map((r) => r.status)).toEqual(['ok', 'invalid', 'ok']);
    expect(db.habit.rows.has('h-1')).toBe(true);
    expect(db.habit.rows.has('h-2')).toBe(true);
  });

  it('merges same-date metrics across devices instead of duplicating', async () => {
    const metric = (id: string, weight: number, m: string): SyncPushEvent => ({
      mutationId: m,
      entity: 'bodyMetric',
      entityId: id,
      operation: 'upsert',
      payload: { id, date: '2026-09-22', weight_kg: weight },
    });
    await applyPushEvents(USER_A, [metric('m-a', 70, 'm-1')], prisma);
    const results = await applyPushEvents(USER_A, [metric('m-b', 71, 'm-2')], prisma);
    expect(results[0].status).toBe('ok');
    expect(db.bodyMetric.rows.size).toBe(1); // exactly one logical record
  });

  it('deletes owned rows with tombstones; missing rows succeed idempotently', async () => {
    await applyPushEvents(USER_A, [habitEvent('h-1', 'Read'), habitLogEvent('l-1', 'h-1', '2026-09-22')], prisma);
    const del: SyncPushEvent = { mutationId: 'm-del', entity: 'habit', entityId: 'h-1', operation: 'delete', payload: { id: 'h-1' } };
    expect((await applyPushEvents(USER_A, [del], prisma))[0].status).toBe('ok');
    expect(db.habit.rows.has('h-1')).toBe(false);
    expect(db.habitLog.rows.size).toBe(0); // cascaded
    expect([...db.syncDeletion.rows.values()]).toHaveLength(1);
    // Repeat delete → still ok, no new journal spam.
    expect((await applyPushEvents(USER_A, [{ ...del, mutationId: 'm-del-2' }], prisma))[0].status).toBe('ok');
  });

  it('refuses to delete another user’s rows', async () => {
    await applyPushEvents(USER_A, [habitEvent('h-1', 'Mine')], prisma);
    const del: SyncPushEvent = { mutationId: 'm-del', entity: 'habit', entityId: 'h-1', operation: 'delete', payload: { id: 'h-1' } };
    expect((await applyPushEvents(USER_B, [del], prisma))[0].status).toBe('conflict');
    expect(db.habit.rows.has('h-1')).toBe(true);
  });

  it('provisions shared stubs for seed food references (FK stays valid)', async () => {
    const log: SyncPushEvent = {
      mutationId: 'm-log',
      entity: 'foodLog',
      entityId: 'fl-1',
      operation: 'upsert',
      payload: {
        id: 'fl-1', food_item_id: 'food-0', date: '2026-09-22', meal_type: 'breakfast',
        servings: 1, calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1,
        foodSnapshot: { name: 'Oats', brand: '', serving_unit: 'serving', calories_per_serving: 100, protein_g: 1, carbs_g: 1, fat_g: 1 },
      },
    };
    expect((await applyPushEvents(USER_A, [log], prisma))[0].status).toBe('ok');
    expect(db.foodItem.rows.get('food-0')).toMatchObject({ userId: null, name: 'Oats' });
    expect(db.foodLog.rows.get('fl-1')).toMatchObject({ userId: USER_A, foodItemId: 'food-0' });
  });

  it('syncs workout graphs transactionally (workout + exercises + sets)', async () => {
    const now = new Date().toISOString();
    const graph: SyncPushEvent = {
      mutationId: 'm-w',
      entity: 'workout',
      entityId: 'w-1',
      operation: 'create',
      payload: {
        id: 'w-1', name: 'Push', date: '2026-09-22', start_time: now, end_time: now,
        exercises: [{
          id: 'we-1', exercise_id: 'ex-9', sort_order: 0,
          exerciseSnapshot: { name: 'Bench', muscle_group: 'chest' },
          sets: [{ id: 's-1', set_number: 1, reps: 8, weight_kg: 60, is_warmup: false }],
        }],
      },
    };
    expect((await applyPushEvents(USER_A, [graph], prisma))[0].status).toBe('ok');
    expect(db.workout.rows.get('w-1')).toMatchObject({ userId: USER_A });
    expect(db.workoutExercise.rows.get('we-1')).toMatchObject({ workoutId: 'w-1' });
    expect(db.exerciseSet.rows.get('s-1')).toMatchObject({ weightKg: 60 });
    expect(db.exercise.rows.get('ex-9')).toMatchObject({ userId: null, name: 'Bench' });
    // Replay → duplicate, no second graph.
    expect((await applyPushEvents(USER_A, [graph], prisma))[0].status).toBe('duplicate');
    expect(db.workout.rows.size).toBe(1);
  });

  it('maps quantity-first food fields and snapshots across sync', async () => {
    const item: SyncPushEvent = {
      mutationId: 'm-fi',
      entity: 'foodItem',
      entityId: 'cf-1',
      operation: 'upsert',
      payload: {
        id: 'cf-1', name: 'Homemade Paneer', brand: '', serving_size: 100, serving_unit: 'g',
        calories_per_serving: 265, protein_g: 18, carbs_g: 6, fat_g: 20, fiber_g: 0,
        barcode: null, is_custom: true, category: 'protein', source: 'user',
        aliases: ['paneer'], count_weight_g: null, food_state: 'prepared',
        preparation: '', serving_description: 'per 100 g', sugar_g: 3, sodium_mg: 18,
        is_estimated: false,
      },
    };
    const log: SyncPushEvent = {
      mutationId: 'm-fl',
      entity: 'foodLog',
      entityId: 'fl-1',
      operation: 'upsert',
      payload: {
        id: 'fl-1', food_item_id: 'cf-1', date: '2026-09-22', meal_type: 'lunch',
        servings: 2, calories: 530, protein_g: 36, carbs_g: 12, fat_g: 40,
        quantity: 200, quantity_unit: 'g', fiber_g: 0, sugar_g: 6, sodium_mg: 36,
        food_name: 'Homemade Paneer', is_estimated: false, notes: '',
      },
    };
    expect((await applyPushEvents(USER_A, [item, log], prisma)).map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(db.foodItem.rows.get('cf-1')).toMatchObject({
      userId: USER_A, category: 'protein', source: 'user', foodState: 'prepared', sugarG: 3, sodiumMg: 18,
    });
    expect(db.foodLog.rows.get('fl-1')).toMatchObject({
      userId: USER_A, quantity: 200, quantityUnit: 'g', foodName: 'Homemade Paneer', sugarG: 6, sodiumMg: 36,
    });
  });

  it('syncs favorites with ownership checks and tombstones', async () => {
    const fav: SyncPushEvent = {
      mutationId: 'm-fav',
      entity: 'favorite',
      entityId: 'fav-1',
      operation: 'upsert',
      payload: { id: 'fav-1', food_id: 'food-7' },
    };
    expect((await applyPushEvents(USER_A, [fav], prisma))[0].status).toBe('ok');
    expect(db.favoriteFood.rows.get('fav-1')).toMatchObject({ userId: USER_A, foodId: 'food-7' });
    // Cross-user upsert on the same favorite id → conflict.
    expect((await applyPushEvents(USER_B, [{ ...fav, mutationId: 'm-fav-2' }], prisma))[0].status).toBe('conflict');
    // Delete journals a tombstone; repeat delete stays ok.
    const del: SyncPushEvent = { mutationId: 'm-fav-del', entity: 'favorite', entityId: 'fav-1', operation: 'delete', payload: { id: 'fav-1' } };
    expect((await applyPushEvents(USER_A, [del], prisma))[0].status).toBe('ok');
    expect(db.favoriteFood.rows.has('fav-1')).toBe(false);
    expect([...db.syncDeletion.rows.values()].some((d) => d.entity === 'favorite' && d.entityId === 'fav-1')).toBe(true);
  });

  it('syncs recipes with ingredients, ownership checks, and tombstones', async () => {
    const recipe: SyncPushEvent = {
      mutationId: 'm-r',
      entity: 'recipe',
      entityId: 'r-1',
      operation: 'upsert',
      payload: {
        id: 'r-1', food_item_id: 'r-1', name: 'Chicken Curry', description: '',
        category: 'curry', preparation: 'curry', yield_quantity: 760, yield_unit: 'g',
        serving_quantity: 190, serving_description: '1 bowl ≈ 190 g',
        source: 'user', is_estimated: false,
      },
    };
    const ing: SyncPushEvent = {
      mutationId: 'm-i',
      entity: 'recipeIngredient',
      entityId: 'i-1',
      operation: 'upsert',
      payload: { id: 'i-1', recipe_id: 'r-1', food_id: 'ch-1', food_name: 'Chicken', quantity: 500, quantity_unit: 'g', sort_order: 0, notes: '' },
    };
    expect((await applyPushEvents(USER_A, [recipe, ing], prisma)).map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(db.recipe.rows.get('r-1')).toMatchObject({ userId: USER_A, name: 'Chicken Curry', yieldQuantity: 760 });
    expect(db.recipeIngredient.rows.get('i-1')).toMatchObject({ userId: USER_A, recipeId: 'r-1', quantity: 500 });
    // Replay → duplicates, no extra rows.
    expect((await applyPushEvents(USER_A, [recipe, ing], prisma)).map((r) => r.status)).toEqual(['duplicate', 'duplicate']);
    expect(db.recipe.rows.size).toBe(1);
    // Cross-user recipe write → conflict, original untouched.
    const hijack: SyncPushEvent = { ...recipe, mutationId: 'm-r-hijack', payload: { ...(recipe.payload as Record<string, unknown>), name: 'Hijacked' } };
    expect((await applyPushEvents(USER_B, [hijack], prisma))[0].status).toBe('conflict');
    expect(db.recipe.rows.get('r-1')).toMatchObject({ name: 'Chicken Curry' });
    // Ingredient for another user's recipe → conflict.
    const orphan: SyncPushEvent = { ...ing, mutationId: 'm-i-orphan', entityId: 'i-2', payload: { ...(ing.payload as Record<string, unknown>), id: 'i-2' } };
    expect((await applyPushEvents(USER_B, [orphan], prisma))[0].status).toBe('conflict');
    expect(db.recipeIngredient.rows.has('i-2')).toBe(false);
    // Delete cascades ingredients server-side and journals the recipe tombstone.
    const del: SyncPushEvent = { mutationId: 'm-r-del', entity: 'recipe', entityId: 'r-1', operation: 'delete', payload: { id: 'r-1' } };
    expect((await applyPushEvents(USER_A, [del], prisma))[0].status).toBe('ok');
    expect(db.recipe.rows.has('r-1')).toBe(false);
    expect(db.recipeIngredient.rows.size).toBe(0);
    expect([...db.syncDeletion.rows.values()].some((d) => d.entity === 'recipe' && d.entityId === 'r-1')).toBe(true);
  });

  it('rejects invalid recipe payloads without touching the database', async () => {
    const bad: SyncPushEvent = {
      mutationId: 'm-r-bad',
      entity: 'recipe',
      entityId: 'r-bad',
      operation: 'upsert',
      payload: { id: 'r-bad', name: '', yield_quantity: 0, yield_unit: 'g' },
    };
    expect((await applyPushEvents(USER_A, [bad], prisma))[0].status).toBe('invalid');
    expect(db.recipe.rows.has('r-bad')).toBe(false);
  });

  it('syncs target-history events with ownership checks and tombstones', async () => {
    const evt: SyncPushEvent = {
      mutationId: 'm-th',
      entity: 'targetHistory',
      entityId: 'th-1',
      operation: 'upsert',
      payload: {
        id: 'th-1', date: '2026-09-22', previous_target: 2500, new_target: 2650,
        reason: 'Estimated maintenance rose.', maintenance_estimate: 3200,
        valid_days: 21, confidence: 'high', goal: 'cut', avg_intake_kcal: 2700,
        previous_rate_kg_per_week: 0.5, new_rate_kg_per_week: 0.4,
      },
    };
    expect((await applyPushEvents(USER_A, [evt], prisma))[0].status).toBe('ok');
    expect(db.targetHistory.rows.get('th-1')).toMatchObject({
      userId: USER_A, previousTarget: 2500, newTarget: 2650, goal: 'cut', validDays: 21,
      previousRateKgPerWeek: 0.5, newRateKgPerWeek: 0.4,
    });
    // Replay → duplicate.
    expect((await applyPushEvents(USER_A, [evt], prisma))[0].status).toBe('duplicate');
    // Cross-user write → conflict, original untouched.
    const hijack: SyncPushEvent = { ...evt, mutationId: 'm-th-hijack', payload: { ...(evt.payload as Record<string, unknown>), new_target: 9999 } };
    expect((await applyPushEvents(USER_B, [hijack], prisma))[0].status).toBe('conflict');
    expect(db.targetHistory.rows.get('th-1')).toMatchObject({ newTarget: 2650 });
    // Delete journals a tombstone.
    const del: SyncPushEvent = { mutationId: 'm-th-del', entity: 'targetHistory', entityId: 'th-1', operation: 'delete', payload: { id: 'th-1' } };
    expect((await applyPushEvents(USER_A, [del], prisma))[0].status).toBe('ok');
    expect(db.targetHistory.rows.has('th-1')).toBe(false);
    expect([...db.syncDeletion.rows.values()].some((d) => d.entity === 'targetHistory' && d.entityId === 'th-1')).toBe(true);
  });

  it('syncs Phase 7 profile fields (goal values, rate, source)', async () => {
    const prof: SyncPushEvent = {
      mutationId: 'm-p7',
      entity: 'profile',
      entityId: 'p-1',
      operation: 'upsert',
      payload: {
        id: 'p-1', full_name: 'U', email: '', date_of_birth: '1995-01-01', gender: 'male',
        activity_level: 'moderately_active', goal: 'maintain', unit_system: 'metric',
        daily_calorie_target: 2650, protein_target_g: 160, carbs_target_g: 260, fat_target_g: 70,
        target_rate_kg_per_week: 0.3, target_source: 'adaptive',
      },
    };
    expect((await applyPushEvents(USER_A, [prof], prisma))[0].status).toBe('ok');
    expect(db.user.rows.get(USER_A)).toMatchObject({
      goal: 'maintain', targetRateKgPerWeek: 0.3, targetSource: 'adaptive', dailyCalorieTarget: 2650,
    });
    // Unknown goal values are rejected by validation without touching the row
    // (consistent with all other enums; the apply-time fallback is defense in depth).
    const odd: SyncPushEvent = {
      ...prof, mutationId: 'm-p7-odd',
      payload: { ...(prof.payload as Record<string, unknown>), goal: 'keto', target_source: 'ai' },
    };
    expect((await applyPushEvents(USER_A, [odd], prisma))[0].status).toBe('invalid');
    expect(db.user.rows.get(USER_A)).toMatchObject({ goal: 'maintain', targetSource: 'adaptive' });
  });
});
