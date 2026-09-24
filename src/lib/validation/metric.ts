import { z } from 'zod';
import { dateString, positiveNumber } from './common';

export const bodyMetricSchema = z.object({
  date: dateString,
  weightKg: positiveNumber,
  heightCm: positiveNumber.optional(),
  bmi: positiveNumber.optional(),
  bodyFatPercentage: z.number().min(0).max(100).nullable().optional(),
  waistCm: positiveNumber.nullable().optional(),
  chestCm: positiveNumber.nullable().optional(),
  armsCm: positiveNumber.nullable().optional(),
  thighsCm: positiveNumber.nullable().optional(),
  notes: z.string().max(1000).optional(),
});
