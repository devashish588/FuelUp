// =============================================
// FuelUp - Repository base (client, IndexedDB)
// Shared owner-scoping + error mapping. UI never imports this directly;
// only repositories and (test) migration code.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { getLocalDb, requireIndexedDB } from '@/lib/db/local-db';
import { AppError, Errors } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';

export interface RepoContext {
  db: FuelUpLocalDb;
  ownerId: string;
}

/** Resolve a usable context or throw a user-safe error (never raw IDB errors). */
export function repoContext(ownerId: string, db?: FuelUpLocalDb): RepoContext {
  if (!ownerId) {
    throw new AppError(
      'SESSION_NOT_READY',
      'Your local session is not ready yet. Please reopen the app.',
      500
    );
  }
  try {
    requireIndexedDB();
  } catch {
    throw new AppError(
      'LOCAL_DB_UNAVAILABLE',
      "Couldn't access local storage on this device.",
      500
    );
  }
  return { db: db ?? getLocalDb(), ownerId };
}

export type RepoOp = 'save' | 'load' | 'delete';

/** Drop the local `ownerId` when returning rows as domain entities. */
export function omitOwner<T extends { ownerId?: string }>(row: T): Omit<T, 'ownerId'> {
  const clone = { ...row };
  delete clone.ownerId;
  return clone;
}

/** Drop identity/key fields that must never be overwritten by partial updates. */
export function withoutKeys<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const clone = { ...obj };
  for (const key of keys) delete clone[key];
  return clone;
}

/** Map a technical failure to a user-safe AppError (log the technical side). */
export function repoError(what: string, op: RepoOp, error: unknown): never {
  logger.error(`Local ${op} failed: ${what}`, {});
  void error;
  if (op === 'save') throw Errors.saveFailed(what);
  if (op === 'delete') throw Errors.deleteFailed(what);
  throw Errors.loadFailed(what);
}
