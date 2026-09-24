import { z } from 'zod';
import { quantityUnitSchema } from './food';

const finitePositive = z.number().finite().positive();
const idString = z.string().min(1).max(128);

export const recipeYieldUnitSchema = z.enum(['g', 'ml']);

export const recipeIngredientSchema = z.object({
  food_id: idString,
  quantity: finitePositive.max(1000000),
  quantity_unit: quantityUnitSchema,
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
  notes: z.string().max(500).optional().default(''),
});

export const recipeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(''),
  category: z.string().trim().max(64).optional().default(''),
  preparation: z.string().trim().max(100).optional().default(''),
  yield_quantity: finitePositive.max(1000000),
  yield_unit: recipeYieldUnitSchema,
  serving_quantity: z.number().finite().positive().max(1000000).nullable().optional(),
  serving_description: z.string().trim().max(200).optional().default(''),
  source: z.enum(['user', 'imported']).optional().default('user'),
  ingredients: z.array(recipeIngredientSchema).min(1).max(200),
});

export type RecipeInput = z.infer<typeof recipeSchema>;
export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;
