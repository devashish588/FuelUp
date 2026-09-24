// =============================================
// FuelUp - AI provider abstraction (Phase 8)
// Business logic calls AiProvider, never a vendor SDK. Fetch is injected
// so tests run without network. Server-only: implementations that carry
// API keys must never be imported by client components.
//
// Phase 9: optional vision members extend the abstraction in a
// provider-neutral way. They are optional so text-only providers (and
// existing fakes) keep compiling; capability is detected via
// providerSupportsVision() and unsupported requests fail fast with
// AI_IMAGE_UNSUPPORTED instead of crashing or silently downgrading.
// =============================================

/** Normalized AI failure codes (never vendor-specific messages to users). */
export const AI_ERROR_CODES = [
  'AI_UNAVAILABLE',
  'AI_TIMEOUT',
  'AI_QUOTA',
  'AI_INVALID_OUTPUT',
  'AI_REQUEST_TOO_LARGE',
  'AI_RATE_LIMITED',
  'AI_CONFIGURATION_ERROR',
  'AI_IMAGE_UNSUPPORTED',
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export class AiError extends Error {
  readonly code: AiErrorCode;
  /** True for transient failures where a single retry is safe. */
  readonly retryable: boolean;
  constructor(code: AiErrorCode, message?: string, retryable = false) {
    super(message ?? code);
    this.name = 'AiError';
    this.code = code;
    this.retryable = retryable;
  }
}

/** Image input for vision tasks (Phase 9 camera). Exactly one image per
 *  request; held in memory only, never persisted (see image lifecycle). */
export interface AiImageInput {
  mimeType: string;
  dataBase64: string;
}

export interface AiGenerateRequest {
  systemPrompt: string;
  userText: string;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Phase 9: populated by the vision service. Reserved in Phase 8. */
  images?: AiImageInput[];
}

/** Vision request: same knobs as text plus exactly one image. */
export interface AiVisionRequest {
  systemPrompt: string;
  /** Optional user clarification sent alongside the image (never ids). */
  userText: string;
  images: AiImageInput[];
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiGenerateResponse {
  /** Raw model text (expected to be JSON for structured tasks). */
  text: string;
  model: string;
  latencyMs: number;
}

export type FetchFn = typeof fetch;

export interface AiProvider {
  /** Stable identifier, e.g. 'openai-compatible'. Used in audit logs. */
  readonly name: string;
  generateText(request: AiGenerateRequest): Promise<AiGenerateResponse>;
  /**
   * Vision capability (Phase 9). Optional so text-only providers keep
   * compiling; the service capability-checks before calling.
   */
  readonly supportsVision?: boolean;
  generateVision?(request: AiVisionRequest): Promise<AiGenerateResponse>;
}

/** Capability detection: explicit flag AND an implementation present. */
export function providerSupportsVision(provider: AiProvider): boolean {
  return provider.supportsVision === true && typeof provider.generateVision === 'function';
}
