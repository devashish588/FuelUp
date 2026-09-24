// =============================================
// FuelUp - Metrics repository (body measurements)
// Product rule (preserved): one measurement per calendar day — saving for
// an existing date replaces it (upsert-by-date in a transaction, so rapid
// double-taps cannot create duplicates).
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { BodyMetric } from '@/lib/types';
import { enqueueSyncEvent } from '@/lib/sync/outbox';
import { omitOwner, repoContext, repoError, withoutKeys } from './base';

function stripOwner(row: BodyMetric & { ownerId: string }): BodyMetric {
  return omitOwner(row);
}

export async function listMetrics(ownerId: string, db?: FuelUpLocalDb): Promise<BodyMetric[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.bodyMetrics.where('[ownerId+date]').between([o, ''], [o, '\uffff']).sortBy('date');
    return rows.map(stripOwner);
  } catch (error) {
    repoError('body metrics', 'load', error);
  }
}

export async function listMetricsInRange(
  ownerId: string,
  startDate: string,
  endDate: string,
  db?: FuelUpLocalDb
): Promise<BodyMetric[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.bodyMetrics.where('[ownerId+date]').between([o, startDate], [o, endDate]).sortBy('date');
    return rows.map(stripOwner);
  } catch (error) {
    repoError('body metrics', 'load', error);
  }
}

export async function getLatestMetric(ownerId: string, db?: FuelUpLocalDb): Promise<BodyMetric | null> {
  const metrics = await listMetrics(ownerId, db);
  return metrics.length > 0 ? metrics[metrics.length - 1] : null;
}

/** Insert or replace the measurement for `metric.date` (same-day upsert). */
export async function saveMetricForDate(
  ownerId: string,
  metric: BodyMetric,
  db?: FuelUpLocalDb
): Promise<BodyMetric> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.transaction('rw', d.bodyMetrics, async () => {
      const existing = await d.bodyMetrics.where('[ownerId+date]').equals([o, metric.date]).primaryKeys();
      if (existing.length > 0) await d.bodyMetrics.bulkDelete(existing);
      await d.bodyMetrics.put({ ...metric, ownerId: o });
    });
    await enqueueSyncEvent(o, { entity: 'bodyMetric', entityId: metric.id, operation: 'upsert', payload: { ...metric } }, d);
    return metric;
  } catch (error) {
    repoError('body metric', 'save', error);
  }
}

export async function updateMetric(
  ownerId: string,
  id: string,
  updates: Partial<BodyMetric>,
  db?: FuelUpLocalDb
): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.bodyMetrics.get(id);
    if (!row || row.ownerId !== o) return;
    await d.bodyMetrics.update(id, withoutKeys(updates, 'id', 'user_id'));
    const merged = await d.bodyMetrics.get(id);
    if (merged) {
      await enqueueSyncEvent(o, { entity: 'bodyMetric', entityId: id, operation: 'upsert', payload: { ...omitOwner(merged) } }, d);
    }
  } catch (error) {
    repoError('body metric', 'save', error);
  }
}

export async function removeMetric(ownerId: string, id: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.bodyMetrics.get(id);
    if (!row || row.ownerId !== o) return;
    await d.bodyMetrics.delete(id);
    await enqueueSyncEvent(o, { entity: 'bodyMetric', entityId: id, operation: 'delete', payload: { id } }, d);
  } catch (error) {
    repoError('body metric', 'delete', error);
  }
}
