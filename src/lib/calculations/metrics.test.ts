// Phase 7 — weight trend tests: the single canonical 7-day rolling median.
import { describe, expect, it } from 'vitest';
import { calculateWeightTrend, collapseDailyWeights } from './metrics';

function days(start: string, weights: (number | null)[], startOffset = 0): { date: string; weight_kg: number }[] {
  // Build YYYY-MM-DD dates by offset from a base (September 2026 has 30 days).
  const base = new Date(2026, 8, Number(start));
  return weights.flatMap((w, i) => {
    if (w === null) return [];
    const d = new Date(base);
    d.setDate(d.getDate() + startOffset + i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return [{ date: `2026-${mm}-${dd}`, weight_kg: w }];
  });
}

describe('collapseDailyWeights', () => {
  it('collapses same-day weigh-ins to their median (deterministic rule)', () => {
    expect(
      collapseDailyWeights([
        { date: '2026-09-22', weight_kg: 80 },
        { date: '2026-09-22', weight_kg: 81 },
        { date: '2026-09-21', weight_kg: 79 },
      ])
    ).toEqual([
      { date: '2026-09-21', weight_kg: 79 },
      { date: '2026-09-22', weight_kg: 80.5 },
    ]);
  });

  it('skips invalid rows without crashing', () => {
    expect(
      collapseDailyWeights([
        { date: '2026-09-22', weight_kg: NaN },
        { date: 'not-a-date', weight_kg: 80 },
        { date: '2026-09-22', weight_kg: 80 },
      ])
    ).toEqual([{ date: '2026-09-22', weight_kg: 80 }]);
    expect(collapseDailyWeights([])).toEqual([]);
  });
});

describe('calculateWeightTrend', () => {
  it('tracks a steady decrease', () => {
    const weights = Array.from({ length: 15 }, (_, i) => 82 - i * 0.2);
    const t = calculateWeightTrend(days('01', weights));
    expect(t.observationsUsed).toBe(15);
    expect(t.rateKgPerDay).toBeLessThan(-0.1);
    expect(t.rateKgPerDay).toBeGreaterThan(-0.3);
    expect(t.spanDays).toBe(14);
    expect(t.trendEnd!.weight_kg).toBeLessThan(t.trendStart!.weight_kg);
  });

  it('tracks a steady increase', () => {
    const weights = Array.from({ length: 11 }, (_, i) => 78 + i * 0.2);
    const t = calculateWeightTrend(days('01', weights));
    expect(t.rateKgPerDay).toBeGreaterThan(0.1);
    expect(t.rateKgPerDay).toBeLessThan(0.3);
  });

  it('reports ~zero rate for stable weight', () => {
    const t = calculateWeightTrend(days('01', [80, 80.1, 79.9, 80, 80.1, 79.9, 80]));
    expect(Math.abs(t.rateKgPerDay)).toBeLessThan(0.02);
  });

  it('ignores a single anomalous weigh-in (median robustness)', () => {
    const stable = [80, 80, 80, 80, 80, 80, 80, 80, 80, 80];
    const spiked = [80, 80, 80, 80, 84, 80, 80, 80, 80, 80];
    const a = calculateWeightTrend(days('01', stable));
    const b = calculateWeightTrend(days('01', spiked));
    expect(a.rateKgPerDay).toBe(0);
    // A 4 kg one-day spike must not swing the trend rate materially.
    expect(Math.abs(b.rateKgPerDay)).toBeLessThan(0.05);
  });

  it('handles missing days (gaps stay gaps, rate still resolves)', () => {
    const t = calculateWeightTrend(days('01', [82, null, null, 81.5, null, null, 81, null, null, 80.5]));
    expect(t.observationsUsed).toBe(4);
    expect(t.rateKgPerDay).toBeLessThan(0);
    expect(t.points.length).toBeGreaterThan(0);
  });

  it('handles irregular measurement intervals', () => {
    const t = calculateWeightTrend([
      { date: '2026-09-01', weight_kg: 82 },
      { date: '2026-09-09', weight_kg: 81 },
      { date: '2026-09-10', weight_kg: 80.9 },
      { date: '2026-09-21', weight_kg: 80 },
    ]);
    expect(t.observationsUsed).toBe(4);
    expect(t.spanDays).toBe(20);
    expect(t.rateKgPerDay).toBeCloseTo(-0.1, 1);
  });

  it('behaves sensibly at date boundaries (month rollover)', () => {
    const t = calculateWeightTrend([
      { date: '2026-08-28', weight_kg: 81 },
      { date: '2026-08-29', weight_kg: 80.9 },
      { date: '2026-08-30', weight_kg: 80.8 },
      { date: '2026-08-31', weight_kg: 80.7 },
      { date: '2026-09-01', weight_kg: 80.6 },
      { date: '2026-09-02', weight_kg: 80.5 },
      { date: '2026-09-03', weight_kg: 80.4 },
      { date: '2026-09-04', weight_kg: 80.3 },
    ]);
    expect(t.spanDays).toBe(7);
    expect(t.rateKgPerDay).toBeLessThan(0);
    expect(t.trendStart!.date).toBe('2026-08-28');
    expect(t.trendEnd!.date).toBe('2026-09-04');
  });

  it('returns zero rate for a single observation and nulls for empty input', () => {
    const single = calculateWeightTrend([{ date: '2026-09-22', weight_kg: 80 }]);
    expect(single.rateKgPerDay).toBe(0);
    expect(single.spanDays).toBe(0);
    expect(single.observationsUsed).toBe(1);
    const empty = calculateWeightTrend([]);
    expect(empty.points).toEqual([]);
    expect(empty.trendStart).toBeNull();
    expect(empty.trendEnd).toBeNull();
    expect(empty.rateKgPerDay).toBe(0);
  });

  it('is deterministic', () => {
    const input = days('05', [81, 80.5, 81.5, 80, 80.2, 79.8, 80.1]);
    expect(calculateWeightTrend(input)).toEqual(calculateWeightTrend(input));
  });
});
