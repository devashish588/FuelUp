// =============================================
// FuelUp - AI vision request handling (server, Phase 9)
// Thin, testable, framework-free like the text handler. Meal photos and
// nutrition labels share validation, rate limiting, and error mapping;
// only the task dispatch + messages differ. Never writes to any database:
// meal results flow to the resolver client-side, label results to a
// user-confirmed FoodItem. Images are request-scoped (never stored).
// =============================================
import { getAiConfig } from './config';
import { isVisionCapableProvider } from './providers';
import { AI_RATE_LIMIT_WINDOW_MS, getAiRateLimiter } from './rate-limit';
import { AiError } from './types';
import {
  AI_MAX_IMAGE_BASE64_CHARS,
  aiVisionRequestSchema,
  sniffImageMime,
  type AiVisionTask,
} from './vision-schemas';
import {
  parseLabelImage,
  parseMealImage,
  type LabelVisionResult,
  type MealVisionResult,
  type VisionDeps,
} from './vision-service';
import type { RouteOutcome } from './route-handler';
import { visionStatusFor } from './vision-status-codes';

/** Raw body cap: base64 image (~1 MB) + JSON overhead. */
export const AI_VISION_MAX_BODY_BYTES = 1536 * 1024;

export interface VisionRouteDeps extends VisionDeps {
  rateLimitMax?: number;
}

function visionMessageFor(code: string, task: AiVisionTask): string {
  switch (code) {
    case 'AI_TIMEOUT':
      return 'The AI took too long to respond. Try again or log manually.';
    case 'AI_QUOTA':
      return 'AI usage limit reached. Please try later or log manually.';
    case 'AI_RATE_LIMITED':
      return 'Too many AI requests. Please wait a bit or use manual entry.';
    case 'AI_CONFIGURATION_ERROR':
      return "AI photo analysis isn't available right now. Use manual entry.";
    case 'AI_IMAGE_UNSUPPORTED':
      return "This AI setup doesn't support photos. Use manual entry.";
    case 'AI_INVALID_OUTPUT':
      return task === 'meal'
        ? "Couldn't understand that photo. Try a clearer shot or enter foods manually."
        : "That label couldn't be read. Try a clearer photo or enter values manually.";
    case 'AI_REQUEST_TOO_LARGE':
      return 'That photo is too large. Try a smaller image.';
    case 'AI_UNAVAILABLE':
    default:
      return 'AI unavailable — use manual entry.';
  }
}

function statusForVision(code: string): number {
  return visionStatusFor(code);
}

export async function handleVisionRequest(input: {
  userId: string;
  rawBody: string;
  deps?: VisionRouteDeps;
}): Promise<RouteOutcome> {
  const { userId, rawBody, deps } = input;
  if (rawBody.length > AI_VISION_MAX_BODY_BYTES) {
    return { status: 413, body: { error: visionMessageFor('AI_REQUEST_TOO_LARGE', 'meal'), code: 'AI_REQUEST_TOO_LARGE' } };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody) as unknown;
  } catch {
    return { status: 400, body: { error: 'That photo request was invalid.', code: 'BAD_REQUEST' } };
  }
  const parsed = aiVisionRequestSchema.safeParse(json);
  if (!parsed.success) {
    return { status: 400, body: { error: 'That photo request was invalid. Try a JPEG, PNG, or WebP photo.', code: 'BAD_REQUEST' } };
  }
  const { task, image, text } = parsed.data;
  if (image.dataBase64.length > AI_MAX_IMAGE_BASE64_CHARS) {
    return { status: 413, body: { error: visionMessageFor('AI_REQUEST_TOO_LARGE', task), code: 'AI_REQUEST_TOO_LARGE' } };
  }
  // Declared MIME alone is not trusted — verify magic bytes (no image decode).
  const sniffed = sniffImageMime(image.dataBase64);
  if (sniffed !== image.mimeType) {
    return { status: 400, body: { error: "That photo couldn't be read. Try a JPEG, PNG, or WebP photo.", code: 'BAD_REQUEST' } };
  }
  const config = deps?.config ?? getAiConfig();
  const limiter = getAiRateLimiter(deps?.rateLimitMax ?? config.imageRequestsPerHour, AI_RATE_LIMIT_WINDOW_MS);
  const limit = limiter.check(`${userId}:vision`);
  if (!limit.allowed) {
    return {
      status: 429,
      body: { error: visionMessageFor('AI_RATE_LIMITED', task), code: 'AI_RATE_LIMITED', retryAfterMs: limit.resetMs },
    };
  }
  try {
    if (task === 'meal') {
      const result: MealVisionResult = await parseMealImage({ image, text }, { ...deps, config });
      return {
        status: 200,
        body: {
          task,
          items: result.items,
          clarificationRequired: result.clarificationRequired,
          meta: { requestId: result.meta.requestId, model: result.meta.model, latencyMs: result.meta.latencyMs },
        },
      };
    }
    const result: LabelVisionResult = await parseLabelImage({ image }, { ...deps, config });
    return {
      status: 200,
      body: {
        task,
        label: result.label,
        clarificationRequired: result.clarificationRequired,
        meta: { requestId: result.meta.requestId, model: result.meta.model, latencyMs: result.meta.latencyMs },
      },
    };
  } catch (error) {
    const code = error instanceof AiError ? error.code : 'AI_UNAVAILABLE';
    return { status: statusForVision(code), body: { error: visionMessageFor(code, task), code } };
  }
}

/** Status extension fields (additive over the Phase 8 text status). */
export function visionStatusExtension(input: { userId: string; deps?: VisionRouteDeps }): {
  visionSupported: boolean;
  imageRequestsRemaining: number;
} {
  const config = input.deps?.config ?? getAiConfig();
  const limiter = getAiRateLimiter(input.deps?.rateLimitMax ?? config.imageRequestsPerHour, AI_RATE_LIMIT_WINDOW_MS);
  const allowance = input.deps?.rateLimitMax ?? config.imageRequestsPerHour;
  return {
    visionSupported:
      config.visionEnabled && config.enabled && isVisionCapableProvider(config.provider),
    imageRequestsRemaining: Math.max(allowance - limiter.count(`${input.userId}:vision`), 0),
  };
}
