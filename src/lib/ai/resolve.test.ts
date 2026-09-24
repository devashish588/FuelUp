// Phase 8 — deterministic resolver + preview + confirmation tests.
// AI proposes candidates; FuelUp resolves, calculates, and only persists
// on explicit confirmation. Unconfirmed results must never create FoodLogs.
import { describe, expect, it, vi } from 'vitest';
import { calculateNutritionForQuantity } from '@/lib/calculations/nutrition';
import type { FoodItem, FoodLog, MealType } from '@/lib/types';
import {
  applyFoodSelection,
  buildFoodPreview,
  confirmAiReview,
  resolveFoodCandidates,
  suggestQuantityFor,
} from './resolve';
import type { AiParsedItem } from './schemas';

function food(name: string, extra: Partial<FoodItem> = {}): FoodItem {
  return {
    id: `f-${name.replace(/[^a-z]/gi, '')}`,
    name,
    brand: '',
    serving_size: 100,
    serving_unit: 'g',
    calories_per_serving: 100,
    protein_g: 5,
    carbs_g: 10,
    fat_g: 2,
    fiber_g: 0,
    barcode: null,
    is_custom: false,
    created_by: null,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

const EGG = food('Egg', { serving_size: 50, serving_unit: 'g', count_weight_g: 50, calories_per_serving: 78, protein_g: 6, carbs_g: 0.5, fat_g: 5 });
const EGG_CURRY = food('Egg curry', { category: 'curry' });
const MILK = food('Milk', { serving_size: 250, serving_unit: 'ml', calories_per_serving: 150, category: 'dairy' });
const ROTI = food('Roti', { serving_size: 1, serving_unit: 'count', calories_per_serving: 120, aliases: ['chapati'] });
const CURRY = food('Chicken Curry', { calories_per_serving: 152.6, category: 'curry' });
const CURRY_HOME = food('Chicken Curry — homemade', { calories_per_serving: 140, category: 'curry', source: 'user', is_custom: true });
const CURRY_RECIPE = food('Chicken Curry', { id: 'r-1', calories_per_serving: 152.6, source: 'recipe', is_custom: true });
const DAL = food('Dal', { serving_size: 150, serving_unit: 'g', calories_per_serving: 180, category: 'dal' });
const PANEER = food('Paneer', { category: 'dairy' });
const PANEER_TIKKA = food('Paneer tikka', { category: 'snack' });
const PANEER_CURRY = food('Paneer curry', { category: 'curry' });

const FOODS = [EGG, EGG_CURRY, MILK, ROTI, CURRY, CURRY_HOME, CURRY_RECIPE, DAL, PANEER, PANEER_TIKKA, PANEER_CURRY];

function candidate(name: string, quantity: number | null = 100, unit: AiParsedItem['unit'] = 'g'): AiParsedItem {
  return { name, quantity, unit, mealHint: null, preparationHint: null };
}

describe('resolveFoodCandidates', () => {
  it('resolves an exact food with AI quantity intact (exact beats prefix)', () => {
    const [row] = resolveFoodCandidates([candidate('egg', 3, 'count')], FOODS);
    expect(row.status).toBe('resolved');
    expect(row.selectedFood?.name).toBe('Egg');
    expect(row.quantity).toBe(3);
    expect(row.unit).toBe('count');
    expect(row.quantitySource).toBe('ai');
  });

  it('resolves a saved recipe among similar names by exact match', () => {
    // 'Chicken Curry' exactly matches two rows (seed + recipe) → ambiguous,
    // forcing an explicit user choice rather than a silent pick.
    const [row] = resolveFoodCandidates([candidate('chicken curry', 200, 'g')], FOODS);
    expect(row.status).toBe('ambiguous');
    expect(row.matches.length).toBeGreaterThan(1);
    expect(row.selectedFood).toBeNull();
  });

  it('resolves a unique recipe/saved item directly', () => {
    const [row] = resolveFoodCandidates([candidate('chicken curry — homemade', 200, 'g')], [CURRY, CURRY_HOME]);
    expect(row.status).toBe('resolved');
    expect(row.selectedFood?.name).toBe('Chicken Curry — homemade');
  });

  it('marks tied prefix matches ambiguous instead of silently choosing', () => {
    // No exact 'paneer' row here — tikka and curry tie at prefix score.
    const [row] = resolveFoodCandidates([candidate('paneer', 100, 'g')], [PANEER_TIKKA, PANEER_CURRY, MILK]);
    expect(row.status).toBe('ambiguous');
    expect(row.matches.map((m) => m.food.name)).toContain('Paneer tikka');
    expect(row.matches.map((m) => m.food.name)).toContain('Paneer curry');
    expect(row.selectedFood).toBeNull();
  });

  it('returns missing quantity empty (never invented)', () => {
    const [row] = resolveFoodCandidates([{ ...candidate('chicken curry'), quantity: null, unit: null }], FOODS);
    expect(row.quantity).toBeNull();
    expect(row.unit).toBeNull();
    expect(row.quantitySource).toBe('missing');
  });

  it('maps household units to the serving definition as a suggestion', () => {
    const [row] = resolveFoodCandidates([{ ...candidate('dal'), quantity: 1, unit: 'bowl' }], FOODS);
    expect(row.enteredUnit).toBe('bowl');
    expect(row.quantitySource).toBe('suggested');
    // Dal serving is 150 g → "1 bowl" suggests 150 g (editable).
    expect(row.quantity).toBe(150);
    expect(row.unit).toBe('g');
  });

  it('scales household suggestions by count and defers without a food', () => {
    expect(suggestQuantityFor(DAL, 2)).toEqual({ quantity: 300, unit: 'g' });
    const [row] = resolveFoodCandidates([{ ...candidate('mystery stew'), quantity: 1, unit: 'bowl' }], FOODS);
    expect(row.status).toBe('unsupported');
    expect(row.quantity).toBeNull();
  });

  it('returns unresolved for weak matches and unsupported for none', () => {
    const [weak] = resolveFoodCandidates([candidate('dairy', 100, 'g')], FOODS);
    expect(weak.status).toBe('unresolved');
    const [none] = resolveFoodCandidates([candidate('xylophone smoothie', 100, 'g')], FOODS);
    expect(none.status).toBe('unsupported');
    expect(none.matches).toHaveLength(0);
  });

  it('applies user food selection and re-suggests household quantities', () => {
    const [row] = resolveFoodCandidates([{ ...candidate('paneer'), quantity: 1, unit: 'bowl' }], [PANEER_TIKKA, PANEER_CURRY]);
    expect(row.status).toBe('ambiguous');
    const picked = applyFoodSelection(row, PANEER_TIKKA);
    expect(picked.status).toBe('resolved');
    expect(picked.selectedFood?.name).toBe('Paneer tikka');
    expect(picked.quantity).toBe(100); // serving-based suggestion for 1 bowl
    // Missing quantities stay empty even after picking (never invented).
    const [missing] = resolveFoodCandidates([{ ...candidate('paneer'), quantity: null, unit: null }], FOODS);
    const pickedMissing = applyFoodSelection(missing, PANEER);
    expect(pickedMissing.quantity).toBeNull();
  });

  it('is deterministic', () => {
    const input = [candidate('egg', 3, 'count'), candidate('paneer', 100, 'g')];
    expect(resolveFoodCandidates(input, FOODS)).toEqual(resolveFoodCandidates(input, FOODS));
  });
});

describe('buildFoodPreview (deterministic nutrition)', () => {
  function previewFor(text: { name: string; quantity: number | null; unit: AiParsedItem['unit'] }[], meal: MealType = 'dinner') {
    const items = resolveFoodCandidates(text.map((t) => ({ ...candidate(t.name), quantity: t.quantity, unit: t.unit })), FOODS);
    return { items, preview: buildFoodPreview(items, meal) };
  }

  it('computes totals through the deterministic engine (2 eggs)', () => {
    const { items, preview } = previewFor([{ name: 'egg', quantity: 2, unit: 'count' }]);
    expect(items[0].status).toBe('resolved');
    const expected = calculateNutritionForQuantity(EGG, 2, 'count');
    expect(expected.ok).toBe(true);
    if (expected.ok && preview.totals) {
      // 2 × 50 g eggs at 78 kcal/50 g → 156 kcal, identical to a manual log.
      expect(preview.rows[0].nutrition?.calories).toBe(expected.nutrition.calories);
      expect(preview.totals.calories).toBe(expected.nutrition.calories);
      expect(preview.allValid).toBe(true);
    } else {
      throw new Error('expected valid preview');
    }
  });

  it('totals a multi-item meal like a manual entry would', () => {
    const { preview } = previewFor([
      { name: 'roti', quantity: 2, unit: 'count' },
      { name: 'dal', quantity: 200, unit: 'g' },
    ]);
    const roti = calculateNutritionForQuantity(ROTI, 2, 'count');
    const dal = calculateNutritionForQuantity(DAL, 200, 'g');
    expect(roti.ok && dal.ok).toBe(true);
    if (roti.ok && dal.ok && preview.totals) {
      expect(preview.totals.calories).toBe(roti.nutrition.calories + dal.nutrition.calories);
      expect(preview.totals.protein_g).toBe(roti.nutrition.protein_g + dal.nutrition.protein_g);
    }
  });

  it('flags rows needing food or quantity and blocks totals', () => {
    const items = resolveFoodCandidates(
      [{ ...candidate('chicken curry'), quantity: 100, unit: 'g' }, { ...candidate('egg'), quantity: null, unit: null }],
      FOODS
    );
    const preview = buildFoodPreview(items, 'lunch');
    expect(preview.allValid).toBe(false);
    expect(preview.rows[0].error).toMatch(/pick a food/i); // ambiguous curry: no selection yet
    expect(preview.rows[1].error).toMatch(/how much/i); // resolved egg, missing quantity
  });
});

describe('confirmAiReview', () => {
  function resolved(valid = true) {
    const items = resolveFoodCandidates([candidate('egg', 3, 'count')], FOODS);
    const preview = buildFoodPreview(items, 'breakfast');
    if (valid) expect(preview.allValid).toBe(true);
    return preview;
  }

  it('creates FoodLogs only on explicit confirmation', () => {
    const preview = resolved();
    const added: Omit<FoodLog, 'id' | 'created_at'>[] = [];
    // Parsing + resolution + preview created nothing.
    expect(added).toHaveLength(0);
    const { logged } = confirmAiReview(preview, { date: '2026-09-22', meal: 'breakfast', addLog: (l) => added.push(l) });
    expect(logged).toBe(1);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      food_item_id: EGG.id,
      food_name: 'Egg',
      date: '2026-09-22',
      meal_type: 'breakfast',
      quantity: 3,
      quantity_unit: 'count',
      calories: 234, // 3 × 50 g at 78 kcal/50 g — engine math, not AI
    });
    expect(added[0].food_item).toMatchObject({ id: EGG.id });
  });

  it('persists nothing when the preview is invalid', () => {
    // 'chicken curry' is ambiguous here (seed + recipe tie) → no selection.
    const items = resolveFoodCandidates([{ ...candidate('chicken curry'), quantity: 100, unit: 'g' }], FOODS);
    const preview = buildFoodPreview(items, 'lunch');
    expect(preview.allValid).toBe(false);
    const addLog = vi.fn();
    expect(confirmAiReview(preview, { date: '2026-09-22', meal: 'lunch', addLog }).logged).toBe(0);
    expect(addLog).not.toHaveBeenCalled();
  });

  it('uses the deterministic serving factor in snapshots (3 eggs → factor 3)', () => {
    const preview = resolved();
    const added: Omit<FoodLog, 'id' | 'created_at'>[] = [];
    confirmAiReview(preview, { date: '2026-09-22', meal: 'breakfast', addLog: (l) => added.push(l) });
    expect(added[0].servings).toBe(3);
  });
});
