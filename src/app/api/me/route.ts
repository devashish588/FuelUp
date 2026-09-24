import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { createOrUpdateUser } from '@/lib/services/user-service';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';

/**
 * Resolve (and lazily provision) the FuelUp DB user for the current Clerk
 * session. The client uses the returned `id` as the local owner namespace,
 * so every IndexedDB record is scoped to the authenticated user.
 * Never returns another user's data: identity comes from the session only.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Please sign in to continue.', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress ?? '';
    const name =
      [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') ||
      clerkUser?.username ||
      undefined;
    const user = await createOrUpdateUser(userId, email, name ?? undefined);
    return NextResponse.json({ id: user.id, clerkId: user.clerkId, email: user.email, name: user.name });
  } catch (error) {
    logger.error('GET /api/me failed', {});
    const { body, status } = toErrorResponse(error, 'profile');
    return NextResponse.json(body, { status });
  }
}
