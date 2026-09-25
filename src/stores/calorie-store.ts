'use client';
import { create } from 'zustand';
import type { DailyNutrition, FavoriteFood, FoodItem, FoodLog, MealType, QuantityUnit } from '@/lib/types';
import { FOOD_DATABASE } from '@/lib/constants/food-database';
import { generateId } from '@/lib/utils';
import { calculateDailyNutrition, calculateMealNutrition, summarizeFoodLogs } from '@/lib/calculations/nutrition';
import type { MealNutrition } from '@/lib/calculations/nutrition';
import { withoutKeys } from '@/lib/repositories/base';
import { searchFoods } from '@/lib/nutrition/food-search';
import {
  addFavorite as addFavoriteRow,
  addFoodLog as addFoodLogRow,
  listAllFoodLogs,
  listCustomFoods,
  listFavorites,
  removeFavorite as removeFavoriteRow,
  removeFoodLog as removeFoodLogRow,
  saveCustomFood,
  updateFoodLog as updateFoodLogRow,
} from '@/lib/repositories/nutrition-repository';
import { writeThrough } from './write-through';

interface CalorieState {
  foodItems: FoodItem[];
  foodLogs: FoodLog[];
  favorites: FavoriteFood[];
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
  addFoodItem: (item: Omit<FoodItem, 'id' | 'created_at'>) => FoodItem;
  addFoodLog: (log: Omit<FoodLog, 'id' | 'created_at'>) => void;
  removeFoodLog: (id: string) => void;
  /** Edit quantity/meal/food of a log; nutrition must be recomputed by the caller. */
  updateFoodLog: (id: string, updates: Partial<FoodLog>) => void;
  /** Re-log an entry as new (new id, same snapshot basis). */
  duplicateFoodLog: (id: string) => void;
  getLogsForDate: (date: string) => FoodLog[];
  getLogsByMealType: (date: string, mealType: MealType) => FoodLog[];
  getDailySummary: (date: string) => { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number | null; sodium_mg: number | null };
  getDailyNutrition: (date: string, targets: { calories: number; protein_g: number; carbs_g: number; fat_g: number }) => DailyNutrition;
  getMealNutrition: (date: string, mealType: MealType) => MealNutrition;
  searchFoodItems: (query: string) => FoodItem[];
  getRecentFoods: () => FoodItem[];
  getFavoriteFoods: () => FoodItem[];
  isFavorite: (foodId: string) => boolean;
  toggleFavorite: (foodId: string) => void;
  /**
   * Phase 10.5: cross-page repeat intent (dashboard "Repeat Last" → food
   * modal prefill). In-memory only, consumed once by the calories page.
   * Review-before-save is mandatory — this never logs by itself.
   */
  repeatRequest: RepeatRequest | null;
  requestRepeat: (request: RepeatRequest) => void;
  clearRepeat: () => void;
}

/** Prefill for repeating a previous log (food + quantity + meal). */
export interface RepeatRequest {
  foodItemId: string;
  quantity: number | null;
  unit: QuantityUnit | null;
  meal: MealType;
}

/** Build a repeat prefill from a previous log (pure; review still required). */
export function repeatRequestFromLog(log: FoodLog): RepeatRequest {
  return {
    foodItemId: log.food_item_id,
    quantity: log.quantity ?? null,
    unit: log.quantity_unit ?? null,
    meal: log.meal_type,
  };
}

const initializeFoodItems = (): FoodItem[] =>
  FOOD_DATABASE.map((item, i) => ({
    ...item,
    id: `food-${i}`,
    created_at: new Date().toISOString(),
    created_by: null,
  }));

export const useCalorieStore = create<CalorieState>()((set, get) => ({
  foodItems: initializeFoodItems(),
  foodLogs: [],
  favorites: [],
  ownerId: null,
  ready: false,
  lastError: null,
  repeatRequest: null,
  requestRepeat: (request) => set({ repeatRequest: request }),
  clearRepeat: () => set({ repeatRequest: null }),

  load: async (ownerId) => {
    if (get().ownerId === ownerId && get().ready) return;
    set({ ownerId });
    try {
      const [customs, logs, favorites] = await Promise.all([
        listCustomFoods(ownerId),
        listAllFoodLogs(ownerId),
        listFavorites(ownerId),
      ]);
      set({ foodItems: [...initializeFoodItems(), ...customs], foodLogs: logs, favorites, ready: true, lastError: null });
    } catch (error) {
      set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load your food logs.' });
    }
  },

  addFoodItem: (item) => {
    const newItem: FoodItem = { ...item, id: generateId(), created_at: new Date().toISOString() };
    set((s) => ({ foodItems: [...s.foodItems, newItem] }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(saveCustomFood(ownerId, newItem), 'food', (message) =>
        set({ lastError: message })
      );
    }
    return newItem;
  },

  addFoodLog: (log) => {
    const newLog: FoodLog = { ...log, id: generateId(), created_at: new Date().toISOString() };
    set((s) => ({ foodLogs: [...s.foodLogs, newLog] }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(addFoodLogRow(ownerId, newLog), 'food log', (message) =>
        set({ lastError: message })
      );
    }
  },

  removeFoodLog: (id) => {
    set((s) => ({ foodLogs: s.foodLogs.filter((l) => l.id !== id) }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(removeFoodLogRow(ownerId, id), 'food log', (message) =>
        set({ lastError: message })
      );
    }
  },

  updateFoodLog: (id, updates) => {
    set((s) => ({
      foodLogs: s.foodLogs.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(updateFoodLogRow(ownerId, id, updates), 'food log', (message) =>
        set({ lastError: message })
      );
    }
  },

  duplicateFoodLog: (id) => {
    const source = get().foodLogs.find((l) => l.id === id);
    if (!source) return;
    get().addFoodLog(withoutKeys(source, 'id', 'created_at'));
  },

  getLogsForDate: (date) => get().foodLogs.filter((l) => l.date === date),

  getLogsByMealType: (date, mealType) =>
    get().foodLogs.filter((l) => l.date === date && l.meal_type === mealType),

  getDailySummary: (date) => {
    const logs = get().foodLogs.filter((l) => l.date === date);
    const base = summarizeFoodLogs(logs);
    return {
      ...base,
      fiber_g: logs.reduce((s, l) => s + (l.fiber_g ?? 0), 0),
      sugar_g: logs.some((l) => l.sugar_g != null) ? logs.reduce((s, l) => s + (l.sugar_g ?? 0), 0) : null,
      sodium_mg: logs.some((l) => l.sodium_mg != null) ? logs.reduce((s, l) => s + (l.sodium_mg ?? 0), 0) : null,
    };
  },

  getDailyNutrition: (date, targets) =>
    calculateDailyNutrition(get().foodLogs, date, targets),

  getMealNutrition: (date, mealType) =>
    calculateMealNutrition(
      get().foodLogs.filter((l) => l.date === date),
      mealType
    ),

  searchFoodItems: (query) => searchFoods(get().foodItems, query).map((s) => s.food),

  getRecentFoods: () => {
    const logs = get().foodLogs;
    const items = get().foodItems;
    const recentIds = [...new Set(logs.slice(-20).map((l) => l.food_item_id))];
    return recentIds.map((id) => items.find((f) => f.id === id)).filter(Boolean) as FoodItem[];
  },

  getFavoriteFoods: () => {
    const items = get().foodItems;
    const favIds = new Set(get().favorites.map((f) => f.food_id));
    return items.filter((f) => favIds.has(f.id));
  },

  isFavorite: (foodId) => get().favorites.some((f) => f.food_id === foodId),

  toggleFavorite: (foodId) => {
    const ownerId = get().ownerId;
    const existing = get().favorites.find((f) => f.food_id === foodId);
    if (existing) {
      set((s) => ({ favorites: s.favorites.filter((f) => f.id !== existing.id) }));
      if (ownerId) {
        writeThrough(removeFavoriteRow(ownerId, existing.id), 'favorite', (message) =>
          set({ lastError: message })
        );
      }
      return;
    }
    const favorite: FavoriteFood = {
      id: generateId(),
      user_id: ownerId ?? '',
      food_id: foodId,
      created_at: new Date().toISOString(),
    };
    set((s) => ({ favorites: [...s.favorites, favorite] }));
    if (ownerId) {
      writeThrough(addFavoriteRow(ownerId, favorite), 'favorite', (message) =>
        set({ lastError: message })
      );
    }
  },
}));
