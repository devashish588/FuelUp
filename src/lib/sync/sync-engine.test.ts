// End-to-end sync engine tests: real Dexie + real outbox + real controller
// against a fake HTTP server. Covers push/pull/offline/retry/conflict,
// multi-device simulation, reload persistence, and the multi-tab lock.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalDb, resetLocalDbForTests } from '@/lib/db/local-db';
import { upsertHabitLog, createHabit, listHabits, listAllHabitLogs } from '@/lib/repositories/habit-repository';
import { saveProfile } from '@/lib/repositories/profile-repository';
import { countPendingEvents, listDueEvents } from '@/lib/sync/outbox';
import { getSyncCursor } from '@/lib/sync/pull-apply';
import { refreshSyncState, syncNow } from '@/lib/sync/sync-controller';
import { useSessionStore } from '@/lib/session/session-store';
import { useSyncStore } from '@/lib/sync/sync-store';
import { createFakeSyncServer, httpError, installFetchRouter, type FakeSyncServer } from '@/test/fake-sync-server';
import type { SyncPushEvent } from '@/lib/sync/sync-contracts';

let server: FakeSyncServer;
let fetchCalls = 0;

function owner(): string {
  return `eng-${Math.random().toString(36).slice(2)}`;
}

function signInAs(ownerId: string) {
  useSessionStore.getState().setSession({ ownerId, mode: 'user', fuelUpUserId: ownerId, clerkUserId: 'clerk-1' });
}

function routeToServer() {
  installFetchRouter(async (url, init) => {
    fetchCalls++;
    if (url.startsWith('/api/sync/push')) {
      const body = JSON.parse(init?.body as string) as { events: SyncPushEvent[] };
      return server.handlePush(body.events);
    }
    if (url.startsWith('/api/sync/pull')) {
      const cursor = new URL(url, 'http://x').searchParams.get('cursor');
      return server.handlePull(cursor);
    }
    if (url.startsWith('/api/me')) return { id: 'u-1' };
    throw new Error(`unexpected ${url}`);
  });
}

function habit(id: string, name: string) {
  const now = new Date().toISOString();
  return { id, user_id: '', name, icon: 'target', color: '#f59e0b', target_value: 1, unit: 'times', frequency: 'daily' as const, is_default: false, is_active: true, sort_order: 0, created_at: now, updated_at: now };
}

function habitLog(id: string, habitId: string, date: string) {
  return { id, habit_id: habitId, user_id: '', date, value: 1, completed: true, notes: '', created_at: new Date().toISOString() };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  fetchCalls = 0;
  server = createFakeSyncServer();
  useSyncStore.getState().reset();
  routeToServer();
});

describe('sync engine', () => {
  it('pushes local mutations, clears the outbox, and marks synced', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    await upsertHabitLog(o, habitLog('l-1', 'h-1', '2026-09-22'));
    expect(await countPendingEvents(o)).toBe(2);

    const result = await syncNow();
    expect(result.ran).toBe(true);
    expect(result.pushed).toBe(2);
    expect(await countPendingEvents(o)).toBe(0);
    expect(server.tables.habit?.has('h-1')).toBe(true);
    expect(server.tables.habitLog?.has('l-1')).toBe(true);
    expect(useSyncStore.getState().status).toBe('synced');
    expect(useSyncStore.getState().lastSyncedAt).not.toBeNull();
  });

  it('replays idempotently: re-pushing the same mutation applies once', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    await syncNow();
    expect(server.applyCount).toBe(1);

    // Simulate a lost acknowledgement: the same outbox row returns.
    const db = getLocalDb();
    const before = server.applyCount;
    await db.outbox.put({
      id: 'replay-1', ownerId: o, entity: 'habit', entityId: 'h-1', operation: 'upsert',
      payload: { ...habit('h-1', 'Read') }, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), retryCount: 0, nextAttemptAt: 0, status: 'pending',
    });
    // First push of replay-1 succeeds...
    await syncNow();
    const afterFirst = server.applyCount;
    expect(afterFirst).toBe(before + 1);
    // ...replay the SAME mutation id again → duplicate, no second apply.
    await db.outbox.put({
      id: 'replay-1', ownerId: o, entity: 'habit', entityId: 'h-1', operation: 'upsert',
      payload: { ...habit('h-1', 'Read') }, createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), retryCount: 0, nextAttemptAt: 0, status: 'pending',
    });
    await syncNow();
    expect(server.applyCount).toBe(afterFirst);
    expect(await countPendingEvents(o)).toBe(0);
  });

  it('handles partial failure: invalid events drop, valid ones ack', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    const db = getLocalDb();
    await db.outbox.put({
      id: 'poison-1', ownerId: o, entity: 'habitLog', entityId: 'bad', operation: 'upsert',
      payload: { nope: true }, // fails server validation
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      retryCount: 0, nextAttemptAt: 0, status: 'pending',
    });
    const result = await syncNow();
    expect(result.pushed).toBe(1); // only the valid one counts
    expect(await countPendingEvents(o)).toBe(0); // poison dropped, not wedged
    expect(server.tables.habit?.has('h-1')).toBe(true);
  });

  it('keeps events pending on 401 and reports error', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    installFetchRouter(async (url) => {
      fetchCalls++;
      if (url.startsWith('/api/sync/push')) throw httpError(401);
      throw httpError(500);
    });
    const result = await syncNow();
    expect(result.error).toBeDefined();
    expect(await countPendingEvents(o)).toBe(1);
    expect(useSyncStore.getState().status).toBe('error');
  });

  it('backs off on network failure and retries successfully later', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    installFetchRouter(async () => {
      fetchCalls++;
      throw new TypeError('fetch failed'); // offline mid-run
    });
    const failed = await syncNow();
    expect(failed.error).toBeDefined();
    const [row] = await listDueEvents(o, 50, Date.now() + 60 * 60 * 1000, getLocalDb());
    expect(row.retryCount).toBe(1);
    expect(row.nextAttemptAt).toBeGreaterThan(Date.now());
    expect(await listDueEvents(o, 50, Date.now(), getLocalDb())).toHaveLength(0); // not due: no tight loop

    routeToServer();
    // Make it due again (simulating the scheduled wake-up).
    await getLocalDb().outbox.update(row.id, { nextAttemptAt: 0 });
    const retried = await syncNow();
    expect(retried.pushed).toBe(1);
    expect(await countPendingEvents(o)).toBe(0);
  });

  it('pulls server state on first sync and advances the cursor incrementally', async () => {
    const o = owner();
    signInAs(o);
    server.seed('habit', { id: 'srv-h', name: 'Srv', icon: 't', color: '#fff', targetValue: 1, unit: 'x', frequency: 'daily', isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const first = await syncNow();
    expect(first.pulled).toBeGreaterThan(0);
    expect((await listHabits(o)).map((h) => h.id)).toContain('srv-h');
    const cursor1 = await getSyncCursor(o);
    expect(cursor1).not.toBeNull();

    const idle = await syncNow();
    expect(idle.pulled).toBe(0); // nothing new: no re-download

    server.seed('habitLog', { id: 'srv-l', habitId: 'srv-h', userId: o, date: '2026-09-23', value: 1, completed: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const second = await syncNow();
    expect(second.pulled).toBe(1);
    expect((await listAllHabitLogs(o)).map((l) => l.id)).toContain('srv-l');
  });

  it('does not advance the cursor when pull application fails', async () => {
    const o = owner();
    signInAs(o);
    await syncNow(); // establishes a cursor
    const cursorBefore = await getSyncCursor(o);
    server.seed('habit', { id: 'srv-h', name: 'Srv' });
    installFetchRouter(async (url) => {
      fetchCalls++;
      if (url.startsWith('/api/sync/pull')) return { cursor: 'not-a-date', hasMore: false, changes: {}, deletions: [] };
      if (url.startsWith('/api/sync/push')) return { results: [] };
      throw new Error('unexpected');
    });
    const result = await syncNow();
    expect(result.error).toBeDefined();
    expect(await getSyncCursor(o)).toBe(cursorBefore);
    expect(await listHabits(o)).toHaveLength(0);
  });

  it('reconciles server deletions locally', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    await syncNow();
    expect(await listHabits(o)).toHaveLength(1);
    server.serverDelete('habit', 'h-1');
    const result = await syncNow();
    expect(result.pulled).toBeGreaterThan(0);
    expect(await listHabits(o)).toHaveLength(0);
  });

  it('server wins without pending edits; pending local edits are never clobbered', async () => {
    const o = owner();
    signInAs(o);
    // Case 1: no pending edit → server state applies.
    await saveProfile(o, {
      id: 'p-1', full_name: 'Local', email: '', date_of_birth: '', gender: 'male',
      activity_level: 'moderately_active', goal: 'recomp', unit_system: 'metric',
      daily_calorie_target: 2000, protein_target_g: 150, carbs_target_g: 200, fat_target_g: 65,
      target_rate_kg_per_week: null, target_source: 'initial',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    await syncNow(); // pushes local profile
    expect(await countPendingEvents(o)).toBe(0);
    // Another device renames on the server.
    server.tables.profile?.set('p-1', { id: 'p-1', name: 'Server', email: '', updatedAt: new Date(Date.now() + 5000).toISOString() });
    await syncNow();
    const { getProfile } = await import('@/lib/repositories/profile-repository');
    expect((await getProfile(o))?.full_name).toBe('Server');

    // Case 2: pending local edit → pull skips; push resolves.
    await saveProfile(o, {
      id: 'p-1', full_name: 'LocalEdit', email: '', date_of_birth: '', gender: 'male',
      activity_level: 'moderately_active', goal: 'recomp', unit_system: 'metric',
      daily_calorie_target: 2000, protein_target_g: 150, carbs_target_g: 200, fat_target_g: 65,
      target_rate_kg_per_week: null, target_source: 'initial',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    // Pending local edit wins the pull; the push then converges the server.
    await syncNow();
    expect((await getProfile(o))?.full_name).toBe('LocalEdit');
    expect(server.tables.profile?.get('p-1')).toMatchObject({ name: 'LocalEdit' });
  });

  it('never clobbers unpushed edits when the pull races a failed push', async () => {
    // Fake server: payloads carrying __forceRetry get a retryable verdict.
    const realHandlePush = server.handlePush.bind(server);
    server.handlePush = (events) => {
      const forced = events.filter((e) => (e.payload as Record<string, unknown>).__forceRetry === true);
      const rest = events.filter((e) => (e.payload as Record<string, unknown>).__forceRetry !== true);
      const out = realHandlePush(rest);
      for (const e of forced) out.results.push({ mutationId: e.mutationId, status: 'retryable' });
      return out;
    };

    const o = owner();
    signInAs(o);
    await saveProfile(o, {
      id: 'p-1', full_name: 'UnpushedEdit', email: '', date_of_birth: '', gender: 'male',
      activity_level: 'moderately_active', goal: 'recomp', unit_system: 'metric',
      daily_calorie_target: 2000, protein_target_g: 150, carbs_target_g: 200, fat_target_g: 65,
      target_rate_kg_per_week: null, target_source: 'initial',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    // Mark the pending event to fail its push (stays pending).
    const db = getLocalDb();
    const [pending] = await listDueEvents(o, 50, Date.now(), db);
    await db.outbox.update(pending.id, { payload: { ...(pending.payload as object), __forceRetry: true } });
    // Server holds an older name for the same profile.
    server.seed('profile', { id: 'p-1', name: 'StaleServer', email: '', updatedAt: new Date(Date.now() - 60000).toISOString() });

    await syncNow();
    const { getProfile } = await import('@/lib/repositories/profile-repository');
    expect((await getProfile(o))?.full_name).toBe('UnpushedEdit'); // not clobbered
    expect(await countPendingEvents(o)).toBe(1); // still queued for retry
  });

  it('keeps independent events from two devices (no last-write-wins destruction)', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    await upsertHabitLog(o, habitLog('l-a', 'h-1', '2026-09-22'));
    // Device B logs a different day directly on the server.
    server.seed('habitLog', { id: 'l-b', habitId: 'h-1', userId: o, date: '2026-09-23', value: 1, completed: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await syncNow();
    const ids = (await listAllHabitLogs(o)).map((l) => l.id).sort();
    expect(ids).toEqual(['l-a', 'l-b']);
  });

  it('simulates two devices sharing one account (A→B and B→A)', async () => {
    const o = owner();
    signInAs(o);
    const dbA = await resetLocalDbForTests();
    const dbB = await resetLocalDbForTests();

    // Device A creates + syncs.
    const { upsertHabitLog: logA, createHabit: createA } = await import('@/lib/repositories/habit-repository');
    await createA(o, habit('h-1', 'Read'), dbA);
    await logA(o, habitLog('l-a', 'h-1', '2026-09-22'), dbA);
    const rA = await syncNow({}, dbA);
    expect(rA.pushed).toBe(2);

    // Device B starts empty, pulls everything.
    const rB = await syncNow({}, dbB);
    expect(rB.pulled).toBeGreaterThan(0);
    const { listHabits: listB, listAllHabitLogs: logsB } = await import('@/lib/repositories/habit-repository');
    expect((await listB(o, dbB)).map((h) => h.id)).toContain('h-1');
    expect((await logsB(o, dbB)).map((l) => l.id)).toContain('l-a');

    // Device B adds its own log; device A pulls it.
    await logA(o, habitLog('l-b', 'h-1', '2026-09-23'), dbB);
    await syncNow({}, dbB);
    await syncNow({}, dbA);
    const { listAllHabitLogs: logsA } = await import('@/lib/repositories/habit-repository');
    expect((await logsA(o, dbA)).map((l) => l.id).sort()).toEqual(['l-a', 'l-b']);
  });

  it('syncs favorites across devices like other user data', async () => {
    const o = owner();
    signInAs(o);
    const dbA = await resetLocalDbForTests();
    const dbB = await resetLocalDbForTests();
    const { addFavorite, listFavorites } = await import('@/lib/repositories/nutrition-repository');
    const fav = { id: 'fav-1', user_id: o, food_id: 'food-7', created_at: new Date().toISOString() };
    await addFavorite(o, fav, dbA);
    const rA = await syncNow({}, dbA);
    expect(rA.pushed).toBe(1);
    const rB = await syncNow({}, dbB);
    expect(rB.pulled).toBeGreaterThan(0);
    expect((await listFavorites(o, dbB)).map((f) => f.food_id)).toEqual(['food-7']);
  });

  it('propagates recipes A→B and recipe logs B→A without duplicates', async () => {
    const o = owner();
    signInAs(o);
    const dbA = await resetLocalDbForTests();
    const dbB = await resetLocalDbForTests();
    const { saveRecipeBundle, getRecipeBundle, listRecipes } = await import('@/lib/repositories/recipe-repository');
    const { addFoodLog, listFoodLogsForDate } = await import('@/lib/repositories/nutrition-repository');
    const now = new Date().toISOString();
    const bundle = {
      recipe: { id: 'r-1', user_id: o, food_item_id: 'r-1', name: 'Chicken Curry', description: '', category: 'curry', preparation: 'curry', yield_quantity: 760, yield_unit: 'g' as const, serving_quantity: 190, serving_description: '1 bowl ≈ 190 g', source: 'user' as const, is_estimated: false, created_at: now, updated_at: now },
      ingredients: [
        { id: 'i-1', recipe_id: 'r-1', user_id: o, food_id: 'ch-1', food_name: 'Chicken', quantity: 500, quantity_unit: 'g' as const, sort_order: 0, notes: '', created_at: now },
        { id: 'i-2', recipe_id: 'r-1', user_id: o, food_id: 'oil-1', food_name: 'Oil', quantity: 20, quantity_unit: 'g' as const, sort_order: 1, notes: '', created_at: now },
      ],
      foodItem: { id: 'r-1', name: 'Chicken Curry', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 152.6, protein_g: 21, carbs_g: 2, fat_g: 7, fiber_g: 0, barcode: null, is_custom: true, created_by: null, created_at: now, category: 'curry', source: 'recipe' as const, source_id: 'r-1' },
      removedIngredientIds: [] as string[],
    };
    await saveRecipeBundle(o, bundle, dbA);
    const rA = await syncNow({}, dbA);
    expect(rA.pushed).toBe(4); // recipe + foodItem + 2 ingredients

    // Device B starts empty, pulls the recipe with structure + food item.
    const rB = await syncNow({}, dbB);
    expect(rB.pulled).toBeGreaterThan(0);
    const pulled = await getRecipeBundle(o, 'r-1', dbB);
    expect(pulled?.recipe.name).toBe('Chicken Curry');
    expect(pulled?.ingredients.map((r) => r.id).sort()).toEqual(['i-1', 'i-2']);
    expect((await listRecipes(o, dbB))).toHaveLength(1);

    // Device B logs 230 g; device A pulls exactly one log.
    await addFoodLog(o, {
      id: 'fl-b', user_id: o, food_item_id: 'r-1', food_name: 'Chicken Curry', date: '2026-09-22',
      meal_type: 'dinner', servings: 2.3, quantity: 230, quantity_unit: 'g',
      calories: 351, protein_g: 48.3, carbs_g: 4.6, fat_g: 16.1, notes: '', created_at: now,
    }, dbB);
    await syncNow({}, dbB);
    await syncNow({}, dbA);
    const logsA = await listFoodLogsForDate(o, '2026-09-22', dbA);
    expect(logsA.map((l) => l.id)).toEqual(['fl-b']);
    expect(logsA[0]).toMatchObject({ food_name: 'Chicken Curry', calories: 351 });
  });

  it('serializes overlapping runs (multi-tab safety)', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    installFetchRouter(async (url) => {
      fetchCalls++;
      if (url.startsWith('/api/sync/push')) {
        await gate;
        return server.handlePush([]);
      }
      if (url.startsWith('/api/sync/pull')) return server.handlePull(null);
      throw new Error('unexpected');
    });
    const first = syncNow();
    const second = await syncNow();
    expect(second).toMatchObject({ ran: false, skipped: 'already-running' });
    release();
    const r1 = await first;
    expect(r1.ran).toBe(true);
  });

  it('never syncs device-local namespaces', async () => {
    const o = `local:device-123`;
    useSessionStore.getState().setSession({ ownerId: o, mode: 'device', fuelUpUserId: null, clerkUserId: null });
    const result = await syncNow();
    expect(result).toMatchObject({ ran: false, skipped: 'device-local' });
    expect(fetchCalls).toBe(0);
  });

  it('refreshes the pending badge', async () => {
    const o = owner();
    signInAs(o);
    await createHabit(o, habit('h-1', 'Read'));
    await refreshSyncState(o);
    expect(useSyncStore.getState().pendingCount).toBe(1);
    expect(useSyncStore.getState().status).toBe('pending');
  });

  it('derives identical energy estimates on both devices after sync (convergence)', async () => {
    const o = owner();
    signInAs(o);
    const dbA = await resetLocalDbForTests();
    const dbB = await resetLocalDbForTests();
    const { saveProfile } = await import('@/lib/repositories/profile-repository');
    const { addFoodLog, listAllFoodLogs } = await import('@/lib/repositories/nutrition-repository');
    const { saveMetricForDate, listMetrics } = await import('@/lib/repositories/metrics-repository');
    const { listTargetHistory, saveTargetHistory } = await import('@/lib/repositories/target-history-repository');
    const { getProfile } = await import('@/lib/repositories/profile-repository');
    const { deriveEnergyState } = await import('@/lib/calculations/analytics');
    const now = new Date().toISOString();
    const TODAY = '2026-09-22';
    const day = (ago: number) => {
      const d = new Date(2026, 8, 22);
      d.setDate(d.getDate() - ago);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `2026-${mm}-${dd}`;
    };
    const baseProfile = {
      id: 'p-1', full_name: 'U', email: '', date_of_birth: '1995-01-01', gender: 'male' as const,
      activity_level: 'moderately_active' as const, goal: 'cut' as const, unit_system: 'metric' as const,
      daily_calorie_target: 2500, protein_target_g: 150, carbs_target_g: 250, fat_target_g: 70,
      target_rate_kg_per_week: null, target_source: 'initial' as const,
      created_at: now, updated_at: now,
    };
    // Device A: 16 days × 2400 kcal + 6 declining weigh-ins (span 15 days).
    await saveProfile(o, baseProfile, dbA);
    for (let i = 0; i < 16; i++) {
      await addFoodLog(o, {
        id: `fl-${i}`, user_id: o, food_item_id: 'f-1', food_name: 'Meal', date: day(15 - i),
        meal_type: 'lunch', servings: 1, quantity: 500, quantity_unit: 'g',
        calories: 2400, protein_g: 100, carbs_g: 200, fat_g: 60, notes: '', created_at: now,
      }, dbA);
    }
    const weights = [80.5, 80.3, 80.1, 79.9, 79.7, 79.5];
    for (let i = 0; i < 6; i++) {
      await saveMetricForDate(o, {
        id: `m-${i}`, user_id: o, date: day(15 - i * 3), weight_kg: weights[i], height_cm: 180,
        body_fat_percentage: null, bmi: null, waist_cm: null, chest_cm: null,
        arms_cm: null, thighs_cm: null, notes: '', created_at: now,
      }, dbA);
    }
    // A rate-change history entry rides along (Phase 10.5 fields included).
    await saveTargetHistory(o, {
      id: 'th-rate', user_id: o, date: day(2), previous_target: 2500, new_target: 2500,
      reason: 'Target rate changed (0.5 kg/week → 0.4 kg/week).',
      maintenance_estimate: null, valid_days: 0, confidence: 'low', goal: 'cut',
      avg_intake_kcal: null, previous_rate_kg_per_week: 0.5, new_rate_kg_per_week: 0.4,
      created_at: now,
    }, dbA);
    const pushed = await syncNow({}, dbA);
    expect(pushed.pushed).toBe(1 + 16 + 6 + 1);

    // Device B pulls everything, then derives the same estimate as A.
    await syncNow({}, dbB);
    const historyB = await listTargetHistory(o, dbB);
    expect(historyB).toHaveLength(1);
    expect(historyB[0]).toMatchObject({
      previous_rate_kg_per_week: 0.5, new_rate_kg_per_week: 0.4,
      reason: 'Target rate changed (0.5 kg/week → 0.4 kg/week).',
    });
    const derive = async (db: typeof dbA) => {
      const p = await getProfile(o, db);
      if (!p) throw new Error('missing profile');
      return deriveEnergyState({
        profile: p,
        foodLogs: await listAllFoodLogs(o, db),
        metrics: await listMetrics(o, db),
        history: await listTargetHistory(o, db),
        today: TODAY,
      });
    };
    const stateA = await derive(dbA);
    const stateB = await derive(dbB);
    expect(stateA.mode).toBe('adaptive');
    expect(stateB.mode).toBe('adaptive');
    expect(stateB.maintenance?.estimate).toBe(stateA.maintenance?.estimate);
    expect(stateB.validNutritionDays).toBe(16);
    expect(stateB.weightObservations).toBe(6);

    // Device B backfills a weigh-in; after sync both devices converge again.
    await saveMetricForDate(o, {
      id: 'm-retro', user_id: o, date: day(7), weight_kg: 80.0, height_cm: 180,
      body_fat_percentage: null, bmi: null, waist_cm: null, chest_cm: null,
      arms_cm: null, thighs_cm: null, notes: '', created_at: now,
    }, dbB);
    await syncNow({}, dbB);
    await syncNow({}, dbA);
    const stateA2 = await derive(dbA);
    const stateB2 = await derive(dbB);
    expect(stateB2.weightObservations).toBe(7);
    expect(stateA2.weightObservations).toBe(7);
    expect(stateA2.maintenance?.estimate).toBe(stateB2.maintenance?.estimate);
    // History rows are raw facts too: the rate entry is visible on both.
    expect(stateA2.lastChange).toMatchObject({ id: 'th-rate', new_rate_kg_per_week: 0.4 });
    expect(stateB2.lastChange).toMatchObject({ id: 'th-rate', new_rate_kg_per_week: 0.4 });
  });
});
