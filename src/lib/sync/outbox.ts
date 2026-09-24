// =============================================
// FuelUp - Sync outbox (client, IndexedDB)
// Enqueue coalescing keeps the outbox small and matches server LWW:
// same (owner, entity, entityId) pending rows merge into one `upsert` with
// the latest payload; a `delete` absorbs pending upserts. Event-style rows
// (food logs, sets) have unique ids, so independent events never merge.
// Enqueue failures are logged loudly but never fail the local write.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { getLocalDb } from '@/lib/db/local-db';
import { repoContext } from '@/lib/repositories/base';
import { logger } from '@/lib/logger/logger';
import { notifyOutboxChanged } from './notify';
import type { SyncEntity, SyncOperation } from './sync-contracts';
import type { LocalOutboxEvent, OutboxStatus } from './sync-outbox-event';

export const OUTBOX_MAX_RETRIES = 10;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export interface EnqueueInput {
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
}

/**
 * Record a local mutation for later push. Fire-and-forget safe: resolves
 * after the row is durably stored; never throws to callers (logs instead)
 * so a sync-layer failure can't break a local save.
 */
export async function enqueueSyncEvent(
  ownerId: string,
  input: EnqueueInput,
  db?: FuelUpLocalDb
): Promise<void> {
  let ctx;
  try {
    ctx = repoContext(ownerId, db);
  } catch {
    return;
  }
  const { db: d, ownerId: o } = ctx;
  const nowIso = new Date().toISOString();
  try {
    if (input.operation === 'delete') {
      // A delete absorbs any pending upserts for the same row.
      const absorbed = await d.outbox
        .where('[ownerId+status]')
        .equals([o, 'pending'])
        .filter((e) => e.entity === input.entity && e.entityId === input.entityId)
        .primaryKeys();
      if (absorbed.length > 0) await d.outbox.bulkDelete(absorbed);
    } else {
      const existing = await d.outbox
        .where('[ownerId+status]')
        .equals([o, 'pending'])
        .filter((e) => e.entity === input.entity && e.entityId === input.entityId)
        .first();
      if (existing && existing.operation !== 'delete') {
        // Merge into the pending row: latest payload wins, original id kept
        // (stable mutationId across retries).
        await d.outbox.update(existing.id, { payload: input.payload, updatedAt: nowIso });
        notifyOutboxChanged();
        return;
      }
    }
    const row: LocalOutboxEvent = {
      id: newId(),
      ownerId: o,
      entity: input.entity,
      entityId: input.entityId,
      operation: input.operation,
      payload: input.payload,
      createdAt: nowIso,
      updatedAt: nowIso,
      retryCount: 0,
      nextAttemptAt: 0,
      status: 'pending',
    };
    await d.outbox.put(row);
    notifyOutboxChanged();
  } catch (error) {
    logger.error('Outbox enqueue failed (local data is safe; sync deferred)', {});
    void error;
  }
}

/** Due pending events, oldest first, bounded (one push batch). */
export async function listDueEvents(
  ownerId: string,
  limit: number,
  now: number = Date.now(),
  db?: FuelUpLocalDb
): Promise<LocalOutboxEvent[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  return d.outbox
    .where('[ownerId+status]')
    .equals([o, 'pending'])
    .filter((e) => e.nextAttemptAt <= now)
    .sortBy('createdAt')
    .then((rows) => rows.slice(0, limit));
}

export async function countPendingEvents(ownerId: string, db?: FuelUpLocalDb): Promise<number> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  const pending = await d.outbox.where('[ownerId+status]').equals([o, 'pending']).count();
  const dead = await d.outbox.where('[ownerId+status]').equals([o, 'dead']).count();
  return pending + dead;
}

/** Earliest due timestamp among pending events (for scheduling), if any. */
export async function earliestDueAt(
  ownerId: string,
  db?: FuelUpLocalDb
): Promise<number | null> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  const first = await d.outbox
    .where('[ownerId+status]')
    .equals([o, 'pending'])
    .sortBy('nextAttemptAt')
    .then((rows) => rows[0]);
  return first ? first.nextAttemptAt : null;
}

export async function markEventsInflight(ids: string[], db: FuelUpLocalDb = getLocalDb()): Promise<void> {
  if (ids.length === 0) return;
  await db.outbox.where('id').anyOf(ids).modify({ status: 'inflight' satisfies OutboxStatus });
}

export async function ackEvents(ids: string[], db: FuelUpLocalDb = getLocalDb()): Promise<void> {
  if (ids.length === 0) return;
  await db.outbox.bulkDelete(ids);
}

export function backoffDelayMs(retryCount: number): number {
  const capped = Math.min(retryCount, 8);
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(5000 * 2 ** capped, 10 * 60 * 1000) + jitter;
}

export async function failEvents(
  ids: string[],
  db: FuelUpLocalDb = getLocalDb()
): Promise<void> {
  if (ids.length === 0) return;
  const nowIso = new Date().toISOString();
  await db.transaction('rw', db.outbox, async () => {
    for (const id of ids) {
      const row = await db.outbox.get(id);
      if (!row) continue;
      const retryCount = row.retryCount + 1;
      if (retryCount > OUTBOX_MAX_RETRIES) {
        await db.outbox.update(id, { retryCount, status: 'dead' satisfies OutboxStatus, updatedAt: nowIso });
      } else {
        await db.outbox.update(id, {
          retryCount,
          status: 'pending' satisfies OutboxStatus,
          nextAttemptAt: Date.now() + backoffDelayMs(retryCount),
          updatedAt: nowIso,
        });
      }
    }
  });
}

/** Manual "Sync now" revives dead-letter events back to pending. */
export async function reviveDeadEvents(ownerId: string, db?: FuelUpLocalDb): Promise<number> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  const dead = await d.outbox.where('[ownerId+status]').equals([o, 'dead']).primaryKeys();
  if (dead.length === 0) return 0;
  await d.outbox.where('id').anyOf(dead).modify({ status: 'pending' satisfies OutboxStatus, retryCount: 0, nextAttemptAt: 0 });
  return dead.length;
}

/** Release stuck `inflight` claims (e.g. after a crashed tab). */
export async function releaseInflightEvents(ownerId: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  await d.outbox.where('[ownerId+status]').equals([o, 'inflight']).modify({ status: 'pending' satisfies OutboxStatus });
}
