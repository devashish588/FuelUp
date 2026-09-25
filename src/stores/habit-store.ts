'use client';
import { create } from 'zustand';
import type { Habit, HabitLog } from '@/lib/types';
import { DEFAULT_HABITS } from '@/lib/constants';
import { generateId } from '@/lib/utils';
import { calculateCompletionRate, calculateStreak } from '@/lib/calculations/habits';
import { LOCAL_OWNER_ID } from '@/config/app';
import {
  createHabit as createHabitRow,
  listAllHabitLogs,
  listHabits,
  removeHabit as removeHabitRow,
  updateHabit as updateHabitRow,
  upsertHabitLog,
} from '@/lib/repositories/habit-repository';
import { writeThrough } from './write-through';

interface HabitState {
  habits: Habit[];
  habitLogs: HabitLog[];
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
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

/**
 * Phase 10.5: locate the water habit for one-tap logging. Prefers an
 * explicit "Water" habit, falls back to the first glasses-unit habit.
 * Pure — the existing habit/log/outbox path does the persistence.
 */
export function findWaterHabit(habits: Habit[]): Habit | undefined {
  return (
    habits.find((h) => h.name.toLowerCase() === 'water') ??
    habits.find((h) => h.unit.toLowerCase() === 'glasses')
  );
}

function defaultHabits(): Habit[] {
  const now = new Date().toISOString();
  return DEFAULT_HABITS.map((h, i) => ({
    ...h,
    id: `habit-${i}`,
    user_id: LOCAL_OWNER_ID,
    frequency: 'daily' as const,
    is_active: true,
    sort_order: i,
    created_at: now,
    updated_at: now,
  }));
}

export const useHabitStore = create<HabitState>()((set, get) => ({
  habits: [],
  habitLogs: [],
  ownerId: null,
  ready: false,
  lastError: null,

  load: async (ownerId) => {
    if (get().ownerId === ownerId && get().ready) return;
    set({ ownerId });
    try {
      const [habits, habitLogs] = await Promise.all([
        listHabits(ownerId),
        listAllHabitLogs(ownerId),
      ]);
      set({ habits, habitLogs, ready: true, lastError: null });
    } catch (error) {
      set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load your habits.' });
    }
  },

  initDefaultHabits: () => {
    const state = get();
    if (state.habits.length > 0) return;
    const defaults = defaultHabits();
    set({ habits: defaults });
    const ownerId = get().ownerId;
    if (ownerId) {
      for (const habit of defaults) {
        writeThrough(createHabitRow(ownerId, habit), 'habit', (message) =>
          set({ lastError: message })
        );
      }
    }
  },

  addHabit: (habit) => {
    const now = new Date().toISOString();
    const newHabit: Habit = {
      ...habit,
      id: generateId(),
      user_id: LOCAL_OWNER_ID,
      frequency: 'daily',
      is_default: false,
      is_active: true,
      sort_order: get().habits.length,
      created_at: now,
      updated_at: now,
    };
    set((s) => ({ habits: [...s.habits, newHabit] }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(createHabitRow(ownerId, newHabit), 'habit', (message) =>
        set({ lastError: message })
      );
    }
  },

  updateHabit: (id, updates) => {
    set((s) => ({
      habits: s.habits.map((h) =>
        h.id === id ? { ...h, ...updates, updated_at: new Date().toISOString() } : h
      ),
    }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(updateHabitRow(ownerId, id, updates), 'habit', (message) =>
        set({ lastError: message })
      );
    }
  },

  removeHabit: (id) => {
    set((s) => ({
      habits: s.habits.filter((h) => h.id !== id),
      habitLogs: s.habitLogs.filter((l) => l.habit_id !== id),
    }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(removeHabitRow(ownerId, id), 'habit', (message) =>
        set({ lastError: message })
      );
    }
  },

  logHabit: (habitId, date, value) => {
    let saved: HabitLog | null = null;
    set((s) => {
      const habit = s.habits.find((h) => h.id === habitId);
      const existing = s.habitLogs.findIndex((l) => l.habit_id === habitId && l.date === date);
      const completed = habit ? value >= habit.target_value : false;
      const log: HabitLog = {
        id: existing >= 0 ? s.habitLogs[existing].id : generateId(),
        habit_id: habitId,
        user_id: LOCAL_OWNER_ID,
        date,
        value,
        completed,
        notes: '',
        created_at: new Date().toISOString(),
      };
      saved = log;
      if (existing >= 0) {
        const updated = [...s.habitLogs];
        updated[existing] = log;
        return { habitLogs: updated };
      }
      return { habitLogs: [...s.habitLogs, log] };
    });
    const ownerId = get().ownerId;
    if (ownerId && saved) {
      const log: HabitLog = saved;
      writeThrough(upsertHabitLog(ownerId, log), 'habit log', (message) =>
        set({ lastError: message })
      );
    }
  },

  getLogsForDate: (date) => get().habitLogs.filter((l) => l.date === date),

  getLogForHabit: (habitId, date) =>
    get().habitLogs.find((l) => l.habit_id === habitId && l.date === date),

  getStreak: (habitId) => {
    const completedDates = get()
      .habitLogs.filter((l) => l.habit_id === habitId && l.completed)
      .map((l) => l.date);
    return calculateStreak(completedDates);
  },

  getCompletionRate: (habitId, days) => {
    const completedDates = get()
      .habitLogs.filter((l) => l.habit_id === habitId && l.completed)
      .map((l) => l.date);
    return calculateCompletionRate(completedDates, days);
  },

  getHabitLogsInRange: (habitId, startDate, endDate) =>
    get().habitLogs.filter(
      (l) => l.habit_id === habitId && l.date >= startDate && l.date <= endDate
    ),
}));
