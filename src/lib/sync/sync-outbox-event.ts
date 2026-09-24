// =============================================
// FuelUp - Outbox event row (IndexedDB)
// The row id IS the mutationId: retries of the same row are naturally
// idempotent server-side (ProcessedMutation dedupe). Payloads are snapshots
// captured at enqueue time, so later local edits can't corrupt a retry.
// =============================================
import type { SyncEntity, SyncOperation } from './sync-contracts';

export type OutboxStatus = 'pending' | 'inflight' | 'dead';

export interface LocalOutboxEvent {
  id: string;
  ownerId: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  /** Epoch ms before which this event must not be retried. */
  nextAttemptAt: number;
  status: OutboxStatus;
}
