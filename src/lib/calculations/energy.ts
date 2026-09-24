// =============================================
// FuelUp - Energy calculations (single source of truth)
// Mifflin-St Jeor BMR + activity multipliers + goal adjustments.
// Formulas preserved from recommendation-engine (Phase 1: no new formulas).
//
// Phase 7 adds the adaptive layer (deterministic, no AI):
// initial estimate (profile + activity assumptions) vs observed maintenance
// (real intake + weight trend) vs goal-based target. Uncertainty is always
// visible: estimates carry bounds, quality, and confidence — never a bare
// number presented as exact metabolism.
// =============================================
import { ACTIVITY_MULTIPLIERS } from '@/lib/constants';
import type { ActivityLevel, GoalType } from '@/lib/types';

export interface EnergyInput {
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: 'male' | 'female' | 'other';
  activity_level: ActivityLevel;
}

export function calculateBMR(input: EnergyInput): number {
  const { weight_kg, height_cm, age, gender } = input;
  if (gender === 'male') return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;
  // 'female' and 'other' use the female offset (preserved behavior)
  return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
}

export function calculateTDEE(input: EnergyInput): number {
  return Math.round(calculateBMR(input) * ACTIVITY_MULTIPLIERS[input.activity_level]);
}

// Canonical goal union lives in @/lib/types (extended in Phase 7 with
// maintain + custom). Re-exported here so energy stays the single import
// point for goal-aware calculations.
export type { GoalType };

export function resolveGoalAdjustment(input: {
  gender: 'male' | 'female' | 'other';
  body_fat_percentage: number | null;
  bmi: number;
}): { goal: GoalType; reason: string; calorieAdjustment: number } {
  const { gender, body_fat_percentage: bf, bmi } = input;
  if (bf !== null) {
    if (gender === 'male') {
      if (bf > 20)
        return {
          goal: 'cut',
          reason: `Body fat (${bf}%) above optimal male range (10-18%). Cut to reduce fat while preserving muscle.`,
          calorieAdjustment: -500,
        };
      if (bf < 12)
        return {
          goal: 'bulk',
          reason: `Body fat (${bf}%) is low. Lean bulk to add muscle.`,
          calorieAdjustment: 300,
        };
      return {
        goal: 'recomp',
        reason: `Body fat (${bf}%) in good range. Recomp to build muscle while maintaining.`,
        calorieAdjustment: 0,
      };
    }
    if (bf > 28)
      return {
        goal: 'cut',
        reason: `Body fat (${bf}%) above optimal female range (18-25%). Cut to lean out.`,
        calorieAdjustment: -400,
      };
    if (bf < 18)
      return {
        goal: 'bulk',
        reason: `Body fat (${bf}%) is low. Lean bulk for health and growth.`,
        calorieAdjustment: 250,
      };
    return {
      goal: 'recomp',
      reason: `Body fat (${bf}%) in healthy range. Recomp to optimize physique.`,
      calorieAdjustment: 0,
    };
  }
  if (bmi > 27)
    return {
      goal: 'cut',
      reason: `BMI (${bmi}) suggests cutting for health improvement.`,
      calorieAdjustment: -500,
    };
  if (bmi < 20)
    return {
      goal: 'bulk',
      reason: `BMI (${bmi}) suggests lean bulking to gain healthy weight.`,
      calorieAdjustment: 350,
    };
  return {
    goal: 'recomp',
    reason: `BMI (${bmi}) in good range. Recomp to improve composition.`,
    calorieAdjustment: 0,
  };
}

// =============================================
// Phase 7: adaptive energy engine (deterministic, no AI)
// =============================================

/** Rolling window (local calendar days) the engine learns from. */
export const ENERGY_WINDOW_DAYS = 28;
/** Minimum valid nutrition days before the engine adapts (conservative:
 *  ~1/3 of the window, enough for a stable intake average). */
export const MIN_VALID_NUTRITION_DAYS = 10;
/** Minimum distinct weight-observation days (≈ weekly weighing or better). */
export const MIN_WEIGHT_OBSERVATIONS = 5;
/** Minimum trend coverage in days (covers water-weight noise cycles). */
export const MIN_TREND_SPAN_DAYS = 14;
/** A day counts as a nutrition observation only at/above this intake —
 *  excludes placeholder / near-empty logging days. */
export const MIN_INTAKE_KCAL_PER_DAY = 200;
/** Maximum target move per weekly adaptation (small-adjustment guardrail). */
export const MAX_WEEKLY_TARGET_STEP_KCAL = 150;
/** Maximum goal-driven deficit/surplus (guardrail, not medical advice). */
export const MAX_GOAL_ADJUSTMENT_KCAL = 750;
/** Targets never drop below this (matches the onboarding floor). */
export const MIN_TARGET_KCAL = 1200;
/** Bounds on an editable weekly target rate (kg/week magnitude). */
export const MAX_TARGET_RATE_KG_PER_WEEK = 1.5;
/** Default weekly rate magnitudes per goal (editable in settings). */
export const DEFAULT_TARGET_RATES: Record<GoalType, number> = {
  cut: 0.5,
  bulk: 0.25,
  recomp: 0,
  maintain: 0,
  custom: 0,
};

/**
 * Documented approximation: kcal of cumulative energy imbalance associated
 * with ~1 kg of body-mass change. Real tissue change varies (water,
 * glycogen, lean vs fat mass, individual factors) — this is an estimate
 * input isolated here, never presented as exact metabolism. UI must say
 * "estimated maintenance / based on logged data".
 */
export const KCAL_PER_KG_EQUIVALENT = 7700;

const round10 = (v: number) => Math.round(v / 10) * 10;

// --- Observed maintenance ---

export interface ObservedMaintenanceInput {
  averageIntakeKcal: number;
  rateKgPerDay: number;
  windowStart: string;
  windowEnd: string;
  validNutritionDays: number;
  weightObservations: number;
  trendSpanDays: number;
}

export interface ObservedMaintenance {
  /** Estimated maintenance (kcal/day, whole kcal). */
  estimate: number;
  /** Uncertainty bounds (kcal/day, rounded to 10). */
  minimum: number;
  maximum: number;
  averageIntakeKcal: number;
  rateKgPerDay: number;
  rateKgPerWeek: number;
  windowStart: string;
  windowEnd: string;
  validNutritionDays: number;
  weightObservations: number;
  trendSpanDays: number;
}

/**
 * Observed energy balance → estimated expenditure:
 * maintenance ≈ average intake − (trend rate × energy equivalent).
 * Gaining weight at the same intake implies expenditure below intake;
 * losing implies expenditure above intake. Bounds widen with the rate
 * component (fast movers are noisier) with a ±100 kcal floor.
 */
export function calculateObservedMaintenance(input: ObservedMaintenanceInput): ObservedMaintenance {
  const { averageIntakeKcal, rateKgPerDay } = input;
  const estimate = Math.round(averageIntakeKcal - rateKgPerDay * KCAL_PER_KG_EQUIVALENT);
  const halfBand = round10(Math.max(100, Math.abs(rateKgPerDay * KCAL_PER_KG_EQUIVALENT) * 0.15));
  return {
    estimate,
    minimum: estimate - halfBand,
    maximum: estimate + halfBand,
    averageIntakeKcal: Math.round(averageIntakeKcal),
    rateKgPerDay,
    rateKgPerWeek: rateKgPerDay * 7,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    validNutritionDays: input.validNutritionDays,
    weightObservations: input.weightObservations,
    trendSpanDays: input.trendSpanDays,
  };
}

// --- Goal-based adaptive target ---

/**
 * Resolve the effective weekly rate magnitude: explicit user value wins,
 * otherwise the goal default. Clamped to [0, MAX] — deterministic.
 */
export function resolveTargetRate(goal: GoalType, storedRate: number | null): number {
  const raw = storedRate ?? DEFAULT_TARGET_RATES[goal] ?? 0;
  if (!Number.isFinite(raw)) return DEFAULT_TARGET_RATES[goal] ?? 0;
  return Math.min(Math.max(raw, 0), MAX_TARGET_RATE_KG_PER_WEEK);
}

export interface AdaptiveTarget {
  target: number;
  /** Signed goal adjustment applied to maintenance (kcal/day, rounded to 10). */
  adjustmentKcal: number;
  rateKgPerWeek: number;
  maintenance: number;
  goal: GoalType;
  /** True when the 1200 kcal floor lifted the target. */
  floorHit: boolean;
}

/**
 * Observed maintenance → goal adjustment → target.
 * cut: deficit from rate (−rate·K/7); bulk: surplus (+rate·K/7);
 * maintain/recomp/custom: maintenance-oriented (adjustment 0 — recomp and
 * custom never apply a directed deficit/surplus; custom users edit the
 * target directly). Adjustment capped at ±750; target floored at 1200.
 * Documented, deterministic — no medical recommendation implied.
 */
export function calculateAdaptiveTarget(
  maintenance: number,
  goal: GoalType,
  rateKgPerWeek: number | null
): AdaptiveTarget {
  const rate = resolveTargetRate(goal, rateKgPerWeek);
  const raw = goal === 'cut' ? -(rate * KCAL_PER_KG_EQUIVALENT) / 7 : goal === 'bulk' ? (rate * KCAL_PER_KG_EQUIVALENT) / 7 : 0;
  const adjustmentKcal = round10(Math.min(Math.max(raw, -MAX_GOAL_ADJUSTMENT_KCAL), MAX_GOAL_ADJUSTMENT_KCAL));
  const floored = Math.max(maintenance + adjustmentKcal, MIN_TARGET_KCAL);
  return {
    target: Math.round(floored),
    adjustmentKcal,
    rateKgPerWeek: rate,
    maintenance: Math.round(maintenance),
    goal,
    floorHit: floored === MIN_TARGET_KCAL && maintenance + adjustmentKcal < MIN_TARGET_KCAL,
  };
}

// --- Data quality (deterministic, reproducible — not an AI score) ---

export type DataQualityBand = 'high' | 'medium' | 'low';

export interface DataQuality {
  /** 0–100: nutrition coverage (50) + weight coverage (30) + span (20). */
  score: number;
  band: DataQualityBand;
  validNutritionDays: number;
  weightObservations: number;
  trendSpanDays: number;
  windowDays: number;
}

export function assessDataQuality(input: {
  validNutritionDays: number;
  weightObservations: number;
  trendSpanDays: number;
  windowDays?: number;
}): DataQuality {
  const windowDays = input.windowDays ?? ENERGY_WINDOW_DAYS;
  const nutrition = Math.min(input.validNutritionDays / 14, 1) * 50;
  const weight = Math.min(input.weightObservations / 8, 1) * 30;
  const span = Math.min(input.trendSpanDays / 21, 1) * 20;
  const score = Math.round(nutrition + weight + span);
  const band: DataQualityBand = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  return {
    score,
    band,
    validNutritionDays: input.validNutritionDays,
    weightObservations: input.weightObservations,
    trendSpanDays: input.trendSpanDays,
    windowDays,
  };
}

/** Minimum-data gate: conservative activation, never noisy early adaptation. */
export function passesMinimumDataGate(input: {
  validNutritionDays: number;
  weightObservations: number;
  trendSpanDays: number;
}): boolean {
  return (
    input.validNutritionDays >= MIN_VALID_NUTRITION_DAYS &&
    input.weightObservations >= MIN_WEIGHT_OBSERVATIONS &&
    input.trendSpanDays >= MIN_TREND_SPAN_DAYS
  );
}

// --- Confidence (separate from data quality and from adherence) ---

export type EnergyConfidence = 'high' | 'medium' | 'low';

export interface EnergyConfidenceResult {
  overall: EnergyConfidence;
  foodTracking: 'excellent' | 'good' | 'sparse';
  weightTracking: 'good' | 'fair' | 'sparse';
}

export function assessEnergyConfidence(quality: DataQuality): EnergyConfidenceResult {
  const foodTracking =
    quality.validNutritionDays >= 20 ? 'excellent' : quality.validNutritionDays >= 10 ? 'good' : 'sparse';
  const weightTracking =
    quality.weightObservations >= 8 ? 'good' : quality.weightObservations >= 5 ? 'fair' : 'sparse';
  const overall: EnergyConfidence =
    quality.band === 'high' && quality.trendSpanDays >= 21 && quality.weightObservations >= 8
      ? 'high'
      : quality.band !== 'low'
        ? 'medium'
        : 'low';
  return { overall, foodTracking, weightTracking };
}

/** Weekly smoothing: the applied target moves at most ±150 kcal per update. */
export function clampWeeklyStep(currentTarget: number, rawTarget: number): number {
  const delta = rawTarget - currentTarget;
  const clamped = Math.min(Math.max(delta, -MAX_WEEKLY_TARGET_STEP_KCAL), MAX_WEEKLY_TARGET_STEP_KCAL);
  return Math.round(currentTarget + clamped);
}

// --- Deterministic "why did my target change?" explanation ---

export interface TargetChangeExplanation {
  /** Rule-generated reasons (never AI text). Empty when nothing changed. */
  reasons: string[];
  /** True on first-ever adaptive application. */
  activated: boolean;
}

export function explainTargetChange(input: {
  previousTarget: number | null;
  newTarget: number;
  previousMaintenance: number | null;
  maintenance: number;
  previousAvgIntake: number | null;
  avgIntake: number;
  goalChanged: boolean;
  rateChanged: boolean;
  activated: boolean;
}): TargetChangeExplanation {
  const reasons: string[] = [];
  if (input.activated) {
    reasons.push('Enough logged data became available — switching from your starting estimate to an adaptive target.');
  }
  if (input.previousMaintenance !== null && Math.abs(input.maintenance - input.previousMaintenance) >= 50) {
    const dir = input.maintenance > input.previousMaintenance ? 'rose' : 'fell';
    reasons.push(
      `Your estimated maintenance ${dir} (${input.previousMaintenance} → ${input.maintenance} kcal) based on recent intake and weight trend.`
    );
  }
  if (input.previousAvgIntake !== null && Math.abs(input.avgIntake - input.previousAvgIntake) >= 100) {
    reasons.push(`Your average logged intake changed (${input.previousAvgIntake} → ${input.avgIntake} kcal/day).`);
  }
  if (input.goalChanged) reasons.push('Your goal changed, so the adjustment applied to maintenance changed.');
  if (input.rateChanged) reasons.push('Your weekly target rate changed.');
  if (input.previousTarget !== null && input.previousTarget !== input.newTarget && reasons.length === 0) {
    reasons.push('Weekly smoothing applied part of the calculated change.');
  }
  return { reasons, activated: input.activated };
}
