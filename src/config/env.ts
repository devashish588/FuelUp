// =============================================
// FuelUp - Centralized environment configuration
// Phase 1: separate PUBLIC (client-safe) from SERVER-ONLY secrets.
// Never import server vars from client components.
// =============================================

function readEnv(name: string): string | undefined {
  return process.env[name];
}

/** Client-safe (NEXT_PUBLIC_*) variables. Usable in browser. */
export const publicEnv = {
  clerkPublishableKey: readEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'),
  clerkSignInUrl: readEnv('NEXT_PUBLIC_CLERK_SIGN_IN_URL') ?? '/sign-in',
  clerkSignUpUrl: readEnv('NEXT_PUBLIC_CLERK_SIGN_UP_URL') ?? '/sign-up',
  clerkAfterSignInUrl: readEnv('NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL') ?? '/dashboard',
  clerkAfterSignUpUrl: readEnv('NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL') ?? '/onboarding',
} as const;

/** Server-only secrets. Import only from server code (API routes, services, middleware). */
export const serverEnv = {
  databaseUrl: readEnv('DATABASE_URL'),
  clerkSecretKey: readEnv('CLERK_SECRET_KEY'),
  clerkWebhookSecret: readEnv('CLERK_WEBHOOK_SECRET'),
  nodeEnv: readEnv('NODE_ENV') ?? 'development',
  // Phase 8: AI provider settings (names only here; see src/lib/ai/config.ts).
  aiProvider: readEnv('AI_PROVIDER'),
  aiApiBaseUrl: readEnv('AI_API_BASE_URL'),
  aiApiKey: readEnv('AI_API_KEY'),
  aiModel: readEnv('AI_MODEL'),
  // Phase 9: vision settings (names only; see src/lib/ai/config.ts).
  aiVisionModel: readEnv('AI_VISION_MODEL'),
  aiVisionEnabled: readEnv('AI_VISION_ENABLED'),
  aiImageRequestsPerHour: readEnv('AI_IMAGE_REQUESTS_PER_HOUR'),
} as const;

export function hasDatabaseConfigured(): boolean {
  const url = serverEnv.databaseUrl;
  return !!url && !url.includes('YOUR_PASSWORD') && !url.includes('YOUR_PROJECT');
}

export function isProduction(): boolean {
  return serverEnv.nodeEnv === 'production';
}
