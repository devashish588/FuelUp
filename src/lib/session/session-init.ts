// =============================================
// FuelUp - Local session initialization (client, single flow)
// App start → Clerk state → owner namespace → legacy migration →
// device carryover → load domain stores → render.
//
// Runs from <LocalSessionBootstrap/> on auth change. Never throws: offline
// or signed-out sessions fall back to the device namespace so data
// operations never depend on the network.
// =============================================
'use client';
import { getOrCreateDeviceId, isDeviceOwner, toDeviceOwner } from './owner';
import { useSessionStore } from './session-store';
import { migrateLegacyStorageToIdb } from '@/lib/migration/legacy-migration';
import { carryOverDeviceDataToUser } from '@/lib/migration/carryover';
import { setupSyncTriggers } from '@/lib/sync/sync-triggers';
import { syncNow } from '@/lib/sync/sync-controller';
import { logger } from '@/lib/logger/logger';
import { useProfileStore } from '@/stores/profile-store';
import { useMetricsStore } from '@/stores/metrics-store';
import { useHabitStore } from '@/stores/habit-store';
import { useExerciseStore } from '@/stores/exercise-store';
import { useWorkoutPlannerStore } from '@/stores/workout-planner-store';
import { useCalorieStore } from '@/stores/calorie-store';
import { useRecipeStore } from '@/stores/recipe-store';
import { useEnergyStore } from '@/stores/energy-store';

interface InitParams {
  isLoaded: boolean;
  isSignedIn: boolean;
  clerkUserId: string | null;
}

let inFlight: Promise<void> | null = null;
let initializedFor: string | null = null;

async function fetchFuelUpUserId(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Identity comes from the Clerk session cookie; no id is sent.
    const res = await fetch('/api/me', { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return typeof data.id === 'string' && data.id.length > 0 ? data.id : null;
  } catch (error) {
    logger.error('Owner resolution fell back to device namespace', {});
    void error;
    return null;
  }
}

async function loadDomainStores(ownerId: string): Promise<void> {
  const results = await Promise.allSettled([
    useProfileStore.getState().load(ownerId),
    useMetricsStore.getState().load(ownerId),
    useHabitStore.getState().load(ownerId),
    useExerciseStore.getState().load(ownerId),
    useWorkoutPlannerStore.getState().load(ownerId),
    useCalorieStore.getState().load(ownerId),
    useRecipeStore.getState().load(ownerId),
    useEnergyStore.getState().load(ownerId),
  ]);
  for (const r of results) {
    if (r.status === 'rejected') logger.error('Domain store load failed', {});
  }
}

/** Boot (or re-boot on auth change) the local-first session. Idempotent. */
export function initLocalSession(params: InitParams): Promise<void> {
  if (!params.isLoaded) return Promise.resolve();
  const cacheKey = `${params.isSignedIn ? 'in' : 'out'}:${params.clerkUserId ?? '-'}`;
  if (initializedFor === cacheKey && inFlight === null) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const deviceOwner = toDeviceOwner(getOrCreateDeviceId());
    let ownerId = deviceOwner;
    let mode: 'user' | 'device' = 'device';
    let fuelUpUserId: string | null = null;

    if (params.isSignedIn && params.clerkUserId) {
      const resolved = await fetchFuelUpUserId();
      if (resolved) {
        ownerId = resolved;
        mode = 'user';
        fuelUpUserId = resolved;
      }
    }

    // Legacy localStorage → this owner's namespace (markers make it a no-op rerun).
    try {
      await migrateLegacyStorageToIdb(ownerId);
    } catch (error) {
      logger.error('Legacy migration failed (non-fatal)', {});
      void error;
    }

    // Signed in with pre-existing device data → carry over once.
    if (mode === 'user' && !isDeviceOwner(ownerId)) {
      try {
        await carryOverDeviceDataToUser(deviceOwner, ownerId);
      } catch (error) {
        logger.error('Carryover failed (non-fatal)', {});
        void error;
      }
    }

    useSessionStore.getState().setSession({
      ownerId,
      mode,
      fuelUpUserId,
      clerkUserId: params.clerkUserId,
    });

    await loadDomainStores(ownerId);

    // Sync triggers + initial cycle (user namespaces only; device-local
    // never uploads — enforced inside the controller).
    setupSyncTriggers();
    if (mode === 'user') {
      try {
        await syncNow();
      } catch (error) {
        logger.error('Initial sync failed (non-fatal; local data intact)', {});
        void error;
      }
    }
    initializedFor = cacheKey;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Current owner for imperative store actions (null until bootstrap runs). */
export function currentOwnerId(): string | null {
  return useSessionStore.getState().ownerId;
}
