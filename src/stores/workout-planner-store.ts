'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateId } from '@/lib/utils';

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
  addExerciseToDay: (day: DayOfWeek, exerciseName: string, exerciseId: string, sets: number, reps: string) => void;
  removeExerciseFromDay: (day: DayOfWeek, exerciseId: string) => void;
  updateDayLabel: (day: DayOfWeek, label: string) => void;
  addPR: (exerciseName: string, exerciseId: string, weight: number, reps: number, date: string) => void;
  removePR: (id: string) => void;
  getPRForExercise: (exerciseName: string) => PR | undefined;
}

const DEFAULT_PLAN: DayPlan[] = [
  { day: 'monday', label: 'Push Day', exercises: [] },
  { day: 'tuesday', label: 'Pull Day', exercises: [] },
  { day: 'wednesday', label: 'Legs', exercises: [] },
  { day: 'thursday', label: 'Push Day', exercises: [] },
  { day: 'friday', label: 'Pull Day', exercises: [] },
  { day: 'saturday', label: 'Legs / Arms', exercises: [] },
  { day: 'sunday', label: 'Rest Day', exercises: [] },
];

export const useWorkoutPlannerStore = create<WorkoutPlannerState>()(
  persist(
    (set, get) => ({
      weeklyPlan: DEFAULT_PLAN,
      prs: [],

      addExerciseToDay: (day, exerciseName, exerciseId, sets, reps) => {
        set((s) => ({
          weeklyPlan: s.weeklyPlan.map(p =>
            p.day === day
              ? { ...p, exercises: [...p.exercises, { id: generateId(), exercise_id: exerciseId, exercise_name: exerciseName, sets, reps, notes: '' }] }
              : p
          ),
        }));
      },

      removeExerciseFromDay: (day, id) => {
        set((s) => ({
          weeklyPlan: s.weeklyPlan.map(p =>
            p.day === day
              ? { ...p, exercises: p.exercises.filter(e => e.id !== id) }
              : p
          ),
        }));
      },

      updateDayLabel: (day, label) => {
        set((s) => ({
          weeklyPlan: s.weeklyPlan.map(p => p.day === day ? { ...p, label } : p),
        }));
      },

      addPR: (exerciseName, exerciseId, weight, reps, date) => {
        const pr: PR = { id: generateId(), exercise_id: exerciseId, exercise_name: exerciseName, weight_kg: weight, reps, date, notes: '' };
        set((s) => {
          // Replace existing PR if this is heavier
          const existing = s.prs.findIndex(p => p.exercise_name.toLowerCase() === exerciseName.toLowerCase());
          if (existing >= 0 && s.prs[existing].weight_kg < weight) {
            const updated = [...s.prs];
            updated[existing] = pr;
            return { prs: updated };
          }
          if (existing >= 0) return s;
          return { prs: [...s.prs, pr] };
        });
      },

      removePR: (id) => set((s) => ({ prs: s.prs.filter(p => p.id !== id) })),

      getPRForExercise: (exerciseName) =>
        get().prs.find(p => p.exercise_name.toLowerCase() === exerciseName.toLowerCase()),
    }),
    { name: 'fuelup-workout-planner' }
  )
);
