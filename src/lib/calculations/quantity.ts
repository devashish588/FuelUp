// =============================================
// FuelUp - Quantity model (deterministic, no AI)
// A food's nutrition is stated per its basis (serving_size × serving_unit).
// User input arrives in g | kg | ml | L | count | serving and is normalized
// to the basis BEFORE scaling — never grams⇄milliliters (density unknown),
// never "1 bowl" as a universal quantity.
// =============================================
import type { FoodItem, QuantityUnit } from '@/lib/types';

export const QUANTITY_UNITS: QuantityUnit[] = ['g', 'kg', 'ml', 'L', 'count', 'serving'];

export type BasisUnit = 'g' | 'ml' | 'count' | 'serving';

const MAX_QUANTITY = 1_000_000;

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

/** The unit family a food's nutrition basis belongs to. */
export function basisUnitOf(food: Pick<FoodItem, 'serving_unit'>): BasisUnit {
  const u = (food.serving_unit || '').trim().toLowerCase();
  if (u === 'kg' || u === 'g') return 'g';
  if (u === 'l' || u === 'ml') return 'ml';
  if (u === 'count' || u === 'pc' || u === 'pcs' || u === 'piece') return 'count';
  return 'serving';
}

/** The natural input unit for a food (drives UI defaults). */
export function defaultUnitFor(food: Pick<FoodItem, 'serving_unit' | 'count_weight_g'>): QuantityUnit {
  const basis = basisUnitOf(food);
  if (basis === 'g') return 'g';
  if (basis === 'ml') return 'ml';
  if (basis === 'count') return 'count';
  return 'serving';
}

/** Units the UI should offer for a food (incompatible ones excluded). */
export function availableUnitsFor(food: Pick<FoodItem, 'serving_unit' | 'count_weight_g'>): QuantityUnit[] {
  const basis = basisUnitOf(food);
  if (basis === 'g') {
    return food.count_weight_g && food.count_weight_g > 0
      ? ['g', 'kg', 'count', 'serving']
      : ['g', 'kg', 'serving'];
  }
  if (basis === 'ml') return ['ml', 'L', 'serving'];
  if (basis === 'count') return ['count', 'serving'];
  return ['serving'];
}

export interface NormalizedQuantity {
  /** Amount expressed in the food's basis unit. */
  value: number;
  unit: BasisUnit;
}

/**
 * Normalize a user-entered quantity into the food's basis unit.
 * Returns { ok: false } with a human-readable reason for invalid input
 * (non-positive, non-finite, weight⇄volume, count without a gram mapping).
 */
export function normalizeFoodQuantity(
  food: Pick<FoodItem, 'serving_size' | 'serving_unit' | 'count_weight_g'>,
  quantity: number,
  unit: QuantityUnit
): { ok: true; value: NormalizedQuantity } | { ok: false; reason: string } {
  if (!Number.isFinite(quantity)) return fail('Enter a valid quantity.');
  if (quantity <= 0) return fail('Quantity must be greater than zero.');
  if (quantity > MAX_QUANTITY) return fail('That quantity looks too large.');

  const basis = basisUnitOf(food);

  switch (unit) {
    case 'g': {
      if (basis !== 'g') {
        return fail(
          basis === 'ml'
            ? 'This food is measured in milliliters — grams would need a density we don’t have.'
            : 'This food isn’t measured by weight — use servings or count.'
        );
      }
      return { ok: true, value: { value: quantity, unit: 'g' } };
    }
    case 'kg': {
      if (basis !== 'g') return fail('This food isn’t measured by weight — use servings or count.');
      return { ok: true, value: { value: quantity * 1000, unit: 'g' } };
    }
    case 'ml': {
      if (basis !== 'ml') {
        return fail(
          basis === 'g'
            ? 'This food is measured in grams — milliliters would need a density we don’t have.'
            : 'This food isn’t measured by volume — use servings or count.'
        );
      }
      return { ok: true, value: { value: quantity, unit: 'ml' } };
    }
    case 'L': {
      if (basis !== 'ml') return fail('This food isn’t measured by volume — use servings or count.');
      return { ok: true, value: { value: quantity * 1000, unit: 'ml' } };
    }
    case 'count': {
      if (basis === 'count') return { ok: true, value: { value: quantity, unit: 'count' } };
      const perCount = food.count_weight_g;
      if (basis === 'g' && perCount && perCount > 0) {
        return { ok: true, value: { value: quantity * perCount, unit: 'g' } };
      }
      return fail('We don’t know the weight of one piece of this food — use servings or grams.');
    }
    case 'serving': {
      return { ok: true, value: { value: quantity, unit: 'serving' } };
    }
  }
}

/**
 * Factor to scale per-basis nutrition: normalized amount ÷ basis amount.
 * `serving` normalizes to a multiple of the defined serving.
 */
export function scaleFactorFor(
  food: Pick<FoodItem, 'serving_size' | 'serving_unit'>,
  normalized: NormalizedQuantity
): number {
  const basisSize = food.serving_size > 0 ? food.serving_size : 1;
  if (normalized.unit === 'serving') return normalized.value;
  return normalized.value / basisSize;
}
