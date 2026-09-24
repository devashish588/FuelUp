// =============================================
// FuelUp - AI food-parse request handling (server)
// Thin, testable, framework-free: the Next route wires Clerk auth +
// NextResponse around this. Never creates a FoodLog — the route has no
// database access at all. Unknown request keys are stripped by Zod.
// =============================================
import { getAiConfig } from './config';
import { AI_RATE_LIMIT_WINDOW_MS, getAiRateLimiter } from './rate-limit';
import { aiFoodParseRequestSchema } from './schemas';
import { parseFoodText, type FoodParseResult, type ParseFoodTextDeps } from './service';
import { AiError } from './types';

/** Raw body cap for the AI endpoint (generous vs the 500-char text limit). */
export const AI_REQUEST_MAX_BODY_BYTES = 8 * 1024;

export interface FoodParseRouteDeps extends ParseFoodTextDeps {
  rateLimitMax?: number;
}

export interface RouteOutcome {
  status: number;
  body: unknown;
}

function userMessageFor(code: string): string {
  switch (code) {
    case 'AI_TIMEOUT':
      return 'The AI took too long to respond. Try again or log manually.';
    case 'AI_QUOTA':
      return 'AI usage limit reached. Please try later or log manually.';
    case 'AI_RATE_LIMITED':
      return 'Too many AI requests. Please wait a bit or log manually.';
    case 'AI_CONFIGURATION_ERROR':
      return "AI food logging isn't available right now. Use manual logging.";
    case 'AI_INVALID_OUTPUT':
      return "Couldn't understand that meal. You can edit it manually.";
    case 'AI_REQUEST_TOO_LARGE':
      return 'That description is too long. Try a shorter one.';
    case 'AI_UNAVAILABLE':
    default:
      return 'AI unavailable — use manual logging.';
  }
}

function statusFor(code: string): number {
  switch (code) {
    case 'AI_RATE_LIMITED':
      return 429;
    case 'AI_QUOTA':
      return 429;
    case 'AI_TIMEOUT':
      return 504;
    case 'AI_INVALID_OUTPUT':
      return 502;
    case 'AI_REQUEST_TOO_LARGE':
      return 413;
    case 'AI_CONFIGURATION_ERROR':
    case 'AI_UNAVAILABLE':
    default:
      return 503;
  }
}

export async function handleFoodParseRequest(input: {
  userId: string;
  rawBody: string;
  deps?: FoodParseRouteDeps;
}): Promise<RouteOutcome> {
  const { userId, rawBody, deps } = input;
  if (rawBody.length > AI_REQUEST_MAX_BODY_BYTES) {
    return { status: 413, body: { error: userMessageFor('AI_REQUEST_TOO_LARGE'), code: 'AI_REQUEST_TOO_LARGE' } };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody) as unknown;
  } catch {
    return { status: 400, body: { error: 'That request was invalid. Please check your input.', code: 'BAD_REQUEST' } };
  }
  const parsed = aiFoodParseRequestSchema.safeParse(json);
  if (!parsed.success) {
    return { status: 400, body: { error: 'Describe your meal in a few words (up to 500 characters).', code: 'BAD_REQUEST' } };
  }
  const config = deps?.config ?? getAiConfig();
  const limiter = getAiRateLimiter(deps?.rateLimitMax ?? config.requestsPerHour, AI_RATE_LIMIT_WINDOW_MS);
  const limit = limiter.check(userId);
  if (!limit.allowed) {
    return {
      status: 429,
      body: { error: userMessageFor('AI_RATE_LIMITED'), code: 'AI_RATE_LIMITED', retryAfterMs: limit.resetMs },
    };
  }
  try {
    const result: FoodParseResult = await parseFoodText(parsed.data.text, { ...deps, config });
    return {
      status: 200,
      body: {
        items: result.items,
        clarificationRequired: result.clarificationRequired,
        meta: { requestId: result.meta.requestId, model: result.meta.model, latencyMs: result.meta.latencyMs },
      },
    };
  } catch (error) {
    const code = error instanceof AiError ? error.code : 'AI_UNAVAILABLE';
    return { status: statusFor(code), body: { error: userMessageFor(code), code } };
  }
}

export function handleAiStatusRequest(input: {
  userId: string;
  deps?: FoodParseRouteDeps;
}): RouteOutcome {
  const config = input.deps?.config ?? getAiConfig();
  const limiter = getAiRateLimiter(input.deps?.rateLimitMax ?? config.requestsPerHour, AI_RATE_LIMIT_WINDOW_MS);
  const remaining = Math.max((input.deps?.rateLimitMax ?? config.requestsPerHour) - limiter.count(input.userId), 0);
  // Per-caller usage only (no global counters, no secrets, no other users).
  return {
    status: 200,
    body: {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model,
      requestsRemaining: remaining,
      windowSeconds: AI_RATE_LIMIT_WINDOW_MS / 1000,
    },
  };
}
