// =============================================
// FuelUp - Shared validation primitives (Zod v4)
// =============================================
import { z } from 'zod';

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date as YYYY-MM-DD');

export const isoDateTime = z.string().datetime({ offset: true }).or(z.string().min(1));

export const positiveNumber = z.number().finite().nonnegative();

export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

export const activityLevelSchema = z.enum([
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extremely_active',
]);

export const goalSchema = z.enum(['cut', 'bulk', 'recomp', 'maintain', 'custom']);

export const genderSchema = z.enum(['male', 'female', 'other']);
