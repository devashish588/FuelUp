// =============================================
// FuelUp - Provider factory (server-only)
// Business logic asks for a provider by config; vendor selection never
// leaks into the Food domain. Unknown providers and missing keys fail as
// AI_CONFIGURATION_ERROR (user-safe, never a secret in the message).
// =============================================
import type { AiConfig } from '../config';
import { AiError, type AiProvider, type FetchFn } from '../types';
import { createOpenAiCompatibleProvider } from './openai-compatible';

export function getAiProvider(config: AiConfig, fetchFn?: FetchFn): AiProvider {
  if (config.provider === 'openai-compatible') {
    if (!config.apiKey) {
      throw new AiError('AI_CONFIGURATION_ERROR', 'AI provider is not configured.', false);
    }
    return createOpenAiCompatibleProvider({
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      model: config.model,
      visionModel: config.visionModel,
      fetchFn,
    });
  }
  throw new AiError('AI_CONFIGURATION_ERROR', 'AI provider is not configured.', false);
}

/**
 * Provider-level vision capability (Phase 9). The service AND-combines
 * this with config.visionEnabled and the provider instance flag — no
 * model-name heuristics, no UI hardcoding.
 */
export function isVisionCapableProvider(providerName: string): boolean {
  return providerName === 'openai-compatible';
}
