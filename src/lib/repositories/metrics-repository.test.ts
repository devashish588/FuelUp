import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, metric, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import {
  getLatestMetric,
  listMetrics,
  listMetricsInRange,
  removeMetric,
  saveMetricForDate,
  updateMetric,
} from './metrics-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

describe('metrics repository', () => {
  it('saves and retrieves weight measurements', async () => {
    await saveMetricForDate(OWNER_A, metric({ date: '2026-09-20', weight_kg: 71 }), db);
    await saveMetricForDate(OWNER_A, metric({ date: '2026-09-22', weight_kg: 70 }), db);
    const all = await listMetrics(OWNER_A, db);
    expect(all.map((m) => m.date)).toEqual(['2026-09-20', '2026-09-22']);
    expect(await getLatestMetric(OWNER_A, db)).toMatchObject({ date: '2026-09-22', weight_kg: 70 });
  });

  it('upserts same-day measurements instead of duplicating (double-tap safe)', async () => {
    await saveMetricForDate(OWNER_A, metric({ id: 'm-1', date: '2026-09-22', weight_kg: 70 }), db);
    await saveMetricForDate(OWNER_A, metric({ id: 'm-2', date: '2026-09-22', weight_kg: 70.5 }), db);
    const all = await listMetrics(OWNER_A, db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'm-2', weight_kg: 70.5 });
  });

  it('scopes records to the owner namespace', async () => {
    await saveMetricForDate(OWNER_A, metric({ date: '2026-09-22', weight_kg: 70 }), db);
    expect(await listMetrics(OWNER_B, db)).toHaveLength(0);
    expect(await getLatestMetric(OWNER_B, db)).toBeNull();
  });

  it('queries date ranges without UTC shifting', async () => {
    await saveMetricForDate(OWNER_A, metric({ date: '2026-08-31', weight_kg: 72 }), db);
    await saveMetricForDate(OWNER_A, metric({ date: '2026-09-01', weight_kg: 71 }), db);
    await saveMetricForDate(OWNER_A, metric({ date: '2026-09-22', weight_kg: 70 }), db);
    const sept = await listMetricsInRange(OWNER_A, '2026-09-01', '2026-09-30', db);
    expect(sept.map((m) => m.date)).toEqual(['2026-09-01', '2026-09-22']);
  });

  it('updates and deletes only within the owner namespace', async () => {
    const m = metric({ id: 'm-x', date: '2026-09-22', weight_kg: 70 });
    await saveMetricForDate(OWNER_A, m, db);
    await updateMetric(OWNER_B, 'm-x', { weight_kg: 99 }, db); // cross-owner: no-op
    expect((await listMetrics(OWNER_A, db))[0].weight_kg).toBe(70);
    await updateMetric(OWNER_A, 'm-x', { weight_kg: 69 }, db);
    expect((await listMetrics(OWNER_A, db))[0].weight_kg).toBe(69);
    await removeMetric(OWNER_B, 'm-x', db); // cross-owner: no-op
    expect(await listMetrics(OWNER_A, db)).toHaveLength(1);
    await removeMetric(OWNER_A, 'm-x', db);
    expect(await listMetrics(OWNER_A, db)).toHaveLength(0);
  });

  it('rejects empty owner ids instead of leaking across namespaces', async () => {
    await expect(listMetrics('', db)).rejects.toThrow();
  });
});
