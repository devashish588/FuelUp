import { z } from 'zod';
import { dateString } from './common';

export const habitSchema = z.object({
  name: z.string().trim().min(1).max(100),
  icon: z.string().max(64).optional().default('target'),
  color: z.string().max(32).optional().default('#f59e0b'),
  targetValue: z.number().int().min(1).max(1000000).optional().default(1),
  unit: z.string().max(32).optional().default('times'),
  frequency: z.enum(['daily', 'weekly']).optional().default('daily'),
});

export const habitUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  icon: z.string().max(64).optional(),
  color: z.string().max(32).optional(),
  targetValue: z.number().int().min(1).max(1000000).optional(),
  unit: z.string().max(32).optional(),
  frequency: z.enum(['daily', 'weekly']).optional(),
  isActive: z.boolean().optional(),
});

export const habitLogSchema = z.object({
  habitId: z.string().min(1),
  date: dateString,
  value: z.number().int().min(0).max(1000000),
  completed: z.boolean(),
});
