// Habit math must be date-bounded: the heatmap divides completed days in the
// requested window by the window length — never all-time counts.
import { describe, expect, it } from 'vitest';
import { subDays } from 'date-fns';
import { buildDailyCompletionSeries, calculateCompletionRate, calculateStreak } from './habits';
import { toDateString } from '@/lib/utils';

function daysAgo(n: number): string {
  return toDateString(subDays(new Date(), n));
}

describe('calculateCompletionRate', () => {
  it('returns 100 when every day in the window is completed', () => {
    const dates = Array.from({ length: 7 }, (_, i) => daysAgo(i));
    expect(calculateCompletionRate(dates, 7)).toBe(100);
  });

  it('returns 0 for a habit with zero completions', () => {
    expect(calculateCompletionRate([], 7)).toBe(0);
    expect(calculateCompletionRate([], 30)).toBe(0);
  });

  it('ignores historical logs outside the requested window', () => {
    // 30 completions a year ago must not inflate a 7-day window.
    const old = Array.from({ length: 30 }, (_, i) => `2024-01-${String((i % 28) + 1).padStart(2, '0')}`);
    expect(calculateCompletionRate(old, 7)).toBe(0);
  });

  it('computes partial completion within the window', () => {
    const dates = [daysAgo(0), daysAgo(1), daysAgo(3)]; // 3 of 7
    expect(calculateCompletionRate(dates, 7)).toBe(43);
  });

  it('handles 30-day windows', () => {
    const dates = Array.from({ length: 15 }, (_, i) => daysAgo(i * 2)); // 15 of 30
    expect(calculateCompletionRate(dates, 30)).toBe(50);
  });

  it('returns 0 for non-positive windows', () => {
    expect(calculateCompletionRate([daysAgo(0)], 0)).toBe(0);
  });
});

describe('calculateStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(calculateStreak([daysAgo(0), daysAgo(1), daysAgo(2)])).toBe(3);
  });

  it('allows a streak ending yesterday', () => {
    expect(calculateStreak([daysAgo(1), daysAgo(2)])).toBe(2);
  });

  it('breaks on gaps and stale tails', () => {
    expect(calculateStreak([daysAgo(0), daysAgo(2)])).toBe(1);
    expect(calculateStreak([daysAgo(5)])).toBe(0);
    expect(calculateStreak([])).toBe(0);
  });

  it('crosses month boundaries without resetting', () => {
    // Walk back to the 1st of the current month, then one day further —
    // the run always spans a month boundary regardless of today's date.
    const today = new Date();
    const backToFirst = today.getDate() - 1;
    const dates = Array.from({ length: backToFirst + 2 }, (_, i) => daysAgo(i));
    expect(calculateStreak(dates)).toBe(backToFirst + 2);
  });

  it('crosses year boundaries without resetting', () => {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const backToJan1 = Math.round((today.getTime() - startOfYear.getTime()) / 86400000);
    const dates = Array.from({ length: backToJan1 + 2 }, (_, i) => daysAgo(i));
    expect(calculateStreak(dates)).toBe(backToJan1 + 2);
  });
});

describe('heatmap date boundaries (Phase 10 release-critical)', () => {
  it('counts a leap day inside its window (Feb 2024)', () => {
    const mar1 = new Date(2024, 2, 1);
    expect(calculateCompletionRate(['2024-02-28', '2024-02-29', '2024-03-01'], 3, mar1)).toBe(100);
    expect(calculateCompletionRate(['2024-02-29'], 3, mar1)).toBe(33);
  });

  it('spans month boundaries in fixed windows', () => {
    const mar2 = new Date(2024, 2, 2);
    // Window: Feb 28, 29 + Mar 1, 2 → 2 of 4 completed.
    expect(calculateCompletionRate(['2024-02-29', '2024-03-01'], 4, mar2)).toBe(50);
  });

  it('builds daily series with zeros for missing days and ignores uncompleted logs', () => {
    const days = ['2024-02-28', '2024-02-29', '2024-03-01'];
    const series = buildDailyCompletionSeries(
      [
        { date: '2024-02-28', completed: true },
        { date: '2024-02-28', completed: true },
        { date: '2024-02-29', completed: false },
      ],
      days
    );
    expect(series).toEqual([
      { date: '2024-02-28', completed: 2 },
      { date: '2024-02-29', completed: 0 },
      { date: '2024-03-01', completed: 0 },
    ]);
    expect(buildDailyCompletionSeries([], days).every((d) => d.completed === 0)).toBe(true);
  });
});
