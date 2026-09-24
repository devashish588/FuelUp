// =============================================
// FuelUp - OpenAI-compatible chat provider (server-only)
// One implementation covers OpenAI, Groq, OpenRouter, and any compatible
// endpoint via AI_API_BASE_URL. Native fetch only (no vendor SDK).
// Retries: exactly one retry on safe transient failures (timeout, network
// error, HTTP 5xx). Never retries 4xx, quota, or malformed output —
// free-tier quota is not spent on doomed requests.
//
// Phase 9: generateVision sends OpenAI content-parts (text + image_url
// data URL). One image per request (cost control).
// =============================================
import {
  AiError,
  type AiGenerateRequest,
  type AiGenerateResponse,
  type AiProvider,
  type AiVisionRequest,
  type FetchFn,
} from '../types';

export interface OpenAiCompatibleOptions {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  /** Model override for vision calls (defaults to model). */
  visionModel?: string;
  fetchFn?: FetchFn;
}

function errorForStatus(status: number): AiError {
  if (status === 401 || status === 403) {
    return new AiError('AI_CONFIGURATION_ERROR', 'AI provider credentials were rejected.', false);
  }
  if (status === 429) {
    return new AiError('AI_QUOTA', 'AI usage quota exceeded.', false);
  }
  if (status === 413) {
    return new AiError('AI_REQUEST_TOO_LARGE', 'AI request was too large.', false);
  }
  if (status >= 500) {
    return new AiError('AI_UNAVAILABLE', 'AI provider is unavailable.', true);
  }
  return new AiError('AI_UNAVAILABLE', 'AI provider request failed.', false);
}

export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): AiProvider {
  const { apiBaseUrl, apiKey, model } = options;
  const visionModel = options.visionModel ?? model;
  const fetchFn: FetchFn = options.fetchFn ?? fetch;
  const base = apiBaseUrl.replace(/\/$/, '');

  async function attempt(args: {
    model: string;
    systemPrompt: string;
    userContent: unknown;
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<AiGenerateResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), args.timeoutMs);
    const started = Date.now();
    try {
      const res = await fetchFn(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: args.model,
          messages: [
            { role: 'system', content: args.systemPrompt },
            { role: 'user', content: args.userContent },
          ],
          temperature: 0,
          max_tokens: args.maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw errorForStatus(res.status);
      let data: unknown;
      try {
        data = (await res.json()) as unknown;
      } catch {
        throw new AiError('AI_INVALID_OUTPUT', 'AI provider returned a non-JSON response.', false);
      }
      const text = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.trim().length === 0) {
        throw new AiError('AI_INVALID_OUTPUT', 'AI provider returned an empty response.', false);
      }
      return { text, model: args.model, latencyMs: Date.now() - started };
    } catch (error) {
      if (error instanceof AiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiError('AI_TIMEOUT', 'AI provider timed out.', true);
      }
      throw new AiError('AI_UNAVAILABLE', 'AI provider could not be reached.', true);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Exactly one retry, only for safe transient failures. */
  async function withRetry(run: () => Promise<AiGenerateResponse>): Promise<AiGenerateResponse> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof AiError && error.retryable) return run();
      throw error;
    }
  }

  return {
    name: 'openai-compatible',
    supportsVision: true,
    async generateText(request: AiGenerateRequest): Promise<AiGenerateResponse> {
      // Future image support: when images are present, the user message uses
      // OpenAI content-parts; Phase 8 text flow never sends images.
      const userContent =
        request.images && request.images.length > 0
          ? [
              { type: 'text', text: request.userText },
              ...request.images.map((img) => ({
                type: 'image_url',
                image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
              })),
            ]
          : request.userText;
      return withRetry(() =>
        attempt({
          model,
          systemPrompt: request.systemPrompt,
          userContent,
          maxOutputTokens: request.maxOutputTokens,
          timeoutMs: request.timeoutMs,
        })
      );
    },
    async generateVision(request: AiVisionRequest): Promise<AiGenerateResponse> {
      if (request.images.length !== 1) {
        throw new AiError('AI_REQUEST_TOO_LARGE', 'Send exactly one photo per request.', false);
      }
      const image = request.images[0];
      const userContent = [
        { type: 'text', text: request.userText || 'Analyze this photo.' },
        {
          type: 'image_url',
          image_url: { url: `data:${image.mimeType};base64,${image.dataBase64}` },
        },
      ];
      return withRetry(() =>
        attempt({
          model: visionModel,
          systemPrompt: request.systemPrompt,
          userContent,
          maxOutputTokens: request.maxOutputTokens,
          timeoutMs: request.timeoutMs,
        })
      );
    },
  };
}
