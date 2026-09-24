// =============================================
// FuelUp - Profile repository (one profile per owner)
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { Profile } from '@/lib/types';
import { enqueueSyncEvent } from '@/lib/sync/outbox';
import { omitOwner, repoContext, repoError } from './base';

export async function getProfile(ownerId: string, db?: FuelUpLocalDb): Promise<Profile | null> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.profiles.get(o);
    return row ? omitOwner(row) : null;
  } catch (error) {
    repoError('profile', 'load', error);
  }
}

export async function saveProfile(ownerId: string, profile: Profile, db?: FuelUpLocalDb): Promise<Profile> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.profiles.put({ ...profile, ownerId: o });
    await enqueueSyncEvent(o, { entity: 'profile', entityId: profile.id, operation: 'upsert', payload: { ...profile } }, d);
    return profile;
  } catch (error) {
    repoError('profile', 'save', error);
  }
}

export async function deleteProfile(ownerId: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.profiles.delete(o);
  } catch (error) {
    repoError('profile', 'delete', error);
  }
}
