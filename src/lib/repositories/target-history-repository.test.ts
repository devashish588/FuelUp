// Phase 7 — target-history repository: append-only events, owner isolation,
// outbox enqueue (offline-first), removal with tombstone event.
import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { TargetHistory } from '@/lib/types';
import { countPendingEvents } from '@/lib/sync/outbox';
import { listTargetHistory, removeTargetHistory, saveTargetHistory } from './target-history-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

function entry(id: string, overrides: Partial<TargetHistory> = {}): TargetHistory {
  return {
    id,
    user_id: OWNER_A,
    date: '2026-09-22',
    previous_target: 2500,
    new_target: 2650,
    reason: 'Estimated maintenance rose (3100 → 3250 kcal) based on recent intake and weight trend.',
    maintenance_estimate: 3250,
    valid_days: 21,
    confidence: 'high',
    goal: 'cut',
    avg_intake_kcal: 2700,
    previous_rate_kg_per_week: null,
    new_rate_kg_per_week: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('target-history repository', () => {
  it('appends events and lists them in date order', async () => {
    await saveTargetHistory(OWNER_A, entry('th-2', { date: '2026-09-20' }), db);
    await saveTargetHistory(OWNER_A, entry('th-1', { date: '2026-09-13' }), db);
    const rows = await listTargetHistory(OWNER_A, db);
    expect(rows.map((r) => r.id)).toEqual(['th-1', 'th-2']);
    expect(rows[1]).toMatchObject({ previous_target: 2500, new_target: 2650, goal: 'cut' });
  });

  it('isolates owners (no cross-user reads)', async () => {
    await saveTargetHistory(OWNER_A, entry('th-a'), db);
    await saveTargetHistory(OWNER_B, entry('th-b', { user_id: OWNER_B }), db);
    expect((await listTargetHistory(OWNER_A, db)).map((r) => r.id)).toEqual(['th-a']);
    expect((await listTargetHistory(OWNER_B, db)).map((r) => r.id)).toEqual(['th-b']);
  });

  it('enqueues an outbox event per save (offline-first sync)', async () => {
    await saveTargetHistory(OWNER_A, entry('th-1'), db);
    expect(await countPendingEvents(OWNER_A, db)).toBe(1);
  });

  it('removes with a tombstone event and ignores other owners', async () => {
    await saveTargetHistory(OWNER_A, entry('th-1'), db);
    await removeTargetHistory(OWNER_B, 'th-1', db);
    expect(await listTargetHistory(OWNER_A, db)).toHaveLength(1);
    await removeTargetHistory(OWNER_A, 'th-1', db);
    expect(await listTargetHistory(OWNER_A, db)).toHaveLength(0);
    // The delete absorbs the pending upsert (outbox coalescing): one event left.
    expect(await countPendingEvents(OWNER_A, db)).toBe(1);
  });
});
