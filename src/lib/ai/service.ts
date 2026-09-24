// =============================================
// FuelUp - AI food-parsing service (server-only)
// Orchestrates: config → provider → strict JSON → Zod validation →
// normalized candidates. Returns food identity + quantity + unit + hints
// ONLY. Calories/macros from the model are stripped by the schema and can
// never become nutrition truth. Phase 7 EnergyState is never consulted or
// sent (future Coach contract, untouched).
// =============================================
import { logger } from '@/lib/logger/logger';
import { generateId } from '@/lib/utils';
import { getAiConfig, type AiConfig } from './config';
import { getAiProvider } from './providers';
import {
  AI_MAX_ITEMS,
  aiFoodParseResponseSchema,
  type AiParsedItem,
  type AiUnit,
} from './schemas';
import { AiError, type AiProvider, type FetchFn } from './types';

export interface ParsedFoodCandidate {
  name: string;
  quantity: number | null;
  unit: AiUnit | null;
  mealHint: 'breakfast' | 'lunch' | 'dinner' | 'snack' | null;
  preparationHint: string | null;
}

export interface FoodParseMeta {
  requestId: string;
  provider: string;
  model: string;
  latencyMs: number;
  itemCount: number;
}

export interface FoodParseResult {
  items: ParsedFoodCandidate[];
  clarificationRequired: boolean;
  meta: FoodParseMeta;
}

export interface ParseFoodTextDeps {
  config?: AiConfig;
  provider?: AiProvider;
  fetchFn?: FetchFn;
}

const SYSTEM_PROMPT = [
  'You parse a meal description into structured food candidates.',
  'Return JSON ONLY with this exact shape:',
  '{"items":[{"name":string,"quantity":number|null,"unit":string|null,"mealHint":string|null,"preparationHint":string|null}],"clarificationRequired":boolean}',
  'Rules:',
  '- name: the food as written, lowercased, no brand unless stated.',
  '- quantity: numeric amount or null when the user gave none. NEVER invent a quantity.',
  '- unit: one of g, kg, ml, L, count, serving, glass, bowl, cup, piece, slice, tbsp, tsp, or null. Map "eggs" to count, "glass of milk" to glass, "bowl of dal" to bowl.',
  '- mealHint: breakfast, lunch, dinner, snack, or null (only when the text states it).',
  '- preparationHint: e.g. cooked, raw, fried, boiled, grilled, curry, or null.',
  '- clarificationRequired: true when the text is not food at all or is too vague to parse.',
  '- NEVER return calories, protein, carbs, fat, or confidence scores.',
  `- At most ${AI_MAX_ITEMS} items; split obvious multiples into separate items.`,
].join('\n');

/** In-process usage counters (no prompts, no personal data). Per-process
 *  memory only — adequate as dev cost protection on the $0 stack. */
const stats = { requests: 0, failures: 0, totalLatencyMs: 0, errorsByCode: {} as Record<string, number> };

export function getAiServiceStats() {
  return {
    requests: stats.requests,
    failures: stats.failures,
    averageLatencyMs: stats.requests > 0 ? Math.round(stats.totalLatencyMs / stats.requests) : 0,
    errorsByCode: { ...stats.errorsByCode },
  };
}

export function resetAiServiceStats() {
  stats.requests = 0;
  stats.failures = 0;
  stats.totalLatencyMs = 0;
  stats.errorsByCode = {};
}

function recordOutcome(latencyMs: number, errorCode?: string) {
  stats.requests += 1;
  stats.totalLatencyMs += latencyMs;
  if (errorCode) {
    stats.failures += 1;
    stats.errorsByCode[errorCode] = (stats.errorsByCode[errorCode] ?? 0) + 1;
  }
}

export async function parseFoodText(text: string, deps: ParseFoodTextDeps = {}): Promise<FoodParseResult> {
  const started = Date.now();
  const requestId = generateId();
  const config = deps.config ?? getAiConfig();
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > config.maxTextChars) {
    throw new AiError('AI_REQUEST_TOO_LARGE', 'That description is too long. Try a shorter one.', false);
  }
  const provider = deps.provider ?? getAiProvider(config, deps.fetchFn);
  try {
    const response = await provider.generateText({
      systemPrompt: SYSTEM_PROMPT,
      userText: trimmed,
      maxOutputTokens: 800,
      timeoutMs: config.timeoutMs,
    });
    let raw: unknown;
    try {
      raw = JSON.parse(response.text) as unknown;
    } catch {
      throw new AiError('AI_INVALID_OUTPUT', 'The meal could not be understood.', false);
    }
    const parsed = aiFoodParseResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AiError('AI_INVALID_OUTPUT', 'The meal could not be understood.', false);
    }
    const items: ParsedFoodCandidate[] = parsed.data.items.map((item: AiParsedItem) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      mealHint: item.mealHint,
      preparationHint: item.preparationHint,
    }));
    const result: FoodParseResult = {
      items,
      clarificationRequired: parsed.data.clarificationRequired,
      meta: {
        requestId,
        provider: provider.name,
        model: response.model,
        latencyMs: response.latencyMs,
        itemCount: items.length,
      },
    };
    recordOutcome(Date.now() - started);
    // Audit log: technical metadata only — never the raw prompt, never secrets.
    logger.info('AI food parse', {
      requestId,
      provider: provider.name,
      model: response.model,
      latencyMs: response.latencyMs,
      itemCount: items.length,
      success: true,
    });
    return result;
  } catch (error) {
    const code = error instanceof AiError ? error.code : 'AI_UNAVAILABLE';
    recordOutcome(Date.now() - started, code);
    logger.info('AI food parse', {
      requestId,
      provider: provider.name,
      itemCount: 0,
      success: false,
      errorCode: code,
    });
    if (error instanceof AiError) throw error;
    throw new AiError('AI_UNAVAILABLE', 'AI food logging is unavailable right now.', false);
  }
}
