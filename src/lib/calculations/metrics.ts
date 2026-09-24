// =============================================
// FuelUp - Body-metric calculations (single source of truth)
// Previously duplicated: utils.calculateBMI (Math.round) vs
// recommendation-engine.calculateBMI (toFixed). Both compute the same
// value to 1 decimal; this module is now canonical.
//
// Phase 7 adds the ONE canonical weight-trend calculation (no competing
// trend functions): a 7-day rolling median. Median-based so a single
// anomalous weigh-in cannot move the trend; gaps stay gaps (never
// fabricated); works with irregular measurement days.
// =============================================
import { differenceInCalendarDays, parseISO } from 'date-fns';

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  if (!heightM || heightM <= 0) return 0;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function getBMICategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: '#3b82f6' };
  if (bmi < 25) return { label: 'Normal', color: '#10b981' };
  if (bmi < 30) return { label: 'Overweight', color: '#f59e0b' };
  return { label: 'Obese', color: '#ef4444' };
}

// --- Phase 7: weight trend (7-day rolling median) ---

/** Half-window (days) either side of a day used for smoothing. */
export const TREND_HALF_WINDOW_DAYS = 3;

export interface WeightObservation {
  date: string;
  weight_kg: number;
}

export interface WeightTrendPoint {
  date: string;
  /** Smoothed weight (median of observations within ±3 days). */
  weight_kg: number;
}

export interface WeightTrend {
  /** Smoothed series (days with no observations in range are omitted). */
  points: WeightTrendPoint[];
  trendStart: WeightTrendPoint | null;
  trendEnd: WeightTrendPoint | null;
  /** kg per day: (end − start) / calendar days between. 0 when < 2 points. */
  rateKgPerDay: number;
  /** Distinct calendar days with at least one observation. */
  observationsUsed: number;
  /** Calendar days between first and last smoothed point (0 when < 2). */
  spanDays: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Collapse same-day weigh-ins to one representative value (median).
 * Repository rule is one row per day (latest write wins); this keeps the
 * pure function deterministic for arbitrary input. Sorted by date.
 */
export function collapseDailyWeights(observations: WeightObservation[]): { date: string; weight_kg: number }[] {
  const byDate = new Map<string, number[]>();
  for (const o of observations) {
    if (!o || typeof o.weight_kg !== 'number' || !Number.isFinite(o.weight_kg)) continue;
    if (typeof o.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    const list = byDate.get(o.date) ?? [];
    list.push(o.weight_kg);
    byDate.set(o.date, list);
  }
  return [...byDate.entries()]
    .map(([date, weights]) => ({ date, weight_kg: median(weights) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Canonical weight trend. Input: collapsed daily weights (any order; sorted
 * defensively). Output: smoothed series + rate. Pure and deterministic —
 * same input always yields the same output.
 */
export function calculateWeightTrend(dailyWeights: WeightObservation[]): WeightTrend {
  const daily = collapseDailyWeights(dailyWeights);
  const points: WeightTrendPoint[] = [];
  for (const day of daily) {
    const window = daily.filter(
      (o) => Math.abs(differenceInCalendarDays(parseISO(o.date), parseISO(day.date))) <= TREND_HALF_WINDOW_DAYS
    );
    if (window.length === 0) continue;
    points.push({ date: day.date, weight_kg: median(window.map((o) => o.weight_kg)) });
  }
  const trendStart = points[0] ?? null;
  const trendEnd = points[points.length - 1] ?? null;
  let rateKgPerDay = 0;
  let spanDays = 0;
  if (trendStart && trendEnd && trendEnd.date !== trendStart.date) {
    spanDays = differenceInCalendarDays(parseISO(trendEnd.date), parseISO(trendStart.date));
    if (spanDays > 0) rateKgPerDay = (trendEnd.weight_kg - trendStart.weight_kg) / spanDays;
  }
  return {
    points,
    trendStart,
    trendEnd,
    rateKgPerDay,
    observationsUsed: daily.length,
    spanDays,
  };
}
