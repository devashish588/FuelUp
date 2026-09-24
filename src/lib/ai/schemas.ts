// =============================================
// FuelUp - AI food-parsing contracts (Zod, client-safe)
// The model is an untrusted external system: every field is validated.
// Unknown keys (calories, confidence, ...) are STRIPPED — the AI can never
// inject nutrition truth or arbitrary scores into the domain.
// =============================================
import { z } from 'zod';

/** Client request: only the food description text. Nothing else. */
export const aiFoodParseRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export type AiFoodParseRequest = z.infer<typeof aiFoodParseRequestSchema>;

/** Units the parser may emit. The first six are engine units; the rest are
 *  household measures the resolver maps to serving definitions or asks about. */
export const AI_UNIT_VALUES = [
  'g',
  'kg',
  'ml',
  'L',
  'count',
  'serving',
  'glass',
  'bowl',
  'cup',
  'piece',
  'slice',
  'tbsp',
  'tsp',
] as const;

export type AiUnit = (typeof AI_UNIT_VALUES)[number];

/** Engine-native units (Phase 5 QuantityUnit subset the AI may use directly). */
export const AI_ENGINE_UNITS: readonly string[] = ['g', 'kg', 'ml', 'L', 'count', 'serving'];

/** Household measures: never stored blindly, always mapped or asked. */
export const AI_HOUSEHOLD_UNITS: readonly string[] = ['glass', 'bowl', 'cup', 'piece', 'slice', 'tbsp', 'tsp'];

export const aiParsedItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Null when the user gave no quantity — never invented by the model. */
  quantity: z.number().finite().min(0).max(1000000).nullable(),
  unit: z.enum(AI_UNIT_VALUES).nullable(),
  mealHint: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).nullable(),
  preparationHint: z.string().trim().max(30).nullable(),
});

export type AiParsedItem = z.infer<typeof aiParsedItemSchema>;

export const aiFoodParseResponseSchema = z.object({
  items: z.array(aiParsedItemSchema).max(15),
  clarificationRequired: z.boolean(),
});

export type AiFoodParseResponse = z.infer<typeof aiFoodParseResponseSchema>;

/** Hard cap on items per request (abuse/giant-prompt guard, documented). */
export const AI_MAX_ITEMS = 15;
