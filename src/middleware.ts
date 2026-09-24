import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Phase 1: Clerk middleware restored (was a permissive passthrough).
// Pages stay reachable so localStorage-only mode keeps working; API
// authorization is enforced per-route via lib/auth (401 when signed out).
// Phase 2 will tighten page protection once cloud sync lands.
const isWebhookRoute = createRouteMatcher(['/api/webhooks(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isWebhookRoute(req)) {
    // Clerk/Svix verification happens inside the webhook handler.
    return NextResponse.next();
  }
  // Pages + non-webhook API routes continue through Clerk's session
  // handling; API handlers call requireDbUser() for 401s.
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
