'use client';
import { create } from 'zustand';
import type { TargetHistory } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { calculateMacroTargets } from '@/lib/calculations/nutrition';
import { deriveEnergyState, type EnergyState } from '@/lib/calculations/analytics';
import { listTargetHistory, saveTargetHistory } from '@/lib/repositories/target-history-repository';
import { useProfileStore } from './profile-store';
import { useCalorieStore } from './calorie-store';
import { useMetricsStore } from './metrics-store';
import { writeThrough } from './write-through';

interface EnergyStoreState {
  state: EnergyState | null;
  history: TargetHistory[];
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
  /** Recompute from the current profile/foodLogs/metrics/history (pure derivation). */
  refresh: () => void;
  /**
   * Apply the due adaptive update: stepped target + recalculated macros go
   * to the profile (source 'adaptive', synced as entity 'profile'), and one
   * TargetHistory event is recorded (synced as 'targetHistory').
   * Historical food logs are never touched.
   */
  applyAdaptiveTarget: () => { ok: true; target: number } | { ok: false; reason: string };
  /**
   * Phase 10.5: record an explicit weekly-rate change (settings edit) as a
   * TargetHistory event. The calorie target itself is unchanged; only the
   * rate moved. Uses the existing TargetHistory mechanism — no second system.
   */
  recordRateChange: (previousRate: number | null, newRate: number | null) => void;
  reset: () => void;
}

export const useEnergyStore = create<EnergyStoreState>()((set, get) => ({
  state: null,
  history: [],
  ownerId: null,
  ready: false,
  lastError: null,

  load: async (ownerId) => {
    if (get().ownerId === ownerId && get().ready) return;
    set({ ownerId });
    try {
      const history = await listTargetHistory(ownerId);
      set({ history });
      get().refresh();
      set({ ready: true, lastError: null });
    } catch (error) {
      set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load energy data.' });
    }
  },

  refresh: () => {
    const profile = useProfileStore.getState().profile;
    if (!profile) {
      set({ state: null });
      return;
    }
    const foodLogs = useCalorieStore.getState().foodLogs;
    const metrics = useMetricsStore.getState().metrics;
    set({
      state: deriveEnergyState({ profile, foodLogs, metrics, history: get().history }),
    });
  },

  applyAdaptiveTarget: () => {
    const ownerId = get().ownerId;
    const derived = get().state;
    const profile = useProfileStore.getState().profile;
    if (!ownerId || !derived || !profile) return { ok: false, reason: 'Energy data is not ready yet.' };
    if (derived.mode !== 'adaptive' || !derived.maintenance || !derived.adaptiveTarget) {
      return { ok: false, reason: 'Using your starting estimate — more logged data is needed first.' };
    }
    if (profile.target_source === 'manual') {
      return { ok: false, reason: 'Your target was edited manually — adaptive updates are paused.' };
    }
    if (!derived.updateDue || derived.steppedTarget === null) {
      return { ok: false, reason: 'No update is due right now.' };
    }
    const target = derived.steppedTarget;
    const previous = profile.daily_calorie_target;
    const latestWeight = useMetricsStore.getState().getLatestMetric()?.weight_kg ?? 70;
    const macros = calculateMacroTargets(target, latestWeight, profile.goal);
    useProfileStore.getState().setProfile({
      daily_calorie_target: target,
      protein_target_g: macros.protein_g,
      carbs_target_g: macros.carbs_g,
      fat_target_g: macros.fat_g,
      target_source: 'adaptive',
    });
    const now = new Date().toISOString();
    const reasons = derived.explanation.reasons.join(' ');
    const entry: TargetHistory = {
      id: generateId(),
      user_id: ownerId,
      date: derived.today,
      previous_target: previous,
      new_target: target,
      reason: reasons.slice(0, 1000) || `Adaptive update to ${target} kcal.`,
      maintenance_estimate: derived.maintenance.estimate,
      valid_days: derived.validNutritionDays,
      confidence: derived.confidence.overall,
      goal: profile.goal,
      avg_intake_kcal: derived.maintenance.averageIntakeKcal,
      previous_rate_kg_per_week: null,
      new_rate_kg_per_week: null,
      created_at: now,
    };
    set((s) => ({ history: [...s.history, entry] }));
    writeThrough(saveTargetHistory(ownerId, entry), 'target history', (message) =>
      set({ lastError: message })
    );
    get().refresh();
    return { ok: true, target };
  },

  recordRateChange: (previousRate, newRate) => {
    const ownerId = get().ownerId;
    const profile = useProfileStore.getState().profile;
    if (!ownerId || !profile) return;
    if (previousRate === newRate) return;
    const fmt = (r: number | null) => (r === null ? 'goal default' : `${r} kg/week`);
    const now = new Date().toISOString();
    const entry: TargetHistory = {
      id: generateId(),
      user_id: ownerId,
      date: now.split('T')[0],
      previous_target: profile.daily_calorie_target,
      new_target: profile.daily_calorie_target,
      reason: `Target rate changed (${fmt(previousRate)} → ${fmt(newRate)}).`,
      maintenance_estimate: null,
      valid_days: 0,
      confidence: get().state?.confidence.overall ?? 'low',
      goal: profile.goal,
      avg_intake_kcal: null,
      previous_rate_kg_per_week: previousRate,
      new_rate_kg_per_week: newRate,
      created_at: now,
    };
    set((s) => ({ history: [...s.history, entry] }));
    writeThrough(saveTargetHistory(ownerId, entry), 'target history', (message) =>
      set({ lastError: message })
    );
    get().refresh();
  },

  reset: () => set({ state: null, history: [], ownerId: null, ready: false, lastError: null }),
}));
