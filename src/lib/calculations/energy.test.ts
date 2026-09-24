// Phase 7 — energy engine tests: initial estimate (backfill: previously
// untested), observed maintenance, adaptive targets, quality, confidence,
// guardrails, explanations, and determinism.
import { describe, expect, it } from 'vitest';
import {
  KCAL_PER_KG_EQUIVALENT,
  MIN_TARGET_KCAL,
  assessDataQuality,
  assessEnergyConfidence,
  calculateAdaptiveTarget,
  calculateBMR,
  calculateObservedMaintenance,
  calculateTDEE,
  clampWeeklyStep,
  explainTargetChange,
  passesMinimumDataGate,
  resolveGoalAdjustment,
  resolveTargetRate,
} from './energy';

const BASE = { weight_kg: 80, height_cm: 180, age: 30, activity_level: 'moderately_active' as const };

describe('initial estimate (BMR / TDEE / goal auto-derive)', () => {
  it('computes Mifflin-St Jeor BMR by gender', () => {
    expect(calculateBMR({ ...BASE, gender: 'male' })).toBe(10 * 80 + 6.25 * 180 - 5 * 30 + 5);
    expect(calculateBMR({ ...BASE, gender: 'female' })).toBe(10 * 80 + 6.25 * 180 - 5 * 30 - 161);
    // 'other' preserves the female offset (existing behavior).
    expect(calculateBMR({ ...BASE, gender: 'other' })).toBe(calculateBMR({ ...BASE, gender: 'female' }));
  });

  it('scales BMR by the activity multiplier', () => {
    expect(calculateTDEE({ ...BASE, gender: 'male', activity_level: 'sedentary' })).toBe(
      Math.round(calculateBMR({ ...BASE, gender: 'male' }) * 1.2)
    );
    expect(calculateTDEE({ ...BASE, gender: 'male', activity_level: 'extremely_active' })).toBe(
      Math.round(calculateBMR({ ...BASE, gender: 'male' }) * 1.9)
    );
  });

  it('auto-derives cut/bulk/recomp from body fat (never maintain/custom)', () => {
    expect(resolveGoalAdjustment({ gender: 'male', body_fat_percentage: 25, bmi: 26 })).toMatchObject({ goal: 'cut', calorieAdjustment: -500 });
    expect(resolveGoalAdjustment({ gender: 'male', body_fat_percentage: 8, bmi: 22 })).toMatchObject({ goal: 'bulk', calorieAdjustment: 300 });
    expect(resolveGoalAdjustment({ gender: 'male', body_fat_percentage: 15, bmi: 23 })).toMatchObject({ goal: 'recomp', calorieAdjustment: 0 });
    expect(resolveGoalAdjustment({ gender: 'female', body_fat_percentage: 32, bmi: 27 })).toMatchObject({ goal: 'cut', calorieAdjustment: -400 });
    expect(resolveGoalAdjustment({ gender: 'female', body_fat_percentage: 15, bmi: 21 })).toMatchObject({ goal: 'bulk', calorieAdjustment: 250 });
  });

  it('falls back to BMI when body fat is unknown', () => {
    expect(resolveGoalAdjustment({ gender: 'male', body_fat_percentage: null, bmi: 30 })).toMatchObject({ goal: 'cut' });
    expect(resolveGoalAdjustment({ gender: 'female', body_fat_percentage: null, bmi: 18 })).toMatchObject({ goal: 'bulk' });
    expect(resolveGoalAdjustment({ gender: 'other', body_fat_percentage: null, bmi: 23 })).toMatchObject({ goal: 'recomp', calorieAdjustment: 0 });
  });
});

describe('resolveTargetRate', () => {
  it('uses goal defaults when no explicit rate is stored', () => {
    expect(resolveTargetRate('cut', null)).toBe(0.5);
    expect(resolveTargetRate('bulk', null)).toBe(0.25);
    expect(resolveTargetRate('recomp', null)).toBe(0);
    expect(resolveTargetRate('maintain', null)).toBe(0);
    expect(resolveTargetRate('custom', null)).toBe(0);
  });

  it('prefers the stored rate and clamps it to [0, 1.5]', () => {
    expect(resolveTargetRate('cut', 0.7)).toBe(0.7);
    expect(resolveTargetRate('cut', 5)).toBe(1.5);
    expect(resolveTargetRate('cut', -1)).toBe(0);
    expect(resolveTargetRate('bulk', NaN)).toBe(0.25);
  });
});

describe('calculateAdaptiveTarget', () => {
  it('applies a rate-driven deficit for cut and surplus for bulk', () => {
    const cut = calculateAdaptiveTarget(2800, 'cut', 0.5);
    expect(cut.adjustmentKcal).toBe(-550); // 0.5 * 7700 / 7, rounded to 10
    expect(cut.target).toBe(2250);
    const bulk = calculateAdaptiveTarget(2800, 'bulk', 0.25);
    expect(bulk.adjustmentKcal).toBe(280); // 0.25 * 7700 / 7 = 275 → 280
    expect(bulk.target).toBe(3080);
  });

  it('keeps maintain/recomp/custom maintenance-oriented (no directed deficit)', () => {
    for (const goal of ['recomp', 'maintain', 'custom'] as const) {
      const t = calculateAdaptiveTarget(2650, goal, 0.5);
      expect(t.adjustmentKcal).toBe(0);
      expect(t.target).toBe(2650);
    }
  });

  it('caps extreme rates at ±750 kcal', () => {
    const t = calculateAdaptiveTarget(3000, 'cut', 1.5);
    expect(t.adjustmentKcal).toBe(-750); // raw would be -1650
    expect(t.target).toBe(2250);
  });

  it('floors the target at 1200 kcal and reports it', () => {
    const t = calculateAdaptiveTarget(1500, 'cut', 0.5);
    expect(t.target).toBe(MIN_TARGET_KCAL);
    expect(t.floorHit).toBe(true);
    expect(calculateAdaptiveTarget(2500, 'cut', 0.5).floorHit).toBe(false);
  });
});

describe('calculateObservedMaintenance', () => {
  const window = { windowStart: '2026-08-26', windowEnd: '2026-09-22', validNutritionDays: 21, weightObservations: 7, trendSpanDays: 20 };

  it('matches intake when weight is stable', () => {
    const m = calculateObservedMaintenance({ averageIntakeKcal: 2700, rateKgPerDay: 0, ...window });
    expect(m.estimate).toBe(2700);
    expect(m.rateKgPerWeek).toBe(0);
  });

  it('estimates expenditure above intake on a deficit with weight loss', () => {
    // 2500 kcal/day while losing 0.1 kg/day → ~2500 + 770 = 3270.
    const m = calculateObservedMaintenance({ averageIntakeKcal: 2500, rateKgPerDay: -0.1, ...window });
    expect(m.estimate).toBe(2500 + Math.round(0.1 * KCAL_PER_KG_EQUIVALENT));
    expect(m.estimate).toBeGreaterThan(2500);
  });

  it('estimates expenditure below intake on a surplus with weight gain', () => {
    const m = calculateObservedMaintenance({ averageIntakeKcal: 3200, rateKgPerDay: 0.05, ...window });
    expect(m.estimate).toBeLessThan(3200);
    expect(m.estimate).toBe(3200 - Math.round(0.05 * KCAL_PER_KG_EQUIVALENT));
  });

  it('carries uncertainty bounds that widen with the rate component', () => {
    const stable = calculateObservedMaintenance({ averageIntakeKcal: 2700, rateKgPerDay: 0, ...window });
    expect(stable.minimum).toBe(2600);
    expect(stable.maximum).toBe(2800);
    const fast = calculateObservedMaintenance({ averageIntakeKcal: 2500, rateKgPerDay: -0.2, ...window });
    expect(fast.maximum - fast.minimum).toBeGreaterThan(stable.maximum - stable.minimum);
    expect(fast.minimum).toBeLessThanOrEqual(fast.estimate);
    expect(fast.maximum).toBeGreaterThanOrEqual(fast.estimate);
  });
});

describe('data quality and minimum-data gate', () => {
  it('scores a strong month as high', () => {
    const q = assessDataQuality({ validNutritionDays: 21, weightObservations: 10, trendSpanDays: 24 });
    expect(q.band).toBe('high');
    expect(q.score).toBeGreaterThanOrEqual(70);
  });

  it('scores sparse tracking as low', () => {
    const q = assessDataQuality({ validNutritionDays: 3, weightObservations: 1, trendSpanDays: 4 });
    expect(q.band).toBe('low');
    expect(q.score).toBeLessThan(40);
  });

  it('scores partial coverage as medium', () => {
    const q = assessDataQuality({ validNutritionDays: 10, weightObservations: 5, trendSpanDays: 14 });
    expect(q.band).toBe('medium');
  });

  it('gates adaptation conservatively (10 days / 5 weigh-ins / 14-day span)', () => {
    expect(passesMinimumDataGate({ validNutritionDays: 10, weightObservations: 5, trendSpanDays: 14 })).toBe(true);
    expect(passesMinimumDataGate({ validNutritionDays: 9, weightObservations: 5, trendSpanDays: 14 })).toBe(false);
    expect(passesMinimumDataGate({ validNutritionDays: 10, weightObservations: 4, trendSpanDays: 14 })).toBe(false);
    expect(passesMinimumDataGate({ validNutritionDays: 10, weightObservations: 5, trendSpanDays: 13 })).toBe(false);
  });
});

describe('confidence (separate from quality and adherence)', () => {
  it('requires sustained high-quality data for high confidence', () => {
    const high = assessEnergyConfidence(
      assessDataQuality({ validNutritionDays: 24, weightObservations: 10, trendSpanDays: 25 })
    );
    expect(high.overall).toBe('high');
    expect(high.foodTracking).toBe('excellent');
    expect(high.weightTracking).toBe('good');
  });

  it('reports medium when data is decent but short', () => {
    const mid = assessEnergyConfidence(
      assessDataQuality({ validNutritionDays: 12, weightObservations: 6, trendSpanDays: 16 })
    );
    expect(mid.overall).toBe('medium');
    expect(mid.foodTracking).toBe('good');
    expect(mid.weightTracking).toBe('fair');
  });

  it('reports low with sparse tracking even if some data exists', () => {
    const low = assessEnergyConfidence(
      assessDataQuality({ validNutritionDays: 4, weightObservations: 2, trendSpanDays: 6 })
    );
    expect(low.overall).toBe('low');
    expect(low.foodTracking).toBe('sparse');
    expect(low.weightTracking).toBe('sparse');
  });
});

describe('weekly smoothing guardrail', () => {
  it('caps moves at ±150 kcal per update', () => {
    expect(clampWeeklyStep(2500, 2800)).toBe(2650);
    expect(clampWeeklyStep(2500, 2200)).toBe(2350);
    expect(clampWeeklyStep(2500, 2560)).toBe(2560);
    expect(clampWeeklyStep(2500, 2500)).toBe(2500);
  });
});

describe('explainTargetChange', () => {
  it('announces first activation from the starting estimate', () => {
    const e = explainTargetChange({
      previousTarget: 2500, newTarget: 2650, previousMaintenance: null,
      maintenance: 2800, previousAvgIntake: null, avgIntake: 2700,
      goalChanged: false, rateChanged: false, activated: true,
    });
    expect(e.activated).toBe(true);
    expect(e.reasons.some((r) => r.includes('starting estimate'))).toBe(true);
  });

  it('fires maintenance, intake, and goal reasons from thresholds', () => {
    const e = explainTargetChange({
      previousTarget: 2500, newTarget: 2600, previousMaintenance: 2700,
      maintenance: 2800, previousAvgIntake: 2500, avgIntake: 2650,
      goalChanged: true, rateChanged: false, activated: false,
    });
    expect(e.reasons.some((r) => r.includes('maintenance rose'))).toBe(true);
    expect(e.reasons.some((r) => r.includes('logged intake changed'))).toBe(true);
    expect(e.reasons.some((r) => r.includes('goal changed'))).toBe(true);
  });

  it('stays quiet below thresholds', () => {
    const e = explainTargetChange({
      previousTarget: 2500, newTarget: 2520, previousMaintenance: 2700,
      maintenance: 2710, previousAvgIntake: 2500, avgIntake: 2530,
      goalChanged: false, rateChanged: false, activated: false,
    });
    expect(e.reasons).toEqual(['Weekly smoothing applied part of the calculated change.']);
  });
});

describe('determinism', () => {
  it('produces identical results for identical inputs', () => {
    const input = { averageIntakeKcal: 2437.4, rateKgPerDay: -0.073, windowStart: '2026-08-26', windowEnd: '2026-09-22', validNutritionDays: 17, weightObservations: 6, trendSpanDays: 19 };
    expect(calculateObservedMaintenance(input)).toEqual(calculateObservedMaintenance(input));
    expect(calculateAdaptiveTarget(3123, 'cut', 0.5)).toEqual(calculateAdaptiveTarget(3123, 'cut', 0.5));
    expect(assessDataQuality({ validNutritionDays: 17, weightObservations: 6, trendSpanDays: 19 })).toEqual(
      assessDataQuality({ validNutritionDays: 17, weightObservations: 6, trendSpanDays: 19 })
    );
  });
});
