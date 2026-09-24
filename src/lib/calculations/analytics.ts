// =============================================
// FuelUp - Analytics calculations
// Pure transforms over domain data. Consumes domain records, never stores.
// Charts/heatmap data-shaping lives here in later phases.
//
// Phase 7: deriveEnergyState combines raw facts (food logs, weight
// measurements, profile, target history) into the structured adaptive
// energy result for UI. Pure + deterministic: same inputs → same output,
// so every device derives the same estimate from the same synced facts.
// Retroactive logs/weights are picked up automatically on recompute; the
// window bound (28 days) keeps dashboard renders cheap.
// =============================================
import { addDays, parseISO, subDays } from 'date-fns';
import { calculateDailyNutrition } from './nutrition';
import {
  ENERGY_WINDOW_DAYS,
  MIN_INTAKE_KCAL_PER_DAY,
  assessDataQuality,
  assessEnergyConfidence,
  calculateAdaptiveTarget,
  calculateObservedMaintenance,
  clampWeeklyStep,
  explainTargetChange,
  passesMinimumDataGate,
  resolveTargetRate,
  type AdaptiveTarget,
  type DataQuality,
  type EnergyConfidenceResult,
  type ObservedMaintenance,
  type TargetChangeExplanation,
} from './energy';
import { calculateWeightTrend, type WeightTrend } from './metrics';
import { toDateString } from '@/lib/utils';
import type { BodyMetric, FoodLog, Profile, TargetHistory } from '@/lib/types';

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function weeklyAverage(dailyTotals: number[]): number {
  return Math.round(average(dailyTotals));
}

export function adherenceRate(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.round((completed / total) * 100), 100);
}

// --- Phase 7: adaptive energy derivation ---

const ZERO_TARGETS = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

/** Days from `changeDate` (YYYY-MM-DD) to `today` (whole calendar days). */
export function daysSince(changeDate: string, today: string): number {
  const days = Math.round(
    (parseISO(today).getTime() - parseISO(changeDate).getTime()) / (24 * 60 * 60 * 1000)
  );
  return Number.isFinite(days) ? Math.max(days, 0) : 0;
}

export interface TargetProjectionPoint {
  date: string;
  weight_kg: number;
}

/**
 * Goal-direction illustration for the weight chart (NOT a prediction):
 * extends the smoothed trend endpoint at the user's weekly target rate for
 * `days` forward. Only cut (down) and bulk (up) project; maintenance-style
 * goals return [] — the trend line itself is the reference.
 */
export function projectTargetTrend(
  trendEnd: { date: string; weight_kg: number },
  goal: Profile['goal'],
  rateKgPerWeek: number,
  days = 14
): TargetProjectionPoint[] {
  const sign = goal === 'cut' ? -1 : goal === 'bulk' ? 1 : 0;
  if (sign === 0 || !(rateKgPerWeek > 0)) return [];
  const points: TargetProjectionPoint[] = [];
  for (let i = 1; i <= days; i++) {
    points.push({
      date: toDateString(addDays(parseISO(trendEnd.date), i)),
      weight_kg: Math.round((trendEnd.weight_kg + (sign * rateKgPerWeek * i) / 7) * 10) / 10,
    });
  }
  return points;
}

export interface EnergyDerivationInput {
  profile: Profile;
  foodLogs: FoodLog[];
  metrics: BodyMetric[];
  history: TargetHistory[];
  /** Local calendar day (YYYY-MM-DD). Defaults to today. */
  today?: string;
}

export interface EnergyState {
  mode: 'initial' | 'adaptive';
  today: string;
  windowStart: string;
  windowEnd: string;
  validNutritionDays: number;
  averageIntakeKcal: number;
  weightObservations: number;
  trend: WeightTrend;
  maintenance: ObservedMaintenance | null;
  quality: DataQuality;
  confidence: EnergyConfidenceResult;
  goal: Profile['goal'];
  rateKgPerWeek: number;
  /** Raw goal-based target from observed maintenance (adaptive mode only). */
  adaptiveTarget: AdaptiveTarget | null;
  /** Guardrail-stepped proposal vs the current profile target (when due). */
  steppedTarget: number | null;
  /** True when an update can be applied now (weekly cadence, not manual). */
  updateDue: boolean;
  lastChange: TargetHistory | null;
  explanation: TargetChangeExplanation;
}

/**
 * Derive the full adaptive energy picture from raw facts. Historical food
 * logs are NEVER modified — only the target interpretation changes.
 * Days with no meaningful nutrition data (< 200 kcal) are excluded from
 * the intake average; weight gaps stay gaps in the trend.
 */
export function deriveEnergyState(input: EnergyDerivationInput): EnergyState {
  const { profile, foodLogs, metrics, history } = input;
  const today = input.today ?? toDateString();
  const todayDate = parseISO(today);
  const windowDays: string[] = [];
  for (let i = ENERGY_WINDOW_DAYS - 1; i >= 0; i--) {
    windowDays.push(toDateString(subDays(todayDate, i)));
  }
  const windowStart = windowDays[0];
  const windowEnd = windowDays[windowDays.length - 1];

  // Daily intake from the canonical rollup (authoritative totals only).
  const dailyIntakes = windowDays.map((day) => ({
    day,
    kcal: calculateDailyNutrition(foodLogs, day, ZERO_TARGETS).calories,
  }));
  const validDays = dailyIntakes.filter((d) => d.kcal >= MIN_INTAKE_KCAL_PER_DAY);
  const averageIntakeKcal = validDays.length > 0 ? average(validDays.map((d) => d.kcal)) : 0;

  // Weight trend over the window (local calendar days, no UTC shifting).
  const windowWeights = metrics.filter((m) => m.date >= windowStart && m.date <= windowEnd);
  const trend = calculateWeightTrend(windowWeights);

  const quality = assessDataQuality({
    validNutritionDays: validDays.length,
    weightObservations: trend.observationsUsed,
    trendSpanDays: trend.spanDays,
    windowDays: ENERGY_WINDOW_DAYS,
  });
  const confidence = assessEnergyConfidence(quality);
  const gated = passesMinimumDataGate({
    validNutritionDays: validDays.length,
    weightObservations: trend.observationsUsed,
    trendSpanDays: trend.spanDays,
  });

  const sortedHistory = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const lastChange = sortedHistory[0] ?? null;
  const rateKgPerWeek = resolveTargetRate(profile.goal, profile.target_rate_kg_per_week);

  if (!gated) {
    return {
      mode: 'initial',
      today,
      windowStart,
      windowEnd,
      validNutritionDays: validDays.length,
      averageIntakeKcal: Math.round(averageIntakeKcal),
      weightObservations: trend.observationsUsed,
      trend,
      maintenance: null,
      quality,
      confidence,
      goal: profile.goal,
      rateKgPerWeek,
      adaptiveTarget: null,
      steppedTarget: null,
      updateDue: false,
      lastChange,
      explanation: {
        reasons: [
          `Using your starting estimate — needs ${Math.max(0, 10 - validDays.length)} more logged nutrition days, ` +
            `${Math.max(0, 5 - trend.observationsUsed)} more weigh-ins, ` +
            `and trend coverage of ${Math.max(0, 14 - trend.spanDays)} more days.`,
        ],
        activated: false,
      },
    };
  }

  const maintenance = calculateObservedMaintenance({
    averageIntakeKcal,
    rateKgPerDay: trend.rateKgPerDay,
    windowStart,
    windowEnd,
    validNutritionDays: validDays.length,
    weightObservations: trend.observationsUsed,
    trendSpanDays: trend.spanDays,
  });
  const adaptiveTarget = calculateAdaptiveTarget(maintenance.estimate, profile.goal, profile.target_rate_kg_per_week);

  const alreadyCurrent = adaptiveTarget.target === profile.daily_calorie_target;
  const cadenceOk = !lastChange || daysSince(lastChange.date, today) >= 7;
  const updateDue =
    profile.target_source !== 'manual' && !alreadyCurrent && cadenceOk;
  const steppedTarget = updateDue ? clampWeeklyStep(profile.daily_calorie_target, adaptiveTarget.target) : null;

  const prevAdaptive = sortedHistory.find((h) => h.maintenance_estimate !== null) ?? null;
  const prevIntake = prevAdaptive?.avg_intake_kcal ?? null;
  const explanation = explainTargetChange({
    previousTarget: lastChange ? lastChange.new_target : null,
    newTarget: steppedTarget ?? profile.daily_calorie_target,
    previousMaintenance: prevAdaptive ? prevAdaptive.maintenance_estimate : null,
    maintenance: maintenance.estimate,
    previousAvgIntake: prevIntake,
    avgIntake: maintenance.averageIntakeKcal,
    goalChanged: lastChange ? lastChange.goal !== profile.goal : false,
    rateChanged: false,
    activated: updateDue && sortedHistory.length === 0,
  });

  return {
    mode: 'adaptive',
    today,
    windowStart,
    windowEnd,
    validNutritionDays: validDays.length,
    averageIntakeKcal: Math.round(averageIntakeKcal),
    weightObservations: trend.observationsUsed,
    trend,
    maintenance,
    quality,
    confidence,
    goal: profile.goal,
    rateKgPerWeek,
    adaptiveTarget,
    steppedTarget,
    updateDue,
    lastChange,
    explanation,
  };
}
