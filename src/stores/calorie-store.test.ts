// Store-level nutrition behavior: search relevance, recency, favorites.
// Pure in-memory paths (no owner needed) — sync/persistence covered by
// repository + engine tests.
import { beforeEach, describe, expect, it } from 'vitest';
import { useCalorieStore } from './calorie-store';
import { FOOD_DATABASE } from '@/lib/constants/food-database';

beforeEach(() => {
  useCalorieStore.setState({
    foodItems: FOOD_DATABASE.map((item, i) => ({
      ...item,
      id: `food-${i}`,
      created_at: new Date().toISOString(),
      created_by: null,
    })),
    foodLogs: [],
    favorites: [],
    ownerId: null,
    ready: true,
    lastError: null,
  });
});

function foodIdByName(name: string): string {
  const item = useCalorieStore.getState().foodItems.find((f) => f.name === name);
  if (!item) throw new Error(`seed food missing: ${name}`);
  return item.id;
}

describe('searchFoodItems', () => {
  const search = (q: string) => useCalorieStore.getState().searchFoodItems(q);

  it('matches case-insensitively and returns nothing for empty queries', () => {
    expect(search('CHICKEN').length).toBeGreaterThan(0);
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });

  it('finds Indian aliases (roti via chapati)', () => {
    const names = search('chapati').map((f) => f.name);
    expect(names.some((n) => n.toLowerCase().includes('roti'))).toBe(true);
  });

  it('matches categories and brands without crashing on nulls', () => {
    expect(search('legumes').length).toBeGreaterThan(0);
    // Every seed has brand '' — null-safe by construction; customs may omit.
    useCalorieStore.getState().addFoodItem({
      name: 'Brandless dal',
      brand: '',
      serving_size: 100,
      serving_unit: 'g',
      calories_per_serving: 120,
      protein_g: 8,
      carbs_g: 20,
      fat_g: 1,
      fiber_g: 5,
      barcode: null,
      is_custom: true,
      created_by: null,
    });
    expect(() => search('dal')).not.toThrow();
    expect(search('dal').length).toBeGreaterThan(0);
  });

  it('ranks name-prefix matches above brand/alias matches', () => {
    const results = search('egg');
    expect(results[0].name.toLowerCase()).toContain('egg');
  });

  it('returns an empty list when nothing matches', () => {
    expect(search('zzz-no-such-food')).toEqual([]);
  });
});

describe('getRecentFoods', () => {
  it('lists recently logged foods most-recent-first without duplicates', () => {
    const store = useCalorieStore.getState();
    const rice = foodIdByName('White Rice (cooked)');
    const egg = FOOD_DATABASE.findIndex((f) => f.name === 'Eggs (whole)');
    const eggId = `food-${egg}`;
    store.addFoodLog({ user_id: '', food_item_id: rice, date: '2026-09-22', meal_type: 'lunch', servings: 1, calories: 206, protein_g: 4.3, carbs_g: 45, fat_g: 0.4, notes: '' });
    store.addFoodLog({ user_id: '', food_item_id: eggId, date: '2026-09-22', meal_type: 'breakfast', servings: 2, calories: 144, protein_g: 12.6, carbs_g: 0.8, fat_g: 9.6, notes: '' });
    store.addFoodLog({ user_id: '', food_item_id: rice, date: '2026-09-22', meal_type: 'dinner', servings: 1, calories: 206, protein_g: 4.3, carbs_g: 45, fat_g: 0.4, notes: '' });
    const recent = useCalorieStore.getState().getRecentFoods();
    expect(recent.map((f) => f.id)).toEqual([rice, eggId]);
  });
});

describe('favorites', () => {
  it('toggles explicit favorites and resolves them to foods', () => {
    const store = useCalorieStore.getState();
    const rice = foodIdByName('White Rice (cooked)');
    expect(store.isFavorite(rice)).toBe(false);
    store.toggleFavorite(rice);
    expect(useCalorieStore.getState().isFavorite(rice)).toBe(true);
    expect(useCalorieStore.getState().getFavoriteFoods().map((f) => f.id)).toEqual([rice]);
    store.toggleFavorite(rice);
    expect(useCalorieStore.getState().isFavorite(rice)).toBe(false);
    expect(useCalorieStore.getState().getFavoriteFoods()).toEqual([]);
  });
});

describe('duplicateFoodLog', () => {
  it('re-logs an entry under a new id with identical nutrition', () => {
    const store = useCalorieStore.getState();
    const rice = foodIdByName('White Rice (cooked)');
    store.addFoodLog({ user_id: '', food_item_id: rice, date: '2026-09-22', meal_type: 'lunch', servings: 1.8, quantity: 180, quantity_unit: 'g', calories: 234, protein_g: 4.86, carbs_g: 50.4, fat_g: 0.54, notes: '' });
    const original = useCalorieStore.getState().foodLogs[0];
    store.duplicateFoodLog(original.id);
    const logs = useCalorieStore.getState().foodLogs;
    expect(logs).toHaveLength(2);
    expect(logs[1].id).not.toBe(original.id);
    expect(logs[1]).toMatchObject({ food_item_id: rice, quantity: 180, calories: 234 });
  });
});

describe('repeat request (Phase 10.5)', () => {
  it('stores and clears a cross-page repeat intent without logging', async () => {
    const { repeatRequestFromLog } = await import('./calorie-store');
    const store = useCalorieStore.getState();
    store.addFoodLog({ user_id: '', food_item_id: 'f-1', date: '2026-09-22', meal_type: 'dinner', servings: 2, quantity: 200, quantity_unit: 'g', calories: 300, protein_g: 10, carbs_g: 40, fat_g: 5, notes: '' });
    const log = useCalorieStore.getState().foodLogs[0];
    // Building the intent logs nothing by itself.
    expect(useCalorieStore.getState().foodLogs).toHaveLength(1);
    expect(repeatRequestFromLog(log)).toEqual({ foodItemId: 'f-1', quantity: 200, unit: 'g', meal: 'dinner' });
    store.requestRepeat(repeatRequestFromLog(log));
    expect(useCalorieStore.getState().repeatRequest).toMatchObject({ foodItemId: 'f-1', quantity: 200 });
    store.clearRepeat();
    expect(useCalorieStore.getState().repeatRequest).toBeNull();
  });

  it('maps legacy serving-only logs to a serving prefill', async () => {
    const { repeatRequestFromLog } = await import('./calorie-store');
    const store = useCalorieStore.getState();
    store.addFoodLog({ user_id: '', food_item_id: 'f-2', date: '2026-09-22', meal_type: 'lunch', servings: 1.5, calories: 200, protein_g: 5, carbs_g: 20, fat_g: 5, notes: '' });
    const log = useCalorieStore.getState().foodLogs[0];
    expect(repeatRequestFromLog(log)).toEqual({ foodItemId: 'f-2', quantity: null, unit: null, meal: 'lunch' });
  });
});
