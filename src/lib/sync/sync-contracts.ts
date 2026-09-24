// =============================================
// FuelUp - Sync contracts (single definition, client + server)
// The client sends SyncPushEvent[] and receives per-event results;
// pull returns entity rows newer than the cursor plus tombstones.
// Ownership NEVER travels in these payloads: the server derives the owner
// from the Clerk session (see apply-push / sync routes).
// =============================================

export const SYNC_ENTITIES = [
  'profile',
  'foodItem',
  'foodLog',
  'exercise',
  'workout',
  'bodyMetric',
  'habit',
  'habitLog',
  'favorite',
  'recipe',
  'recipeIngredient',
  'targetHistory',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OPERATIONS = ['upsert', 'create', 'delete'] as const;

export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

export interface SyncPushEvent {
  mutationId: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  /** Client row snapshot (snake_case domain shape, includes id). */
  payload: Record<string, unknown>;
}

export interface SyncPushRequest {
  events: SyncPushEvent[];
}

export type SyncEventResultStatus = 'ok' | 'duplicate' | 'conflict' | 'invalid' | 'retryable';

export interface SyncEventResult {
  mutationId: string;
  status: SyncEventResultStatus;
  /** User-safe message for invalid/conflict outcomes. */
  error?: string;
}

export interface SyncPushResponse {
  results: SyncEventResult[];
}

/** One server row (camelCase Prisma shape) with its ordering timestamp. */
export interface SyncChange<T = Record<string, unknown>> {
  row: T;
  updatedAt: string;
}

export interface SyncDeletionChange {
  entity: SyncEntity;
  entityId: string;
  deletedAt: string;
}

export interface SyncPullResponse {
  cursor: string;
  hasMore: boolean;
  changes: Partial<Record<SyncEntity, SyncChange[]>>;
  deletions: SyncDeletionChange[];
}

export const SYNC_PUSH_BATCH_LIMIT = 50;
export const SYNC_PULL_PAGE_LIMIT = 200;
