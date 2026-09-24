import { z } from 'zod';
import { dateString } from './common';

export const workoutSchema = z.object({
  name: z.string().trim().min(1).max(200),
  date: dateString,
  notes: z.string().max(2000).optional(),
});

export const exerciseSetSchema = z.object({
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0).nullable().optional(),
  weightKg: z.number().nonnegative().nullable().optional(),
  durationSeconds: z.number().int().min(0).nullable().optional(),
  distanceMeters: z.number().nonnegative().nullable().optional(),
  isWarmup: z.boolean().optional().default(false),
});
