import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FuelUpLocalDb, resetLocalDbForTests, type FuelUpLocalDb as DbType } from '@/lib/db/local-db';
import {
  ackEvents,
  backoffDelayMs,
  countPendingEvents,
  earliestDueAt,
  enqueueSyncEvent,
  failEvents,
  listDueEvents,
  markEventsInflight,
  releaseInflightEvents,
  reviveDeadEvents,
} from './outbox';

const OWNER = 'owner-outbox';
let db: DbType;

beforeEach(async () => {
  db = await resetLocalDbForTests();
});

function habitPayload(id: string, name: string) {
  return { id, name, icon: 'target', color: '#f59e0b', target_value: 1, unit: 'times', frequency: 'daily' };
}

describe('outbox', () => {
  it('enqueues and lists due events oldest-first', async () => {
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'upsert', payload: habitPayload('h-1', 'A') }, db);
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-2', operation: 'upsert', payload: habitPayload('h-2', 'B') }, db);
    const due = await listDueEvents(OWNER, 50, Date.now(), db);
    expect(due.map((e) => e.entityId)).toEqual(['h-1', 'h-2']);
    expect(due[0]).toMatchObject({ status: 'pending', retryCount: 0 });
    expect(typeof due[0].id).toBe('string');
  });

  it('coalesces rapid upserts for the same row (stable mutation id)', async () => {
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'upsert', payload: habitPayload('h-1', 'A') }, db);
    const first = await listDueEvents(OWNER, 50, Date.now(), db);
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'upsert', payload: habitPayload('h-1', 'B') }, db);
    const due = await listDueEvents(OWNER, 50, Date.now(), db);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(first[0].id); // same mutation → idempotent retry
    expect(due[0].payload).toMatchObject({ name: 'B' });
  });

  it('lets a delete absorb pending upserts, and never merges independent ids', async () => {
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'upsert', payload: habitPayload('h-1', 'A') }, db);
    await enqueueSyncEvent(OWNER, { entity: 'foodLog', entityId: 'fl-9', operation: 'upsert', payload: { id: 'fl-9' } }, db);
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'delete', payload: { id: 'h-1' } }, db);
    const due = await listDueEvents(OWNER, 50, Date.now(), db);
    expect(due).toHaveLength(2);
    expect(due.find((e) => e.entityId === 'h-1')?.operation).toBe('delete');
    expect(due.find((e) => e.entityId === 'fl-9')).toBeDefined();
  });

  it('acks remove events and counts pending', async () => {
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'upsert', payload: habitPayload('h-1', 'A') }, db);
    expect(await countPendingEvents(OWNER, db)).toBe(1);
    const [row] = await listDueEvents(OWNER, 50, Date.now(), db);
    await markEventsInflight([row.id], db);
    expect(await listDueEvents(OWNER, 50, Date.now(), db)).toHaveLength(0);
    await releaseInflightEvents(OWNER, db); // crash recovery
    expect(await listDueEvents(OWNER, 50, Date.now(), db)).toHaveLength(1);
    await ackEvents([row.id], db);
    expect(await countPendingEvents(OWNER, db)).toBe(0);
  });

  it('backs off with bounded retries then dead-letters (revivable manually)', async () => {
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'upsert', payload: habitPayload('h-1', 'A') }, db);
    const [row] = await listDueEvents(OWNER, 50, Date.now(), db);
    await failEvents([row.id], db);
    const after = await db.outbox.get(row.id);
    expect(after?.retryCount).toBe(1);
    expect(after?.nextAttemptAt).toBeGreaterThan(Date.now());
    expect(after?.status).toBe('pending');
    // Not due yet → excluded from the batch.
    expect(await listDueEvents(OWNER, 50, Date.now(), db)).toHaveLength(0);
    expect(await earliestDueAt(OWNER, db)).toBeGreaterThan(Date.now());

    // Exhaust retries → dead, still counted, revivable.
    for (let i = 0; i < 10; i++) await failEvents([row.id], db);
    expect((await db.outbox.get(row.id))?.status).toBe('dead');
    expect(await countPendingEvents(OWNER, db)).toBe(1);
    expect(await reviveDeadEvents(OWNER, db)).toBe(1);
    const revived = await db.outbox.get(row.id);
    expect(revived?.status).toBe('pending');
    expect(revived?.retryCount).toBe(0);
  });

  it('uses exponential backoff (no tight retry loop)', () => {
    const d1 = backoffDelayMs(1);
    const d3 = backoffDelayMs(3);
    const d20 = backoffDelayMs(20);
    expect(d1).toBeGreaterThanOrEqual(9000);
    expect(d3).toBeGreaterThan(d1);
    expect(d20).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  it('persists pending events across reload (reopen same database)', async () => {
    const name = `reload-${Math.random().toString(36).slice(2)}`;
    const first = new FuelUpLocalDb(name);
    await first.open();
    await enqueueSyncEvent(OWNER, { entity: 'habit', entityId: 'h-1', operation: 'upsert', payload: habitPayload('h-1', 'A') }, first);
    first.close();
    const reopened = new FuelUpLocalDb(name);
    await reopened.open();
    try {
      expect(await countPendingEvents(OWNER, reopened)).toBe(1);
      const due = await listDueEvents(OWNER, 50, Date.now(), reopened);
      expect(due[0]).toMatchObject({ entity: 'habit', entityId: 'h-1' });
    } finally {
      reopened.close();
    }
  });
});
