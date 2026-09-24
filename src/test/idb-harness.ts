// Shared IndexedDB test harness: fake-indexeddb + isolated Dexie database.
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { resetLocalDbForTests, type FuelUpLocalDb } from '@/lib/db/local-db';

let current: FuelUpLocalDb | undefined;

export async function testDb(): Promise<FuelUpLocalDb> {
  if (current) {
    await current.delete();
    await current.open();
    return current;
  }
  current = await resetLocalDbForTests();
  return current;
}

afterEach(async () => {
  if (current) {
    await current.delete();
    current = undefined;
  }
});

export const OWNER_A = 'user-a';
export const OWNER_B = 'user-b';

export function metric(overrides: Record<string, unknown> = {}) {
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-a',
    date: '2026-09-22',
    weight_kg: 70,
    height_cm: 175,
    body_fat_percentage: null,
    bmi: 22.9,
    waist_cm: null,
    chest_cm: null,
    arms_cm: null,
    thighs_cm: null,
    notes: '',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
