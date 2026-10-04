'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Exercise, Workout, WorkoutExercise, ExerciseSet } from '@/lib/types';
import { EXERCISE_DATABASE } from '@/lib/constants/exercise-database';
import { summarizeExerciseSessions, type SessionSummary } from '@/lib/exercise/progression';
import { generateId } from '@/lib/utils';
import { calculateWorkoutDurationMinutes } from '@/lib/calculations/workout';
import { LOCAL_OWNER_ID, PERSIST_VERSION, STORAGE_KEYS } from '@/config/app';
import {
  listCustomExercises,
  listWorkouts,
  saveCustomExercise,
  saveFinishedWorkout,
} from '@/lib/repositories/workout-repository';
import { writeThrough } from './write-through';

interface ExerciseState {
  exercises: Exercise[];
  workouts: Workout[];
  activeWorkout: (Workout & { restTimers?: Record<string, { remaining: number; original: number; running: boolean; startTime?: number }> }) | null;
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
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
  /** Newest-first usable session summaries for one exercise (read-only). */
  getExerciseSessions: (exerciseId: string) => SessionSummary[];
  /** True when the active workout already contains this exercise (dup guard). */
  hasExerciseInWorkout: (exerciseId: string) => boolean;
  /** Rest timer actions */
  startRest: (workoutExerciseId: string, seconds: number) => void;
  pauseRest: (workoutExerciseId: string) => void;
  resumeRest: (workoutExerciseId: string) => void;
  resetRest: (workoutExerciseId: string) => void;
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
      ownerId: null,
      ready: false,
      lastError: null,

      load: async (ownerId) => {
        if (get().ownerId === ownerId && get().ready) return;
        set({ ownerId });
        try {
          const [customs, workouts] = await Promise.all([
            listCustomExercises(ownerId),
            listWorkouts(ownerId),
          ]);
          set({ exercises: [...initExercises(), ...customs], workouts, ready: true, lastError: null });
        } catch (error) {
          set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load your workouts.' });
        }
      },

      startWorkout: (name) => {
        const now = new Date().toISOString();
        set({
          activeWorkout: {
            id: generateId(),
            user_id: LOCAL_OWNER_ID,
            name,
            date: now.split('T')[0],
            start_time: now,
            end_time: null,
            duration_minutes: null,
            calories_burned: null,
            notes: '',
            exercises: [],
            restTimers: {},
            created_at: now,
          },
        });
      },

      finishWorkout: () => {
        const active = get().activeWorkout;
        if (!active) return;
        const now = new Date().toISOString();
        const duration = calculateWorkoutDurationMinutes(active.start_time, now);
        const finished: Workout = { ...active, end_time: now, duration_minutes: duration };
        set((s) => ({ workouts: [...s.workouts, finished], activeWorkout: null }));
        const ownerId = get().ownerId;
        if (ownerId) {
          const setsByExercise: Record<string, ExerciseSet[]> = {};
          for (const we of finished.exercises) setsByExercise[we.id] = we.sets;
          writeThrough(
            saveFinishedWorkout(ownerId, { workout: finished, exercises: finished.exercises, setsByExercise }),
            'workout',
            (message) => set({ lastError: message })
          );
        }
      },

      cancelWorkout: () => set({ activeWorkout: null }),

      startRest: (workoutExerciseId: string, seconds: number) => {
        set((s) => {
          if (!s.activeWorkout) return s;
          // workoutExerciseId is already the ID we need for the restTimers map
          return {
            activeWorkout: {
              ...s.activeWorkout,
              restTimers: {
                ...s.activeWorkout.restTimers,
                [workoutExerciseId]: { remaining: seconds, original: seconds, running: true, startTime: Date.now() },
              },
            },
          };
        });
      },

      pauseRest: (workoutExerciseId: string) => {
        set((s) => {
          if (!s.activeWorkout || !s.activeWorkout.restTimers?.[workoutExerciseId]?.running) return s;
          const timer = s.activeWorkout.restTimers[workoutExerciseId];
          const elapsed = Date.now() - (timer.startTime ?? Date.now());
          return {
            activeWorkout: {
              ...s.activeWorkout,
              restTimers: {
                ...s.activeWorkout.restTimers,
                [workoutExerciseId]: { ...timer, remaining: Math.max(0, timer.remaining - elapsed), running: false, startTime: undefined },
              },
            },
          };
        });
      },

      resumeRest: (workoutExerciseId: string) => {
        set((s) => {
          if (!s.activeWorkout || !s.activeWorkout.restTimers?.[workoutExerciseId] || s.activeWorkout.restTimers[workoutExerciseId].running) return s;
          return {
            activeWorkout: {
              ...s.activeWorkout,
              restTimers: {
                ...s.activeWorkout.restTimers,
                [workoutExerciseId]: { ...s.activeWorkout.restTimers[workoutExerciseId], running: true, startTime: Date.now() },
              },
            },
          };
        });
      },

      resetRest: (workoutExerciseId: string) => {
        set((s) => {
          if (!s.activeWorkout || !s.activeWorkout.restTimers?.[workoutExerciseId]) return s;
          const timer = s.activeWorkout.restTimers[workoutExerciseId];
          return {
            activeWorkout: {
              ...s.activeWorkout,
              restTimers: {
                ...s.activeWorkout.restTimers,
                [workoutExerciseId]: { remaining: timer.original, original: timer.original, running: false, startTime: undefined },
              },
            },
          };
        });
      },

      addExerciseToWorkout: (exerciseId) => {
        set((s) => {
          if (!s.activeWorkout) return s;
          // Wiki MVP: adding twice (double-tap, re-open) must not duplicate.
          if (s.activeWorkout.exercises.some((we) => we.exercise_id === exerciseId)) return s;
          const exercise = s.exercises.find((e) => e.id === exerciseId);
          const we: WorkoutExercise = {
            id: generateId(),
            workout_id: s.activeWorkout.id,
            exercise_id: exerciseId,
            exercise,
            sort_order: s.activeWorkout.exercises.length,
            notes: '',
            sets: [],
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
              ...setData,
              id: generateId(),
              workout_exercise_id: workoutExerciseId,
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
            return { ...we, sets: we.sets.map((st) => (st.id === setId ? { ...st, ...updates } : st)) };
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
          return {
            activeWorkout: {
              ...s.activeWorkout,
              exercises: s.activeWorkout.exercises.filter((we) => we.id !== workoutExerciseId),
            },
          };
        });
      },

      getWorkoutsForDate: (date) => get().workouts.filter((w) => w.date === date),

      getExerciseSessions: (exerciseId) => summarizeExerciseSessions(get().workouts, exerciseId),

      getExerciseById: (id) => get().exercises.find((e) => e.id === id),

      hasExerciseInWorkout: (exerciseId) =>
        get().activeWorkout?.exercises.some((we) => we.exercise_id === exerciseId) ?? false,

      addCustomExercise: (exercise) => {
        const newEx: Exercise = {
          ...exercise,
          id: generateId(),
          created_at: new Date().toISOString(),
          created_by: null,
        };
        set((s) => ({ exercises: [...s.exercises, newEx] }));
        const ownerId = get().ownerId;
        if (ownerId) {
          writeThrough(saveCustomExercise(ownerId, newEx), 'exercise', (message) =>
            set({ lastError: message })
          );
        }
        return newEx;
      },
    }),
    {
      name: STORAGE_KEYS.exercise,
      version: PERSIST_VERSION,
      // Finished workouts + custom exercises live in IndexedDB; only the
      // in-progress draft (pure UI state) stays in localStorage.
      partialize: (s) => ({ activeWorkout: s.activeWorkout }),
    }
  )
);
