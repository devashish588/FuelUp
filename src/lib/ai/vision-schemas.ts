// =============================================
// FuelUp - AI vision contracts (Zod, client-safe except sniffing)
// Phase 9: meal photos and nutrition labels. Same trust rule as Phase 8:
// the model is untrusted — every field validated, unknown keys stripped,
// no prose salvage. Meal candidates reuse the text candidate shape plus
// visual hints; labels are EXTRACTION (user-verified data entry), never
// authoritative nutrition pushed anywhere automatically.
// =============================================
import { z } from 'zod';
import { aiParsedItemSchema } from './schemas';

/** Mobile-camera formats accepted end to end. */
export const AI_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AiImageMime = (typeof AI_IMAGE_MIMES)[number];

/**
 * Server-side base64 cap (~750 KB decoded). The client compresses to far
 * less (max 1280px edge, JPEG q0.82, ~≤500 KB); this cap is the abuse guard.
 */
export const AI_MAX_IMAGE_BASE64_CHARS = 1000000;

export const AI_VISION_TASKS = ['meal', 'nutrition_label'] as const;

export type AiVisionTask = (typeof AI_VISION_TASKS)[number];

export const aiImageSchema = z.object({
  mimeType: z.enum(AI_IMAGE_MIMES),
  dataBase64: z.string().min(1).max(AI_MAX_IMAGE_BASE64_CHARS),
});

export type AiImagePayload = z.infer<typeof aiImageSchema>;

export const aiVisionRequestSchema = z.object({
  task: z.enum(AI_VISION_TASKS),
  image: aiImageSchema,
  /** Optional user clarification ("homemade chicken curry"). Never ids. */
  text: z.string().trim().max(300).optional(),
});

export type AiVisionRequestPayload = z.infer<typeof aiVisionRequestSchema>;

/**
 * Sniff the image magic bytes from base64 (server-side MIME verification —
 * declared MIME alone is not trusted). Returns the detected MIME or null.
 */
export function sniffImageMime(dataBase64: string): AiImageMime | null {
  let head: Uint8Array;
  try {
    const binary = atob(dataBase64.slice(0, 32));
    head = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

// --- Meal vision output ---

export const AI_FOOD_STATES = [
  'raw',
  'cooked',
  'grilled',
  'boiled',
  'fried',
  'steamed',
  'baked',
  'roasted',
] as const;

export const aiMealItemSchema = aiParsedItemSchema.extend({
  /**
   * Rough visual size ("small bowl", "medium serving") when grams cannot be
   * judged. Display hint only — the UI still asks the user to confirm grams.
   */
  visualPortionHint: z.string().trim().max(40).nullable(),
  foodState: z.enum(AI_FOOD_STATES).nullable(),
});

export type AiMealItem = z.infer<typeof aiMealItemSchema>;

export const aiMealVisionResponseSchema = z.object({
  items: z.array(aiMealItemSchema).max(15),
  clarificationRequired: z.boolean(),
});

export type AiMealVisionResponse = z.infer<typeof aiMealVisionResponseSchema>;

// --- Nutrition label output (extraction, user-verified before save) ---

const nutrient = z.number().finite().min(0).max(100000).nullable();

export const aiLabelSchema = z.object({
  name: z.string().trim().max(100).nullable(),
  brand: z.string().trim().max(100).nullable(),
  servingQuantity: z.number().finite().min(0).max(100000).nullable(),
  servingUnit: z.enum(['g', 'ml', 'serving', 'count']).nullable(),
  calories: nutrient,
  protein: nutrient,
  carbs: nutrient,
  fat: nutrient,
  fiber: nutrient,
  sugar: nutrient,
  /** Milligrams, as printed on labels. */
  sodium: z.number().finite().min(0).max(1000000).nullable(),
});

export type AiLabelCandidate = z.infer<typeof aiLabelSchema>;

export const aiLabelVisionResponseSchema = z.object({
  label: aiLabelSchema,
  clarificationRequired: z.boolean(),
});

export type AiLabelVisionResponse = z.infer<typeof aiLabelVisionResponseSchema>;
