// =============================================
// FuelUp - App-level config (non-secret)
// Single place for storage keys, defaults, PWA placeholders.
// =============================================

export const STORAGE_KEYS = {
  profile: 'fuelup-profile',
  metrics: 'fuelup-metrics',
  calories: 'fuelup-calories',
  exercise: 'fuelup-exercise',
  habits: 'fuelup-habits',
  workoutPlanner: 'fuelup-workout-planner',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Owner id used by local-only stores until Clerk sync lands (Phase 2+).
 * Previously hardcoded as '' in multiple stores/pages. Centralized here so
 * future migration to real user ids is a single-point change.
 * Must never be treated as an authenticated identity server-side.
 */
export const LOCAL_OWNER_ID = '' as const;

export const PERSIST_VERSION = 1;

/**
 * Displayed app version (Settings, diagnostics). MUST match package.json
 * "version" — enforced by config/app.test.ts so the two cannot drift.
 */
export const APP_VERSION = '0.1.0';

export const APP_META = {
  name: 'FuelUp',
  description:
    'Track calories, workouts, body metrics, and habits all in one app. Your all-in-one fitness companion.',
  themeColor: '#0b0b0c',
} as const;
