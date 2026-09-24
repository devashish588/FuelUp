// Legacy localStorage → IndexedDB migration: idempotent, non-destructive,
// tolerant of malformed payloads.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@/config/app';
import { resetLocalDbForTests, type FuelUpLocalDb } from '@/lib/db/local-db';
import { migrateLegacyStorageToIdb } from './legacy-migration';

const OWNER = 'user-migrate';
let db: FuelUpLocalDb;
let backing: Map<string, string>;

function installLocalStorage() {
  backing = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    },
  });
}

function legacy(key: string, state: unknown) {
  backing.set(key, JSON.stringify({ state, version: 1 }));
}

beforeEach(async () => {
  installLocalStorage();
  db = await resetLocalDbForTests();
});

describe('legacy migration', () => {
  it('migrates domain rows and skips static seeds', async () => {
    const now = new Date().toISOString();
    legacy(STORAGE_KEYS.profile, { profile: { id: 'p-1', full_name: 'Mig', email: '', date_of_birth: '', gender: 'male', activity_level: 'moderately_active', goal: 'recomp', unit_system: 'metric', daily_calorie_target: 2000, protein_target_g: 150, carbs_target_g: 200, fat_target_g: 65, created_at: now, updated_at: now }, isOnboarded: true });
    legacy(STORAGE_KEYS.metrics, { metrics: [{ id: 'm-1', user_id: '', date: '2026-09-22', weight_kg: 70, height_cm: 175, body_fat_percentage: null, bmi: 22.9, waist_cm: null, chest_cm: null, arms_cm: null, thighs_cm: null, notes: '', created_at: now }] });
    legacy(STORAGE_KEYS.calories, {
      foodItems: [
        { id: 'food-0', name: 'Seed', is_custom: false },
        { id: 'custom-1', name: 'Mine', brand: '', serving_size: 1, serving_unit: 'serving', calories_per_serving: 100, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0, barcode: null, is_custom: true, created_by: null, created_at: now },
      ],
      foodLogs: [{ id: 'fl-1', user_id: '', food_item_id: 'food-0', date: '2026-09-22', meal_type: 'breakfast', servings: 1, calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1, notes: '', created_at: now }],
    });
    legacy(STORAGE_KEYS.habits, {
      habits: [{ id: 'habit-0', user_id: '', name: 'Steps', icon: '', color: '#06b6d4', target_value: 10000, unit: 'steps', frequency: 'daily', is_default: true, is_active: true, sort_order: 0, created_at: now, updated_at: now }],
      habitLogs: [{ id: 'hl-1', habit_id: 'habit-0', user_id: '', date: '2026-09-22', value: 10000, completed: true, notes: '', created_at: now }],
    });
    legacy(STORAGE_KEYS.exercise, { exercises: [], workouts: [], activeWorkout: null });
    legacy(STORAGE_KEYS.workoutPlanner, { weeklyPlan: [], prs: [] });

    const first = await migrateLegacyStorageToIdb(OWNER, db);
    expect(first.migrated).toHaveLength(6);

    expect(await db.profiles.get(OWNER)).toMatchObject({ full_name: 'Mig' });
    expect(await db.bodyMetrics.where('ownerId').equals(OWNER).count()).toBe(1);
    // Seeds stay out; customs + logs come over.
    expect(await db.foodItems.where('ownerId').equals(OWNER).toArray()).toHaveLength(1);
    expect(await db.foodLogs.where('ownerId').equals(OWNER).count()).toBe(1);
    expect(await db.habits.where('ownerId').equals(OWNER).count()).toBe(1);
    expect(await db.habitLogs.where('ownerId').equals(OWNER).count()).toBe(1);

    // Idempotent rerun: no duplicates, everything skipped.
    const second = await migrateLegacyStorageToIdb(OWNER, db);
    expect(second.migrated).toHaveLength(0);
    expect(second.skipped).toHaveLength(6);
    expect(await db.bodyMetrics.where('ownerId').equals(OWNER).count()).toBe(1);

    // Non-destructive: legacy keys untouched.
    expect(backing.has(STORAGE_KEYS.metrics)).toBe(true);
  });

  it('survives malformed payloads without crashing', async () => {
    backing.set(STORAGE_KEYS.metrics, '{not-json');
    backing.set(STORAGE_KEYS.habits, JSON.stringify({ nope: true }));
    const result = await migrateLegacyStorageToIdb(OWNER, db);
    expect(result.migrated).toContain(STORAGE_KEYS.metrics);
    expect(await db.bodyMetrics.where('ownerId').equals(OWNER).count()).toBe(0);
  });
});
