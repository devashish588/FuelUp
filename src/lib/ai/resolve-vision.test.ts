// Phase 9 — vision→resolver reuse tests: meal candidates (with visual
// hints) flow through the UNCHANGED Phase 8 resolver, quantity engine, and
// confirmation path. No duplicate pipeline: same statuses, same preview,
// same FoodLog shape.
import { describe, expect, it } from 'vitest';
import { calculateNutritionForQuantity } from '@/lib/calculations/nutrition';
import type { FoodItem, FoodLog } from '@/lib/types';
import { buildFoodPreview, confirmAiReview, resolveFoodCandidates } from './resolve';
import type { AiMealItem } from './vision-schemas';

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

const RICE = food('Rice', { serving_size: 150, serving_unit: 'g', calories_per_serving: 195, category: 'staples' });
const DAL = food('Dal', { serving_size: 150, serving_unit: 'g', calories_per_serving: 180, category: 'legumes' });
const RECIPE = food('Chicken Curry', { id: 'r-1', calories_per_serving: 152.6, source: 'recipe', is_custom: true });
const PANEER_A = food('Paneer', { category: 'dairy' });
const PANEER_B = food('Paneer tikka', { category: 'snack' });
const FOODS = [RICE, DAL, RECIPE, PANEER_A, PANEER_B];

function mealItem(name: string, overrides: Partial<AiMealItem> = {}): AiMealItem {
  return {
    name, quantity: null, unit: null, mealHint: null, preparationHint: null,
    visualPortionHint: null, foodState: null, ...overrides,
  };
}

describe('vision candidates through the Phase 8 resolver', () => {
  it('resolves a mixed plate; null quantities stay missing until confirmed', () => {
    const items = resolveFoodCandidates(
      [
        mealItem('rice', { visualPortionHint: 'medium bowl', foodState: 'cooked', preparationHint: 'cooked' }),
        mealItem('dal', { quantity: 200, unit: 'g' }),
      ],
      FOODS
    );
    expect(items[0].status).toBe('resolved');
    expect(items[0].selectedFood?.name).toBe('Rice');
    expect(items[0].quantity).toBeNull();
    expect(items[0].quantitySource).toBe('missing');
    expect(items[1].quantity).toBe(200);
    const preview = buildFoodPreview(items, 'dinner');
    expect(preview.allValid).toBe(false);
    expect(preview.rows[0].error).toMatch(/how much/i);
  });

  it('matches a saved recipe without silent ambiguity loss', () => {
    const items = resolveFoodCandidates([mealItem('chicken curry', { visualPortionHint: 'small bowl' })], FOODS);
    expect(items[0].status).toBe('resolved');
    expect(items[0].selectedFood?.id).toBe('r-1');
  });

  it('keeps ambiguous vision detections ambiguous (prefix tie, no exact match)', () => {
    const tikka = food('Paneer tikka', { category: 'snack' });
    const butterMasala = food('Paneer butter masala', { category: 'curry' });
    const items = resolveFoodCandidates([mealItem('paneer')], [tikka, butterMasala]);
    expect(items[0].status).toBe('ambiguous');
    expect(items[0].selectedFood).toBeNull();
    expect(items[0].matches).toHaveLength(2);
  });

  it('leaves unknown dishes unsupported for manual search', () => {
    const items = resolveFoodCandidates([mealItem('unknown curry-like dish')], FOODS);
    expect(items[0].status).toBe('unsupported');
  });

  it('computes deterministic nutrition after user correction (no second AI call)', () => {
    const items = resolveFoodCandidates([mealItem('dal', { quantity: 200, unit: 'g' })], FOODS);
    const edited = items.map((r) => (r.key === 'ai-0' ? { ...r, quantity: 250 } : r));
    const preview = buildFoodPreview(edited, 'dinner');
    const expected = calculateNutritionForQuantity(DAL, 250, 'g');
    expect(expected.ok).toBe(true);
    if (expected.ok && preview.totals) {
      expect(preview.totals.calories).toBe(expected.nutrition.calories);
      expect(preview.allValid).toBe(true);
    } else {
      throw new Error('expected valid preview');
    }
    const added: Omit<FoodLog, 'id' | 'created_at'>[] = [];
    const { logged } = confirmAiReview(preview, { date: '2026-09-22', meal: 'dinner', addLog: (l) => added.push(l) });
    expect(logged).toBe(1);
    expect(added[0]).toMatchObject({ food_name: 'Dal', quantity: 250, quantity_unit: 'g', meal_type: 'dinner' });
    expect(added[0]).not.toHaveProperty('visualPortionHint');
    expect(added[0]).not.toHaveProperty('image');
  });
});
