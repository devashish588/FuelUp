'use client';
import { create } from 'zustand';
import { generateId } from '@/lib/utils';
import { getWeeklyPlan, saveWeeklyPlan } from '@/lib/repositories/workout-repository';
import { writeThrough } from './write-through';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface RoutineExercise {
  id: string;
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps: string;
  notes: string;
}

export interface DayPlan {
  day: DayOfWeek;
  label: string;
  exercises: RoutineExercise[];
}

export interface PR {
  id: string;
  exercise_id: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  date: string;
  notes: string;
}

interface WorkoutPlannerState {
  weeklyPlan: DayPlan[];
  prs: PR[];
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
  addExerciseToDay: (day: DayOfWeek, exerciseName: string, exerciseId: string, sets: number, reps: string) => void;
  removeExerciseFromDay: (day: DayOfWeek, exerciseId: string) => void;
  updateDayLabel: (day: DayOfWeek, label: string) => void;
  addPR: (exerciseName: string, exerciseId: string, weight: number, reps: number, date: string) => void;
  removePR: (id: string) => void;
  getPRForExercise: (exerciseName: string) => PR | undefined;
}

export const DEFAULT_PLAN: DayPlan[] = [
  { day: 'monday', label: 'Push Day', exercises: [] },
  { day: 'tuesday', label: 'Pull Day', exercises: [] },
  { day: 'wednesday', label: 'Legs', exercises: [] },
  { day: 'thursday', label: 'Push Day', exercises: [] },
  { day: 'friday', label: 'Pull Day', exercises: [] },
  { day: 'saturday', label: 'Legs / Arms', exercises: [] },
  { day: 'sunday', label: 'Rest Day', exercises: [] },
];

function persistPlan(ownerId: string | null, weeklyPlan: DayPlan[], prs: PR[], onError: (m: string) => void) {
  if (!ownerId) return;
  writeThrough(
    saveWeeklyPlan(ownerId, {
      ownerId,
      days: weeklyPlan.map((d) => ({ ...d, day: d.day as string })),
      prs,
      updatedAt: new Date().toISOString(),
    }),
    'workout plan',
    onError
  );
}

export const useWorkoutPlannerStore = create<WorkoutPlannerState>()((set, get) => ({
  weeklyPlan: DEFAULT_PLAN,
  prs: [],
  ownerId: null,
  ready: false,
  lastError: null,

  load: async (ownerId) => {
    if (get().ownerId === ownerId && get().ready) return;
    set({ ownerId });
    try {
      const row = await getWeeklyPlan(ownerId);
      if (row) {
        set({
          weeklyPlan: row.days as DayPlan[],
          prs: row.prs as PR[],
          ready: true,
          lastError: null,
        });
      } else {
        // First run for this owner: persist the default plan so later loads
        // (and other devices in future phases) see a stable baseline.
        set({ weeklyPlan: DEFAULT_PLAN, prs: [], ready: true, lastError: null });
        persistPlan(ownerId, DEFAULT_PLAN, [], (message) => set({ lastError: message }));
      }
    } catch (error) {
      set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load your workout plan.' });
    }
  },

  addExerciseToDay: (day, exerciseName, exerciseId, sets, reps) => {
    set((s) => ({
      weeklyPlan: s.weeklyPlan.map((p) =>
        p.day === day
          ? {
              ...p,
              exercises: [
                ...p.exercises,
                { id: generateId(), exercise_id: exerciseId, exercise_name: exerciseName, sets, reps, notes: '' },
              ],
            }
          : p
      ),
    }));
    const s = get();
    persistPlan(s.ownerId, s.weeklyPlan, s.prs, (message) => set({ lastError: message }));
  },

  removeExerciseFromDay: (day, id) => {
    set((s) => ({
      weeklyPlan: s.weeklyPlan.map((p) =>
        p.day === day ? { ...p, exercises: p.exercises.filter((e) => e.id !== id) } : p
      ),
    }));
    const s = get();
    persistPlan(s.ownerId, s.weeklyPlan, s.prs, (message) => set({ lastError: message }));
  },

  updateDayLabel: (day, label) => {
    set((s) => ({
      weeklyPlan: s.weeklyPlan.map((p) => (p.day === day ? { ...p, label } : p)),
    }));
    const s = get();
    persistPlan(s.ownerId, s.weeklyPlan, s.prs, (message) => set({ lastError: message }));
  },

  addPR: (exerciseName, exerciseId, weight, reps, date) => {
    const pr: PR = {
      id: generateId(),
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      weight_kg: weight,
      reps,
      date,
      notes: '',
    };
    set((s) => {
      // Replace existing PR if this is heavier
      const existing = s.prs.findIndex((p) => p.exercise_name.toLowerCase() === exerciseName.toLowerCase());
      if (existing >= 0 && s.prs[existing].weight_kg < weight) {
        const updated = [...s.prs];
        updated[existing] = pr;
        return { prs: updated };
      }
      if (existing >= 0) return s;
      return { prs: [...s.prs, pr] };
    });
    const s = get();
    persistPlan(s.ownerId, s.weeklyPlan, s.prs, (message) => set({ lastError: message }));
  },

  removePR: (id) => {
    set((s) => ({ prs: s.prs.filter((p) => p.id !== id) }));
    const s = get();
    persistPlan(s.ownerId, s.weeklyPlan, s.prs, (message) => set({ lastError: message }));
  },

  getPRForExercise: (exerciseName) =>
    get().prs.find((p) => p.exercise_name.toLowerCase() === exerciseName.toLowerCase()),
}));
