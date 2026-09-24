import { z } from 'zod';
import { dateString, mealTypeSchema, positiveNumber } from './common';

const finiteNonNegative = z.number().finite().nonnegative();
const optNutrient = finiteNonNegative.max(100000).nullable().optional();

export const quantityUnitSchema = z.enum(['g', 'kg', 'ml', 'L', 'count', 'serving']);

export const foodSourceSchema = z.enum([
  'builtin',
  'verified',
  'branded',
  'user',
  'recipe',
  'imported',
  'estimated',
]);

export const foodStateSchema = z.enum(['raw', 'cooked', 'prepared', '']);

export const foodItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: z.string().max(200).optional().default(''),
  serving_size: positiveNumber.max(100000).optional().default(1),
  serving_unit: z.string().max(32).optional().default('serving'),
  calories_per_serving: finiteNonNegative.max(100000),
  protein_g: finiteNonNegative.max(100000).optional().default(0),
  carbs_g: finiteNonNegative.max(100000).optional().default(0),
  fat_g: finiteNonNegative.max(100000).optional().default(0),
  fiber_g: finiteNonNegative.max(100000).optional().default(0),
  barcode: z.string().max(64).nullable().optional(),
  // --- Phase 5: quantity-first model, provenance, classification ---
  category: z.string().trim().max(64).optional().default(''),
  source: foodSourceSchema.optional().default('user'),
  source_id: z.string().max(128).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).optional().default([]),
  count_weight_g: finiteNonNegative.max(100000).nullable().optional(),
  food_state: foodStateSchema.optional().default(''),
  preparation: z.string().trim().max(100).optional().default(''),
  serving_description: z.string().trim().max(200).optional().default(''),
  sugar_g: optNutrient,
  sodium_mg: finiteNonNegative.max(1000000).nullable().optional(),
  is_estimated: z.boolean().optional().default(false),
});

export const foodLogSchema = z.object({
  foodItemId: z.string().min(1),
  date: dateString,
  mealType: mealTypeSchema,
  servings: finiteNonNegative.max(1000),
  calories: finiteNonNegative.max(100000),
  proteinG: finiteNonNegative.max(100000).optional().default(0),
  carbsG: finiteNonNegative.max(100000).optional().default(0),
  fatG: finiteNonNegative.max(100000).optional().default(0),
  notes: z.string().max(1000).optional(),
  // --- Phase 5: quantity-first input + snapshot ---
  quantity: finiteNonNegative.max(1000000).optional(),
  quantityUnit: quantityUnitSchema.optional(),
  fiberG: optNutrient,
  sugarG: optNutrient,
  sodiumMg: finiteNonNegative.max(1000000).nullable().optional(),
  foodName: z.string().trim().max(200).optional(),
  isEstimated: z.boolean().optional(),
});

export const foodSearchQuerySchema = z.object({
  search: z.string().trim().min(1).max(200),
});

export const favoriteFoodSchema = z.object({
  foodId: z.string().min(1).max(128),
});
