// =============================================
// FuelUp - Habit calculations (single source of truth)
// Streak + completion-rate + heatmap helpers. Behavior preserved.
// =============================================
import { format, parseISO, startOfDay, subDays } from 'date-fns';

function toDateStringLocal(date: Date = new Date()): string {
  return format(startOfDay(date), 'yyyy-MM-dd');
}

export function calculateStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort().reverse();
  const today = toDateStringLocal();
  const yesterday = toDateStringLocal(subDays(new Date(), 1));
  if (sorted[0] !== today && sorted[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const expected = toDateStringLocal(subDays(parseISO(sorted[0]), i));
    if (sorted[i] === expected) streak++;
    else break;
  }
  return streak;
}

/**
 * Date-bounded completion rate: % of days completed within the trailing
 * `days` window ending today. Fixes the legacy store version which divided
 * all-time completions by an arbitrary window.
 */
export function calculateCompletionRate(completedDates: string[], days: number, today: Date = new Date()): number {
  if (days <= 0) return 0;
  const window = new Set<string>();
  for (let i = 0; i < days; i++) {
    window.add(toDateStringLocal(subDays(today, i)));
  }
  const completed = completedDates.filter((d) => window.has(d)).length;
  return Math.round((completed / days) * 100);
}

/** Daily completion count for heatmap / daily-score charts. */
export function buildDailyCompletionSeries(
  logs: { date: string; completed: boolean }[],
  days: string[]
): { date: string; completed: number }[] {
  const byDate = new Map<string, number>();
  for (const log of logs) {
    if (!log.completed) continue;
    byDate.set(log.date, (byDate.get(log.date) ?? 0) + 1);
  }
  return days.map((date) => ({ date, completed: byDate.get(date) ?? 0 }));
}
