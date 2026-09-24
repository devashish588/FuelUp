// Phase 7 — deriveEnergyState tests with deterministic synthetic fixtures:
// stable intake, deficit + loss, surplus + gain, sparse data, retroactive
// additions, determinism, update cadence, and input immutability.
import { describe, expect, it } from 'vitest';
import { deriveEnergyState } from './analytics';
import type { BodyMetric, FoodLog, Profile, TargetHistory } from '@/lib/types';

const TODAY = '2026-09-22';

function dateBack(daysAgo: number): string {
  const d = new Date(2026, 8, 22);
  d.setDate(d.getDate() - daysAgo);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `2026-${mm}-${dd}`;
}

function profile(overrides: Partial<Profile> = {}): Profile {
  const now = new Date().toISOString();
  return {
    id: 'p-1',
    full_name: 'Test User',
    email: '',
    date_of_birth: '1995-01-01',
    gender: 'male',
    activity_level: 'moderately_active',
    goal: 'cut',
    unit_system: 'metric',
    daily_calorie_target: 2500,
    protein_target_g: 150,
    carbs_target_g: 250,
    fat_target_g: 70,
    target_rate_kg_per_week: null,
    target_source: 'initial',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function log(id: string, daysAgo: number, calories: number): FoodLog {
  return {
    id, user_id: 'u-1', food_item_id: 'f-1', food_name: 'Meal', date: dateBack(daysAgo),
    meal_type: 'lunch', servings: 1, quantity: 500, quantity_unit: 'g',
    calories, protein_g: 100, carbs_g: 200, fat_g: 60, notes: '', created_at: new Date().toISOString(),
  };
}

function metric(id: string, daysAgo: number, weight_kg: number): BodyMetric {
  return {
    id, user_id: 'u-1', date: dateBack(daysAgo), weight_kg, height_cm: 180,
    body_fat_percentage: null, bmi: null, waist_cm: null, chest_cm: null,
    arms_cm: null, thighs_cm: null, notes: '', created_at: new Date().toISOString(),
  };
}

/** 21 days of `kcal`/day + weigh-ins every 3 days declining `fromKg → toKg`. */
function fixture(kcal: number, fromKg: number, toKg: number) {
  const logs: FoodLog[] = [];
  for (let i = 0; i < 21; i++) logs.push(log(`fl-${i}`, 20 - i, kcal));
  const metrics: BodyMetric[] = [];
  for (let i = 0; i < 7; i++) {
    metrics.push(metric(`m-${i}`, 20 - i * 3, fromKg + ((toKg - fromKg) * (i * 3)) / 20));
  }
  return { logs, metrics };
}

describe('deriveEnergyState — synthetic scenarios', () => {
  it('stable intake + stable weight → maintenance approximately near intake', () => {
    const { logs, metrics } = fixture(2700, 80, 80);
    const s = deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
    expect(s.mode).toBe('adaptive');
    expect(s.validNutritionDays).toBe(21);
    expect(s.averageIntakeKcal).toBe(2700);
    expect(s.maintenance).not.toBeNull();
    expect(s.maintenance!.estimate).toBe(2700);
    expect(s.maintenance!.minimum).toBeLessThanOrEqual(2700);
    expect(s.maintenance!.maximum).toBeGreaterThanOrEqual(2700);
    expect(s.quality.band).toBe('high');
  });

  it('deficit intake + declining weight → observed expenditure above intake', () => {
    const { logs, metrics } = fixture(2500, 82, 80);
    const s = deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
    expect(s.mode).toBe('adaptive');
    expect(s.trend.rateKgPerDay).toBeLessThan(0);
    expect(s.maintenance!.estimate).toBeGreaterThan(2500);
    // ≈ 2500 + 0.1 kg/day × 7700 ≈ 3270 (tolerance for median smoothing).
    expect(s.maintenance!.estimate).toBeGreaterThan(2900);
    expect(s.maintenance!.estimate).toBeLessThan(3600);
  });

  it('surplus intake + gaining weight → observed expenditure below intake', () => {
    const { logs, metrics } = fixture(3200, 79, 80.5);
    const s = deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
    expect(s.mode).toBe('adaptive');
    expect(s.trend.rateKgPerDay).toBeGreaterThan(0);
    expect(s.maintenance!.estimate).toBeLessThan(3200);
  });

  it('sparse data → starting estimate with a plain-language reason', () => {
    const s = deriveEnergyState({
      profile: profile(),
      foodLogs: [log('fl-1', 1, 2400), log('fl-2', 0, 2300)],
      metrics: [metric('m-1', 0, 80)],
      history: [],
      today: TODAY,
    });
    expect(s.mode).toBe('initial');
    expect(s.maintenance).toBeNull();
    expect(s.adaptiveTarget).toBeNull();
    expect(s.updateDue).toBe(false);
    expect(s.explanation.reasons.some((r) => r.includes('starting estimate'))).toBe(true);
  });

  it('ignores near-empty logging days in the intake average', () => {
    const { logs, metrics } = fixture(2700, 80, 80);
    logs.push(log('fl-empty', 21, 50)); // placeholder day inside the window
    const s = deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
    expect(s.validNutritionDays).toBe(21);
    expect(s.averageIntakeKcal).toBe(2700);
  });
});

describe('deriveEnergyState — update cadence and stepping', () => {
  function adaptive() {
    const { logs, metrics } = fixture(2400, 82, 80);
    return deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
  }

  it('proposes a guardrail-stepped update on first adaptation', () => {
    const s = adaptive();
    expect(s.mode).toBe('adaptive');
    expect(s.updateDue).toBe(true);
    expect(s.steppedTarget).not.toBeNull();
    // Raw cut target ≈ 3170 − 550 ≈ 2620 vs current 2500 → step caps at +150.
    expect(Math.abs(s.steppedTarget! - 2500)).toBeLessThanOrEqual(150);
    expect(s.explanation.activated).toBe(true);
  });

  it('pauses when the target was edited manually', () => {
    const { logs, metrics } = fixture(2400, 82, 80);
    const s = deriveEnergyState({
      profile: profile({ target_source: 'manual' }), foodLogs: logs, metrics, history: [], today: TODAY,
    });
    expect(s.mode).toBe('adaptive');
    expect(s.updateDue).toBe(false);
  });

  it('holds for a week after the last change (weekly cadence)', () => {
    const { logs, metrics } = fixture(2400, 82, 80);
    const recent: TargetHistory = {
      id: 'th-1', user_id: 'u-1', date: dateBack(3), previous_target: 2500, new_target: 2600,
      reason: 'r', maintenance_estimate: 2950, valid_days: 21, confidence: 'high',
      goal: 'cut', avg_intake_kcal: 2400, created_at: new Date().toISOString(),
    };
    const held = deriveEnergyState({
      profile: profile({ daily_calorie_target: 2600, target_source: 'adaptive' }),
      foodLogs: logs, metrics, history: [recent], today: TODAY,
    });
    expect(held.updateDue).toBe(false);
    const due = deriveEnergyState({
      profile: profile({ daily_calorie_target: 2600, target_source: 'adaptive' }),
      foodLogs: logs, metrics,
      history: [{ ...recent, date: dateBack(9) }],
      today: TODAY,
    });
    expect(due.updateDue).toBe(true);
    expect(due.explanation.reasons.some((r) => r.includes('maintenance'))).toBe(true);
  });

  it('reports no update when the target already matches', () => {
    const { logs, metrics } = fixture(2400, 82, 80);
    const first = deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
    const settled = deriveEnergyState({
      profile: profile({ daily_calorie_target: first.adaptiveTarget!.target, target_source: 'adaptive' }),
      foodLogs: logs, metrics, history: [], today: TODAY,
    });
    expect(settled.updateDue).toBe(false);
  });
});

describe('deriveEnergyState — retroactive data and determinism', () => {
  it('recomputes when historical food/weight is added later', () => {
    const { logs, metrics } = fixture(2400, 82, 80);
    const before = deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
    // User backfills a heavy day + a weigh-in from inside the window.
    const after = deriveEnergyState({
      profile: profile(),
      foodLogs: [...logs, log('fl-old', 10, 4200)],
      metrics: [...metrics, metric('m-old', 10, 81.8)],
      history: [],
      today: TODAY,
    });
    expect(after.averageIntakeKcal).toBeGreaterThan(before.averageIntakeKcal);
    expect(after.validNutritionDays).toBe(before.validNutritionDays); // day 10 already valid
    expect(after.maintenance!.estimate).not.toBe(before.maintenance!.estimate);
  });

  it('counts a backfilled empty day as a new observation', () => {
    const { logs, metrics } = fixture(2400, 82, 80);
    const before = deriveEnergyState({ profile: profile(), foodLogs: logs, metrics, history: [], today: TODAY });
    const after = deriveEnergyState({
      profile: profile(),
      foodLogs: [...logs, log('fl-old', 25, 2600)],
      metrics, history: [], today: TODAY,
    });
    expect(after.validNutritionDays).toBe(before.validNutritionDays + 1);
  });

  it('is deterministic and never mutates its inputs', () => {
    const { logs, metrics } = fixture(2400, 82, 80);
    const p = profile();
    const snapshot = JSON.stringify({ logs, metrics, p });
    const a = deriveEnergyState({ profile: p, foodLogs: logs, metrics, history: [], today: TODAY });
    const b = deriveEnergyState({ profile: p, foodLogs: logs, metrics, history: [], today: TODAY });
    expect(b).toEqual(a);
    expect(JSON.stringify({ logs, metrics, p })).toBe(snapshot);
  });
});
