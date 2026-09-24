// =============================================
// FuelUp - Persistence inventory (Phase 1)
// What lives in localStorage today, and where it is headed.
//
// UI state (not synced): active workout drafts, modal state, filters.
// Domain data (sync candidates): profile, food logs, workouts, metrics,
//   habits + habit logs, planner routines/PRs.
// Target: UI -> store/service -> repository -> IndexedDB -> API -> Prisma.
// IndexedDB + sync engine are intentionally deferred (see ARCHITECTURE.md).
// =============================================
import { STORAGE_KEYS } from '@/config/app';

export const LOCAL_STORAGE_INVENTORY = [
  { key: STORAGE_KEYS.profile, kind: 'domain', domain: 'profile', notes: 'Single profile + isOnboarded flag.' },
  { key: STORAGE_KEYS.calories, kind: 'domain', domain: 'nutrition', notes: 'Seed food DB + user food logs.' },
  { key: STORAGE_KEYS.exercise, kind: 'domain', domain: 'workouts', notes: 'Seed exercise DB + workouts + active draft.' },
  { key: STORAGE_KEYS.metrics, kind: 'domain', domain: 'metrics', notes: 'Body metrics, upserted by date.' },
  { key: STORAGE_KEYS.habits, kind: 'domain', domain: 'habits', notes: 'Habits + habit logs keyed by habit+date.' },
  { key: STORAGE_KEYS.workoutPlanner, kind: 'domain', domain: 'workouts', notes: 'Weekly routine + local PRs.' },
] as const;
