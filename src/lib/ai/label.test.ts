// Phase 9 — label draft tests: extraction → FoodItem basis the Phase 5
// quantity engine can scale. Unknown stays flagged; basis never invented
// silently (per-100 g fallback carries a warning).
import { describe, expect, it } from 'vitest';
import { buildLabelFoodDraft } from './label';
import type { AiLabelCandidate } from './vision-schemas';

const FULL: AiLabelCandidate = {
  name: 'Protein Bar', brand: 'Example', servingQuantity: 40, servingUnit: 'g',
  calories: 180, protein: 8, carbs: 22, fat: 7, fiber: 3, sugar: 5, sodium: 140,
};

describe('buildLabelFoodDraft', () => {
  it('preserves the label serving basis for engine scaling', () => {
    const draft = buildLabelFoodDraft(FULL);
    expect(draft).toMatchObject({
      name: 'Protein Bar',
      brand: 'Example',
      serving_size: 40,
      serving_unit: 'g',
      calories_per_serving: 180,
      protein_g: 8,
      sugar_g: 5,
      sodium_mg: 140,
      source: 'branded',
    });
    expect(draft.warnings).toHaveLength(0);
  });

  it('uses user source without a brand', () => {
    expect(buildLabelFoodDraft({ ...FULL, brand: null }).source).toBe('user');
  });

  it('falls back to per-100 g with a warning when serving is unclear', () => {
    const draft = buildLabelFoodDraft({ ...FULL, servingQuantity: null, servingUnit: null });
    expect(draft.serving_size).toBe(100);
    expect(draft.serving_unit).toBe('g');
    expect(draft.warnings.some((w) => w.includes('per-100 g'))).toBe(true);
  });

  it('defaults unreadable macros to 0 with a warning, keeps sugar/sodium null', () => {
    const draft = buildLabelFoodDraft({ ...FULL, protein: null, fiber: null, sugar: null, sodium: null });
    expect(draft.protein_g).toBe(0);
    expect(draft.fiber_g).toBe(0);
    expect(draft.sugar_g).toBeNull();
    expect(draft.sodium_mg).toBeNull();
    expect(draft.warnings.some((w) => w.includes('unreadable'))).toBe(true);
  });

  it('falls back to a placeholder name instead of failing', () => {
    expect(buildLabelFoodDraft({ ...FULL, name: null }).name).toBe('Scanned food');
  });

  it('supports ml/serving/count bases without mass⇄volume conversion', () => {
    expect(buildLabelFoodDraft({ ...FULL, servingQuantity: 250, servingUnit: 'ml' })).toMatchObject({
      serving_size: 250, serving_unit: 'ml',
    });
    expect(buildLabelFoodDraft({ ...FULL, servingQuantity: 1, servingUnit: 'count' })).toMatchObject({
      serving_size: 1, serving_unit: 'count',
    });
  });
});
