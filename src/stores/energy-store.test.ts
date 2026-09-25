// Phase 10.5 — recordRateChange: explicit rate edits append TargetHistory
// events with old/new rates; identical resubmits record nothing.
import { beforeEach, describe, expect, it } from 'vitest';
import { useEnergyStore } from './energy-store';
import { useProfileStore } from './profile-store';

function profile() {
  const now = new Date().toISOString();
  return {
    id: 'p-1', full_name: 'Test', email: '', date_of_birth: '1990-01-01',
    gender: 'male' as const, activity_level: 'moderately_active' as const, goal: 'cut' as const,
    unit_system: 'metric' as const, daily_calorie_target: 2500, protein_target_g: 150,
    carbs_target_g: 250, fat_target_g: 70, target_rate_kg_per_week: 0.5 as number | null,
    target_source: 'initial' as const, created_at: now, updated_at: now,
  };
}

beforeEach(() => {
  useProfileStore.setState({ profile: profile(), ownerId: 'user-a' });
  useEnergyStore.setState({ history: [], ownerId: 'user-a', state: null, ready: true, lastError: null });
});

describe('recordRateChange', () => {
  it('records old and new rates with a rate-change reason', () => {
    useEnergyStore.getState().recordRateChange(0.5, 0.4);
    const history = useEnergyStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      previous_target: 2500,
      new_target: 2500,
      reason: 'Target rate changed (0.5 kg/week → 0.4 kg/week).',
      previous_rate_kg_per_week: 0.5,
      new_rate_kg_per_week: 0.4,
      goal: 'cut',
    });
  });

  it('ignores identical resubmits and missing context', () => {
    useEnergyStore.getState().recordRateChange(0.5, 0.5);
    useEnergyStore.getState().recordRateChange(0.5, 0.5);
    expect(useEnergyStore.getState().history).toHaveLength(0);
    useProfileStore.setState({ profile: null });
    useEnergyStore.getState().recordRateChange(0.5, 0.4);
    expect(useEnergyStore.getState().history).toHaveLength(0);
  });

  it('formats cleared rates as goal default', () => {
    useEnergyStore.getState().recordRateChange(0.4, null);
    expect(useEnergyStore.getState().history[0].reason).toMatch(/goal default/);
  });
});
