// =============================================
// FuelUp - Target-history repository (IndexedDB)
// Append-only change events: each applied adaptive target writes one row.
// Derived analytics (maintenance, trend, quality) are NEVER stored — they
// are recomputed from raw facts. Rows sync as entity 'targetHistory' through
// the standard outbox; cross-device pulls converge because every device
// derives the same estimate from the same raw facts.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { TargetHistory } from '@/lib/types';
import { enqueueSyncEvent } from '@/lib/sync/outbox';
import { omitOwner, repoContext, repoError } from './base';

function strip<T extends { ownerId: string }>(row: T): Omit<T, 'ownerId'> {
  return omitOwner(row);
}

export async function listTargetHistory(ownerId: string, db?: FuelUpLocalDb): Promise<TargetHistory[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.targetHistory.where('ownerId').equals(o).toArray();
    return (rows.map((r) => strip(r)) as TargetHistory[]).sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
  } catch (error) {
    repoError('target history', 'load', error);
  }
}

export async function saveTargetHistory(
  ownerId: string,
  entry: TargetHistory,
  db?: FuelUpLocalDb
): Promise<TargetHistory> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.targetHistory.put({ ...entry, ownerId: o });
    await enqueueSyncEvent(o, { entity: 'targetHistory', entityId: entry.id, operation: 'upsert', payload: { ...entry } }, d);
    return entry;
  } catch (error) {
    repoError('target history', 'save', error);
  }
}

export async function removeTargetHistory(ownerId: string, id: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.targetHistory.get(id);
    if (!row || row.ownerId !== o) return;
    await d.targetHistory.delete(id);
    await enqueueSyncEvent(o, { entity: 'targetHistory', entityId: id, operation: 'delete', payload: { id } }, d);
  } catch (error) {
    repoError('target history', 'delete', error);
  }
}
