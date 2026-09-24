// =============================================
// FuelUp - Server auth helpers (Clerk -> FuelUp user)
// Single place for API authorization. Phase 1: isolate only.
// Phase 2 will wire stores/sync to these user ids.
// =============================================
import { auth } from '@clerk/nextjs/server';
import { getUserByClerkId } from '@/lib/services/user-service';
import { Errors } from '@/lib/errors/app-error';

/** Resolve the FuelUp DB user for the current Clerk session. Null when signed out or not yet synced. */
export async function getCurrentDbUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return getUserByClerkId(userId);
}

/** Same as above but throws a user-safe 401 AppError when missing. */
export async function requireDbUser() {
  const user = await getCurrentDbUser();
  if (!user) throw Errors.unauthorized();
  return user;
}
