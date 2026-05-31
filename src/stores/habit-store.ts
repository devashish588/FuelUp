'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Habit, HabitLog } from '@/lib/types';
import { DEFAULT_HABITS } from '@/lib/constants';
import { generateId, toDateString, calculateStreak } from '@/lib/utils';

interface HabitState {
  habits: Habit[];
  habitLogs: HabitLog[];
  initDefaultHabits: () => void;
  addHabit: (habit: Pick<Habit, 'name' | 'icon' | 'color' | 'target_value' | 'unit'>) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  removeHabit: (id: string) => void;
  logHabit: (habitId: string, date: string, value: number) => void;
  getLogsForDate: (date: string) => HabitLog[];
  getLogForHabit: (habitId: string, date: string) => HabitLog | undefined;
  getStreak: (habitId: string) => number;
  getCompletionRate: (habitId: string, days: number) => number;
  getHabitLogsInRange: (habitId: string, startDate: string, endDate: string) => HabitLog[];
}

export const useHabitStore = create<HabitState>()(
  persist(
    (set, get) => ({
      habits: [],
      habitLogs: [],

      initDefaultHabits: () => {
        const state = get();
        if (state.habits.length > 0) return;
        const now = new Date().toISOString();
        const defaults: Habit[] = DEFAULT_HABITS.map((h, i) => ({
          ...h, id: `habit-${i}`, user_id: '', frequency: 'daily' as const,
          is_active: true, sort_order: i, created_at: now, updated_at: now,
        }));
        set({ habits: defaults });
      },

      addHabit: (habit) => {
        const now = new Date().toISOString();
        const newHabit: Habit = {
          ...habit, id: generateId(), user_id: '', frequency: 'daily',
          is_default: false, is_active: true, sort_order: get().habits.length,
          created_at: now, updated_at: now,
        };
        set((s) => ({ habits: [...s.habits, newHabit] }));
      },

      updateHabit: (id, updates) =>
        set((s) => ({
          habits: s.habits.map((h) => h.id === id ? { ...h, ...updates, updated_at: new Date().toISOString() } : h),
        })),

      removeHabit: (id) =>
        set((s) => ({
          habits: s.habits.filter((h) => h.id !== id),
          habitLogs: s.habitLogs.filter((l) => l.habit_id !== id),
        })),

      logHabit: (habitId, date, value) => {
        set((s) => {
          const habit = s.habits.find((h) => h.id === habitId);
          const existing = s.habitLogs.findIndex((l) => l.habit_id === habitId && l.date === date);
          const completed = habit ? value >= habit.target_value : false;
          const log: HabitLog = {
            id: existing >= 0 ? s.habitLogs[existing].id : generateId(),
            habit_id: habitId, user_id: '', date, value, completed, notes: '',
            created_at: new Date().toISOString(),
          };
          if (existing >= 0) {
            const updated = [...s.habitLogs];
            updated[existing] = log;
            return { habitLogs: updated };
          }
          return { habitLogs: [...s.habitLogs, log] };
        });
      },

      getLogsForDate: (date) => get().habitLogs.filter((l) => l.date === date),

      getLogForHabit: (habitId, date) =>
        get().habitLogs.find((l) => l.habit_id === habitId && l.date === date),

      getStreak: (habitId) => {
        const completedDates = get().habitLogs
          .filter((l) => l.habit_id === habitId && l.completed)
          .map((l) => l.date);
        return calculateStreak(completedDates);
      },

      getCompletionRate: (habitId, days) => {
        const today = toDateString();
        const logs = get().habitLogs.filter(
          (l) => l.habit_id === habitId && l.completed
        );
        const completed = logs.length;
        return days > 0 ? Math.round((completed / days) * 100) : 0;
      },

      getHabitLogsInRange: (habitId, startDate, endDate) =>
        get().habitLogs.filter(
          (l) => l.habit_id === habitId && l.date >= startDate && l.date <= endDate
        ),
    }),
    { name: 'fuelup-habits' }
  )
);
