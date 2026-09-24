import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { deleteProfile, getProfile, saveProfile } from './profile-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

function profile() {
  const now = new Date().toISOString();
  return {
    id: 'p-1',
    full_name: 'Test User',
    email: '',
    date_of_birth: '2000-01-01',
    gender: 'male' as const,
    activity_level: 'moderately_active' as const,
    goal: 'recomp' as const,
    unit_system: 'metric' as const,
    daily_calorie_target: 2500,
    protein_target_g: 150,
    carbs_target_g: 250,
    fat_target_g: 70,
    target_rate_kg_per_week: null,
    target_source: 'initial' as const,
    created_at: now,
    updated_at: now,
  };
}

describe('profile repository', () => {
  it('saves, reads, and deletes one profile per owner', async () => {
    expect(await getProfile(OWNER_A, db)).toBeNull();
    await saveProfile(OWNER_A, profile(), db);
    expect(await getProfile(OWNER_A, db)).toMatchObject({ full_name: 'Test User' });
    await saveProfile(OWNER_A, { ...profile(), full_name: 'Renamed' }, db);
    expect(await getProfile(OWNER_A, db)).toMatchObject({ full_name: 'Renamed' });
    await deleteProfile(OWNER_A, db);
    expect(await getProfile(OWNER_A, db)).toBeNull();
  });
});
