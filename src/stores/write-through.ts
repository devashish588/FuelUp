// =============================================
// FuelUp - Store write-through helper (client)
// Actions update in-memory state synchronously (pages stay sync) and
// persist to IndexedDB in the background. Failures land on the store's
// `lastError` as user-safe messages (never raw IDB errors) and are logged.
// =============================================
import { AppError } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';

export function writeThrough(
  task: Promise<unknown>,
  label: string,
  onError: (message: string) => void
): void {
  task.then(
    () => undefined,
    (error: unknown) => {
      logger.error(`Write-through failed: ${label}`, {});
      onError(error instanceof AppError ? error.message : `Couldn't save your ${label} locally.`);
    }
  );
}
