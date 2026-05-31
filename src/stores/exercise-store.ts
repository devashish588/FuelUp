'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Exercise, Workout, WorkoutExercise, ExerciseSet } from '@/lib/types';
import { EXERCISE_DATABASE } from '@/lib/constants/exercise-database';
import { generateId } from '@/lib/utils';

interface ExerciseState {
  exercises: Exercise[];
  workouts: Workout[];
  activeWorkout: Workout | null;
  startWorkout: (name: string) => void;
  finishWorkout: () => void;
  cancelWorkout: () => void;
  addExerciseToWorkout: (exerciseId: string) => void;
  addSetToExercise: (workoutExerciseId: string, set: Omit<ExerciseSet, 'id' | 'workout_exercise_id' | 'created_at'>) => void;
  updateSet: (workoutExerciseId: string, setId: string, updates: Partial<ExerciseSet>) => void;
  removeSet: (workoutExerciseId: string, setId: string) => void;
  removeExerciseFromWorkout: (workoutExerciseId: string) => void;
  getWorkoutsForDate: (date: string) => Workout[];
  getExerciseById: (id: string) => Exercise | undefined;
  addCustomExercise: (exercise: Omit<Exercise, 'id' | 'created_at' | 'created_by'>) => Exercise;
}

const initExercises = (): Exercise[] =>
  EXERCISE_DATABASE.map((e, i) => ({ ...e, id: `ex-${i}`, created_at: new Date().toISOString(), created_by: null }));

export const useExerciseStore = create<ExerciseState>()(
  persist(
    (set, get) => ({
      exercises: initExercises(),
      workouts: [],
      activeWorkout: null,

      startWorkout: (name) => {
        const now = new Date().toISOString();
        set({
          activeWorkout: {
            id: generateId(), user_id: '', name, date: now.split('T')[0],
            start_time: now, end_time: null, duration_minutes: null,
            calories_burned: null, notes: '', exercises: [], created_at: now,
          },
        });
      },

      finishWorkout: () => {
        const active = get().activeWorkout;
        if (!active) return;
        const now = new Date();
        const start = new Date(active.start_time);
        const duration = Math.round((now.getTime() - start.getTime()) / 60000);
        const finished: Workout = { ...active, end_time: now.toISOString(), duration_minutes: duration };
        set((s) => ({ workouts: [...s.workouts, finished], activeWorkout: null }));
      },

      cancelWorkout: () => set({ activeWorkout: null }),

      addExerciseToWorkout: (exerciseId) => {
        set((s) => {
          if (!s.activeWorkout) return s;
          const exercise = s.exercises.find((e) => e.id === exerciseId);
          const we: WorkoutExercise = {
            id: generateId(), workout_id: s.activeWorkout.id, exercise_id: exerciseId,
            exercise, sort_order: s.activeWorkout.exercises.length, notes: '', sets: [],
            created_at: new Date().toISOString(),
          };
          return { activeWorkout: { ...s.activeWorkout, exercises: [...s.activeWorkout.exercises, we] } };
        });
      },

      addSetToExercise: (workoutExerciseId, setData) => {
        set((s) => {
          if (!s.activeWorkout) return s;
          const exercises = s.activeWorkout.exercises.map((we) => {
            if (we.id !== workoutExerciseId) return we;
            const newSet: ExerciseSet = {
              ...setData, id: generateId(), workout_exercise_id: workoutExerciseId,
              created_at: new Date().toISOString(),
            };
            return { ...we, sets: [...we.sets, newSet] };
          });
          return { activeWorkout: { ...s.activeWorkout, exercises } };
        });
      },

      updateSet: (workoutExerciseId, setId, updates) => {
        set((s) => {
          if (!s.activeWorkout) return s;
          const exercises = s.activeWorkout.exercises.map((we) => {
            if (we.id !== workoutExerciseId) return we;
            return { ...we, sets: we.sets.map((st) => st.id === setId ? { ...st, ...updates } : st) };
          });
          return { activeWorkout: { ...s.activeWorkout, exercises } };
        });
      },

      removeSet: (workoutExerciseId, setId) => {
        set((s) => {
          if (!s.activeWorkout) return s;
          const exercises = s.activeWorkout.exercises.map((we) => {
            if (we.id !== workoutExerciseId) return we;
            return { ...we, sets: we.sets.filter((st) => st.id !== setId) };
          });
          return { activeWorkout: { ...s.activeWorkout, exercises } };
        });
      },

      removeExerciseFromWorkout: (workoutExerciseId) => {
        set((s) => {
          if (!s.activeWorkout) return s;
          return { activeWorkout: { ...s.activeWorkout, exercises: s.activeWorkout.exercises.filter((we) => we.id !== workoutExerciseId) } };
        });
      },

      getWorkoutsForDate: (date) => get().workouts.filter((w) => w.date === date),

      getExerciseById: (id) => get().exercises.find((e) => e.id === id),

      addCustomExercise: (exercise) => {
        const newEx: Exercise = { ...exercise, id: generateId(), created_at: new Date().toISOString(), created_by: null };
        set((s) => ({ exercises: [...s.exercises, newEx] }));
        return newEx;
      },
    }),
    { name: 'fuelup-exercise' }
  )
);
