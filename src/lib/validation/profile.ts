import { z } from 'zod';
import { activityLevelSchema, genderSchema, goalSchema } from './common';

export const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  date_of_birth: z.string().min(1),
  gender: genderSchema,
  activity_level: activityLevelSchema,
  goal: goalSchema,
  unit_system: z.enum(['metric', 'imperial']),
  daily_calorie_target: z.number().int().min(800).max(15000),
  protein_target_g: z.number().int().min(0).max(1000),
  carbs_target_g: z.number().int().min(0).max(2000),
  fat_target_g: z.number().int().min(0).max(1000),
  // Phase 7: explicit weekly target rate (null = goal default); target provenance.
  target_rate_kg_per_week: z.number().finite().min(0).max(1.5).nullable().optional().default(null),
  target_source: z.enum(['initial', 'adaptive', 'manual']).optional().default('initial'),
});

export const profileUpdateSchema = profileSchema.partial();

export type ProfileInput = z.infer<typeof profileSchema>;
