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
      created_at: now,
    };
    set((s) => ({ history: [...s.history, entry] }));
    writeThrough(saveTargetHistory(ownerId, entry), 'target history', (message) =>
      set({ lastError: message })
    );
    get().refresh();
    return { ok: true, target };
  },

  reset: () => set({ state: null, history: [], ownerId: null, ready: false, lastError: null }),
}));
