'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FoodItem, FoodLog, MealType } from '@/lib/types';
import { FOOD_DATABASE } from '@/lib/constants/food-database';
import { generateId, toDateString } from '@/lib/utils';

interface CalorieState {
  foodItems: FoodItem[];
  foodLogs: FoodLog[];
  addFoodItem: (item: Omit<FoodItem, 'id' | 'created_at'>) => FoodItem;
  addFoodLog: (log: Omit<FoodLog, 'id' | 'created_at'>) => void;
  removeFoodLog: (id: string) => void;
  getLogsForDate: (date: string) => FoodLog[];
  getLogsByMealType: (date: string, mealType: MealType) => FoodLog[];
  getDailySummary: (date: string) => { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  searchFoodItems: (query: string) => FoodItem[];
  getRecentFoods: () => FoodItem[];
}

const initializeFoodItems = (): FoodItem[] =>
  FOOD_DATABASE.map((item, i) => ({
    ...item,
    id: `food-${i}`,
    created_at: new Date().toISOString(),
    created_by: null,
  }));

export const useCalorieStore = create<CalorieState>()(
  persist(
    (set, get) => ({
      foodItems: initializeFoodItems(),
      foodLogs: [],

      addFoodItem: (item) => {
        const newItem: FoodItem = { ...item, id: generateId(), created_at: new Date().toISOString() };
        set((s) => ({ foodItems: [...s.foodItems, newItem] }));
        return newItem;
      },

      addFoodLog: (log) => {
        const newLog: FoodLog = { ...log, id: generateId(), created_at: new Date().toISOString() };
        set((s) => ({ foodLogs: [...s.foodLogs, newLog] }));
      },

      removeFoodLog: (id) =>
        set((s) => ({ foodLogs: s.foodLogs.filter((l) => l.id !== id) })),

      getLogsForDate: (date) =>
        get().foodLogs.filter((l) => l.date === date),

      getLogsByMealType: (date, mealType) =>
        get().foodLogs.filter((l) => l.date === date && l.meal_type === mealType),

      getDailySummary: (date) => {
        const logs = get().foodLogs.filter((l) => l.date === date);
        return logs.reduce(
          (acc, l) => ({
            calories: acc.calories + l.calories,
            protein_g: acc.protein_g + l.protein_g,
            carbs_g: acc.carbs_g + l.carbs_g,
            fat_g: acc.fat_g + l.fat_g,
          }),
          { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
        );
      },

      searchFoodItems: (query) => {
        const q = query.toLowerCase();
        return get().foodItems.filter(
          (f) => f.name.toLowerCase().includes(q) || f.brand.toLowerCase().includes(q)
        ).slice(0, 20);
      },

      getRecentFoods: () => {
        const logs = get().foodLogs;
        const items = get().foodItems;
        const recentIds = [...new Set(logs.slice(-20).map((l) => l.food_item_id))];
        return recentIds.map((id) => items.find((f) => f.id === id)).filter(Boolean) as FoodItem[];
      },
    }),
    { name: 'fuelup-calories' }
  )
);
