// =============================================
// FuelUp - Centralized AI configuration (server-only)
// All provider/model/timeout/limit knobs live here. Switching providers
// means changing env vars, never the Food domain. Never import from client
// components (reads server-only secrets).
// =============================================

export interface AiConfig {
  provider: string;
  apiBaseUrl: string;
  apiKey: string | undefined;
  model: string;
  timeoutMs: number;
  maxTextChars: number;
  maxItems: number;
  requestsPerHour: number;
  /** True when a provider call can be attempted (key present). */
  enabled: boolean;
  // --- Phase 9: vision ---
  /** Model used for image tasks (defaults to the text model). */
  visionModel: string;
  /**
   * Whether image analysis may be attempted. Explicit kill-switch for
   * text-only deployments; 'false' disables even when a key exists.
   */
  visionEnabled: boolean;
  /** Separate, lower hourly allowance for image requests (cost control). */
  imageRequestsPerHour: number;
}

function num(env: { [key: string]: string | undefined }, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getAiConfig(env: { [key: string]: string | undefined } = process.env): AiConfig {
  const provider = env.AI_PROVIDER ?? 'openai-compatible';
  const apiKey = env.AI_API_KEY || undefined;
  const model = env.AI_MODEL || 'gpt-4o-mini';
  return {
    provider,
    apiBaseUrl: env.AI_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey,
    model,
    timeoutMs: num(env, 'AI_TIMEOUT_MS', 20000),
    maxTextChars: num(env, 'AI_MAX_TEXT_CHARS', 500),
    maxItems: num(env, 'AI_MAX_ITEMS', 15),
    requestsPerHour: num(env, 'AI_REQUESTS_PER_HOUR', 20),
    enabled: !!apiKey,
    visionModel: env.AI_VISION_MODEL || model,
    visionEnabled: (env.AI_VISION_ENABLED ?? 'true').toLowerCase() !== 'false',
    imageRequestsPerHour: num(env, 'AI_IMAGE_REQUESTS_PER_HOUR', 10),
  };
}
