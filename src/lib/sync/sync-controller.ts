// =============================================
// FuelUp - Sync controller (client)
// One full cycle: push due outbox events (batched, partial-failure aware),
// then pull server changes (looping while hasMore), apply atomically with
// the cursor, and reload only the stores whose entities changed.
// Rules: device-local namespaces never sync; local writes never wait;
// overlapping runs are serialized via navigator.locks (memory fallback).
// =============================================
'use client';
import { getLocalDb, type FuelUpLocalDb } from '@/lib/db/local-db';
import { logger } from '@/lib/logger/logger';
import {
  ackEvents,
  countPendingEvents,
  earliestDueAt,
  failEvents,
  listDueEvents,
  markEventsInflight,
  releaseInflightEvents,
  reviveDeadEvents,
} from './outbox';
import { applyPullResponse, assertPullResponse, getSyncCursor } from './pull-apply';
import { useSessionStore } from '@/lib/session/session-store';
import { useSyncStore } from './sync-store';
import { scheduleDueSync } from './sync-triggers';
import {
  SYNC_PUSH_BATCH_LIMIT,
  type SyncEntity,
  type SyncEventResult,
  type SyncPullResponse,
  type SyncPushEvent,
  type SyncPushResponse,
} from './sync-contracts';
import { useProfileStore } from '@/stores/profile-store';
import { useMetricsStore } from '@/stores/metrics-store';
import { useHabitStore } from '@/stores/habit-store';
import { useExerciseStore } from '@/stores/exercise-store';
import { useCalorieStore } from '@/stores/calorie-store';
import { useRecipeStore } from '@/stores/recipe-store';
import { useEnergyStore } from '@/stores/energy-store';

export interface SyncRunResult {
  ran: boolean;
  pushed: number;
  pulled: number;
  pending: number;
  skipped?: 'device-local' | 'offline' | 'already-running' | 'no-owner';
  error?: string;
}

const MAX_PULL_PAGES = 10;

let memoryLocked = false;

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function withSyncLock<T>(run: () => Promise<T>): Promise<{ ran: boolean; value?: T }> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) {
    let outcome: { ran: boolean; value?: T } = { ran: false };
    await locks.request('fuelup-sync', { mode: 'exclusive' }, async () => {
      outcome = { ran: true, value: await run() };
    });
    return outcome;
  }
  if (memoryLocked) return { ran: false };
  memoryLocked = true;
  try {
    return { ran: true, value: await run() };
  } finally {
    memoryLocked = false;
  }
}

async function postPush(events: SyncPushEvent[]): Promise<SyncPushResponse> {
  const res = await fetch('/api/sync/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (res.status === 401) throw new Error('SYNC_UNAUTHORIZED');
  if (!res.ok) throw new Error(`SYNC_PUSH_HTTP_${res.status}`);
  const data = (await res.json()) as SyncPushResponse;
  if (!data || !Array.isArray(data.results)) throw new Error('SYNC_PUSH_BAD_RESPONSE');
  return data;
}

async function getPull(cursor: string | null): Promise<SyncPullResponse> {
  const url = cursor ? `/api/sync/pull?cursor=${encodeURIComponent(cursor)}` : '/api/sync/pull';
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 401) throw new Error('SYNC_UNAUTHORIZED');
  if (!res.ok) throw new Error(`SYNC_PULL_HTTP_${res.status}`);
  const data = (await res.json()) as SyncPullResponse;
  assertPullResponse(data);
  return data;
}

function toPushEvent(e: { id: string; entity: SyncEntity; entityId: string; operation: SyncPushEvent['operation']; payload: Record<string, unknown> }): SyncPushEvent {
  return { mutationId: e.id, entity: e.entity, entityId: e.entityId, operation: e.operation, payload: e.payload };
}

async function pushBatch(ownerId: string, db: FuelUpLocalDb): Promise<{ pushed: number; fatal?: string }> {
  const due = await listDueEvents(ownerId, SYNC_PUSH_BATCH_LIMIT, Date.now(), db);
  if (due.length === 0) return { pushed: 0 };
  const ids = due.map((e) => e.id);
  await markEventsInflight(ids, db);
  let response: SyncPushResponse;
  try {
    response = await postPush(due.map(toPushEvent));
  } catch (error) {
    if (error instanceof Error && error.message === 'SYNC_UNAUTHORIZED') return { pushed: 0, fatal: 'unauthorized' };
    // Network/server failure: back off the whole batch, keep everything.
    await failEvents(ids, db);
    throw error;
  }
  const byId = new Map<string, SyncEventResult>(response.results.map((r) => [r.mutationId, r]));
  const ack: string[] = [];
  const retry: string[] = [];
  let applied = 0;
  for (const id of ids) {
    const result = byId.get(id);
    if (!result) {
      retry.push(id);
      continue;
    }
    switch (result.status) {
      case 'ok':
      case 'duplicate':
        applied++;
        ack.push(id);
        break;
      case 'invalid': // poison: log + drop so one bad event can't wedge the queue
      case 'conflict': // server wins: drop; pull already carries the truth
        logger.error('Sync event dropped', { status: result.status });
        ack.push(id);
        break;
      case 'retryable':
        retry.push(id);
        break;
    }
  }
  await ackEvents(ack, db);
  await failEvents(retry, db);
  return { pushed: applied };
}

async function reloadStoresFor(changed: SyncEntity[], ownerId: string): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  if (changed.includes('profile')) jobs.push(useProfileStore.getState().load(ownerId));
  if (changed.includes('bodyMetric')) jobs.push(useMetricsStore.getState().load(ownerId));
  if (changed.includes('habit') || changed.includes('habitLog')) jobs.push(useHabitStore.getState().load(ownerId));
  if (changed.includes('workout') || changed.includes('exercise')) jobs.push(useExerciseStore.getState().load(ownerId));
  if (changed.includes('foodItem') || changed.includes('foodLog') || changed.includes('favorite')) jobs.push(useCalorieStore.getState().load(ownerId));
  if (changed.includes('recipe') || changed.includes('recipeIngredient')) {
    jobs.push(useRecipeStore.getState().load(ownerId));
    // Materialized items land in the calorie mirror too.
    jobs.push(useCalorieStore.getState().load(ownerId));
  }
  // Phase 7: energy derives from profile + food logs + metrics + history —
  // refresh after any of them change so estimates stay current.
  if (
    changed.includes('profile') ||
    changed.includes('foodLog') ||
    changed.includes('foodItem') ||
    changed.includes('bodyMetric') ||
    changed.includes('targetHistory')
  ) {
    jobs.push(
      (async () => {
        await useEnergyStore.getState().load(ownerId);
        useEnergyStore.getState().refresh();
      })()
    );
  }
  if (jobs.length > 0) await Promise.allSettled(jobs);
}

export interface SyncNowOptions {
  manual?: boolean;
}

/** Run one full push+pull cycle for the current user owner. Never throws. */
export async function syncNow(options: SyncNowOptions = {}, db: FuelUpLocalDb = getLocalDb()): Promise<SyncRunResult> {
  const session = useSessionStore.getState();
  const ownerId = session.ownerId;
  if (!ownerId) return { ran: false, pushed: 0, pulled: 0, pending: 0, skipped: 'no-owner' };
  if (session.mode !== 'user') return { ran: false, pushed: 0, pulled: 0, pending: 0, skipped: 'device-local' };
  if (!isOnline()) {
    useSyncStore.getState().setStatus('offline');
    return { ran: false, pushed: 0, pulled: 0, pending: 0, skipped: 'offline' };
  }

  const outcome = await withSyncLock(() => runCycle(ownerId, options, db));
  if (!outcome.ran) return { ran: false, pushed: 0, pulled: 0, pending: 0, skipped: 'already-running' };
  return outcome.value ?? { ran: false, pushed: 0, pulled: 0, pending: 0 };
}

async function runCycle(ownerId: string, options: SyncNowOptions, db: FuelUpLocalDb): Promise<SyncRunResult> {
  const syncState = useSyncStore.getState();
  syncState.setStatus('syncing');
  let pushed = 0;
  let pulled = 0;

  try {
    await releaseInflightEvents(ownerId, db);
    if (options.manual) await reviveDeadEvents(ownerId, db);

    // Push until no due events remain (bounded batches).
    for (let i = 0; i < 20; i++) {
      let batch: { pushed: number; fatal?: string };
      try {
        batch = await pushBatch(ownerId, db);
      } catch (error) {
        logger.error('Sync push failed (will retry)', {});
        void error;
        const pending = await countPendingEvents(ownerId, db);
        syncState.setPendingCount(pending);
        syncState.setStatus(isOnline() ? 'error' : 'offline');
        return { ran: true, pushed, pulled, pending, error: 'Push failed; will retry.' };
      }
      pushed += batch.pushed;
      if (batch.fatal === 'unauthorized') {
        syncState.setError('Please sign in again to sync.');
        return { ran: true, pushed, pulled, pending: await countPendingEvents(ownerId, db), error: 'Unauthorized.' };
      }
      const remaining = await listDueEvents(ownerId, 1, Date.now(), db);
      if (remaining.length === 0) break;
    }

    // Pull until caught up.
    const changedAll = new Set<SyncEntity>();
    for (let page = 0; page < MAX_PULL_PAGES; page++) {
      const cursor = await getSyncCursor(ownerId, db);
      let response: SyncPullResponse;
      try {
        response = await getPull(cursor);
      } catch (error) {
        logger.error('Sync pull failed (will retry)', {});
        void error;
        const pending = await countPendingEvents(ownerId, db);
        syncState.setStatus(isOnline() ? 'error' : 'offline');
        return { ran: true, pushed, pulled, pending, error: 'Pull failed; will retry.' };
      }
      const outcome = await applyPullResponse(ownerId, response, db);
      pulled += outcome.appliedRows + outcome.appliedDeletions;
      for (const kind of outcome.changedKinds) changedAll.add(kind);
      if (!response.hasMore) break;
    }

    await reloadStoresFor([...changedAll], ownerId);
    const pending = await countPendingEvents(ownerId, db);
    if (pending > 0) {
      syncState.setPendingCount(pending);
      syncState.setStatus('pending');
    } else {
      syncState.setSynced(new Date().toISOString());
    }
    const dueAt = await earliestDueAt(ownerId, db);
    scheduleDueSync(ownerId, dueAt);
    return { ran: true, pushed, pulled, pending };
  } catch (error) {
    logger.error('Sync cycle failed', {});
    void error;
    syncState.setStatus(isOnline() ? 'error' : 'offline');
    return { ran: true, pushed, pulled, pending: 0, error: 'Sync failed; will retry.' };
  }
}

/** Refresh the pending badge without running a cycle. */
export async function refreshSyncState(ownerId: string): Promise<void> {
  try {
    const pending = await countPendingEvents(ownerId);
    const state = useSyncStore.getState();
    state.setPendingCount(pending);
    if (state.status !== 'syncing' && state.status !== 'error' && state.status !== 'offline') {
      state.setStatus(pending > 0 ? 'pending' : 'synced');
    }
  } catch {
    /* badge refresh must never break the app */
  }
}
