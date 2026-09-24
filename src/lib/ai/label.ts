// =============================================
// FuelUp - Nutrition-label draft normalization (client-safe, pure)
// Converts an AI-extracted label into a FoodItem basis the Phase 5
// quantity engine can scale. Unknown stays null where the model allows
// it; required numeric FoodItem fields follow the manual-form convention
// (unreadable → 0 + explicit warning). Never invents a serving basis:
// unclear labels fall back to per-100 g WITH a warning, user-confirmed.
// =============================================
import type { FoodSource, QuantityUnit } from '@/lib/types';
import type { AiLabelCandidate } from './vision-schemas';

export interface LabelFoodDraft {
  name: string;
  brand: string;
  serving_size: number;
  serving_unit: QuantityUnit;
  calories_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number | null;
  sodium_mg: number | null;
  source: FoodSource;
  warnings: string[];
}

const num = (v: number | null): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function buildLabelFoodDraft(label: AiLabelCandidate): LabelFoodDraft {
  const warnings: string[] = [];
  const name = (label.name ?? '').trim() || 'Scanned food';
  const brand = (label.brand ?? '').trim();

  let serving_size = 100;
  let serving_unit: QuantityUnit = 'g';
  if (label.servingQuantity !== null && label.servingQuantity > 0 && label.servingUnit) {
    serving_size = label.servingQuantity;
    serving_unit = label.servingUnit;
  } else {
    warnings.push('Serving size unclear — using a per-100 g basis. Adjust if needed.');
  }

  const macrosMissing =
    label.protein === null || label.carbs === null || label.fat === null || label.calories === null;
  if (macrosMissing) {
    warnings.push('Some nutrients were unreadable and default to 0 — check the label.');
  }

  return {
    name,
    brand,
    serving_size,
    serving_unit,
    calories_per_serving: num(label.calories),
    protein_g: num(label.protein),
    carbs_g: num(label.carbs),
    fat_g: num(label.fat),
    fiber_g: num(label.fiber),
    sugar_g: label.sugar,
    sodium_mg: label.sodium,
    source: brand ? 'branded' : 'user',
    warnings,
  };
}
