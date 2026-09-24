// =============================================
// FuelUp - Nutrition display helpers (canonical location)
// UI must not hard-code nutrition strings: source/category labels,
// quantity formatting, and estimate marking live here.
// =============================================
import type { FoodSource, QuantityUnit } from '@/lib/types';

const SOURCE_LABELS: Record<FoodSource, string> = {
  builtin: 'Generic',
  verified: 'Verified',
  branded: 'Branded',
  user: 'My food',
  recipe: 'Recipe',
  imported: 'Imported',
  estimated: 'Estimated',
};

export function sourceLabel(source: FoodSource | undefined): string {
  return SOURCE_LABELS[source ?? 'builtin'];
}

const CATEGORY_LABELS: Record<string, string> = {
  staples: 'Staples',
  protein: 'Protein',
  legumes: 'Legumes',
  dairy: 'Dairy',
  produce: 'Produce',
  fats: 'Fats & nuts',
  other: 'Other',
};

export function categoryLabel(category: string | undefined): string {
  if (!category) return 'Other';
  return CATEGORY_LABELS[category] ?? category;
}

/** "180 g", "2 count", "1.5 serving" — rounded for display only. */
export function formatQuantity(quantity: number, unit: QuantityUnit): string {
  const q = Math.round(quantity * 10) / 10;
  return `${q} ${unit}`;
}

/**
 * Prefix for estimated values (≈) so the UI never shows false precision.
 * Ranges (e.g. 650–800) are a documented future enhancement; for now the
 * single approximate value carries the ≈ marker plus its provenance label.
 */
export function estimatePrefix(isEstimated: boolean | undefined): string {
  return isEstimated ? '≈ ' : '';
}
