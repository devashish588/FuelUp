'use client';
import { useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { initLocalSession } from '@/lib/session/session-init';

/**
 * Boots the local-first session once Clerk state is known and re-boots on
 * sign-in/out. Renders nothing and never blocks the UI.
 */
export function LocalSessionBootstrap() {
  const { isLoaded, isSignedIn, userId } = useAuth();

  useEffect(() => {
    void initLocalSession({
      isLoaded: !!isLoaded,
      isSignedIn: !!isSignedIn,
      clerkUserId: userId ?? null,
    });
  }, [isLoaded, isSignedIn, userId]);

  return null;
}
