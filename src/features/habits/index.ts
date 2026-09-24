// Habits domain boundary: habits, habit logs, streaks, heatmap data.
// The monthly heatmap + daily graph + completion stats are owned here.
export * from '@/lib/calculations/habits';
export type { Habit, HabitLog } from '@/lib/types';
