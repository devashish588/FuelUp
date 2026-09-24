// =============================================
// FuelUp - Sync triggers (client, no polling loop)
// Sync runs on: initial user boot, outbox changes (debounced), network
// reconnect, tab refocus (throttled), manual request, scheduled
// backoff wake-ups, and optional Background Sync events relayed from the
// service worker (progressive enhancement only).
// =============================================
'use client';
import { BG_SYNC_TAG } from '@/config/pwa';
import { subscribeOutboxChanged } from './notify';
import { refreshSyncState, syncNow } from './sync-controller';
import { useSessionStore } from '@/lib/session/session-store';

const MUTATION_DEBOUNCE_MS = 3000;
const FOCUS_MIN_INTERVAL_MS = 60 * 1000;

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let dueTimer: ReturnType<typeof setTimeout> | undefined;
let lastRunAt = 0;
let setupDone = false;

function currentUserOwner(): string | null {
  const session = useSessionStore.getState();
  return session.mode === 'user' ? session.ownerId : null;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function maybeSync(): Promise<void> {
  const ownerId = currentUserOwner();
  if (!ownerId || !isOnline()) return;
  lastRunAt = Date.now();
  await syncNow();
}

/** Schedule a wake-up when the earliest backoff comes due (cleared on runs). */
export function scheduleDueSync(ownerId: string, dueAt: number | null): void {
  if (dueTimer) {
    clearTimeout(dueTimer);
    dueTimer = undefined;
  }
  if (dueAt == null) return;
  const delay = Math.max(dueAt - Date.now(), 1000);
  if (delay > 30 * 60 * 1000) return; // far future: rely on triggers instead
  dueTimer = setTimeout(() => {
    void refreshSyncState(ownerId).then(() => maybeSync());
  }, delay);
}

function scheduleDebouncedSync(ownerId: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void refreshSyncState(ownerId).then(() => maybeSync());
  }, MUTATION_DEBOUNCE_MS);
  requestBackgroundSync();
}

/**
 * Best-effort Background Sync registration: if the browser + service worker
 * support it, the OS may wake the PWA to sync. Failures are silent — the
 * page-level triggers above remain the source of truth.
 */
function requestBackgroundSync(): void {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    void container.ready
      .then((reg) => {
        const sync = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
        if (sync) return sync.register(BG_SYNC_TAG).catch(() => undefined);
        return undefined;
      })
      .catch(() => undefined);
  } catch {
    /* never break a local write path */
  }
}

/** Register all triggers once (called from the session bootstrap effect). */
export function setupSyncTriggers(): () => void {
  if (setupDone) return () => undefined;
  setupDone = true;

  const unsub = subscribeOutboxChanged(() => {
    const ownerId = currentUserOwner();
    if (!ownerId) return;
    scheduleDebouncedSync(ownerId);
  });

  const onOnline = () => {
    void maybeSync();
  };
  const onFocus = () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastRunAt < FOCUS_MIN_INTERVAL_MS) return;
    void maybeSync();
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onFocus);
  return () => {
    unsub();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onFocus);
    if (debounceTimer) clearTimeout(debounceTimer);
    if (dueTimer) clearTimeout(dueTimer);
    setupDone = false;
  };
}

/** Manual "Sync now" (revives dead-letter events, runs immediately). */
export async function requestManualSync(): Promise<void> {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (dueTimer) clearTimeout(dueTimer);
  lastRunAt = Date.now();
  await syncNow({ manual: true });
}
