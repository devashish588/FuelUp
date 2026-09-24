// =============================================
// FuelUp - Food match scoring (single source of truth)
// Used by the calorie store search AND the Phase 8 AI food resolver so
// both rank candidates identically. Scores are deterministic resolver
// signals (not AI confidence): exact > prefix > substring > weak.
// =============================================
import type { FoodItem } from '@/lib/types';

export function normalizeFoodQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface ScoredFood {
  food: FoodItem;
  score: number;
}

/**
 * Deterministic match score for one food against a normalized query.
 * preparationHint (e.g. 'cooked') adds a small tie-break boost when it
 * appears in the food's name/preparation — never the deciding factor alone.
 */
export function scoreFoodMatch(food: Pick<FoodItem, 'name' | 'brand' | 'aliases' | 'category' | 'preparation'>, normalizedQuery: string, preparationHint?: string | null): number {
  const name = (food.name || '').toLowerCase();
  if (!name || !normalizedQuery) return 0;
  let score = 0;
  if (name === normalizedQuery || (food.aliases ?? []).some((a) => a.toLowerCase() === normalizedQuery)) {
    score = 100;
  } else if (name.startsWith(normalizedQuery)) {
    score = 30;
  } else if (name.includes(normalizedQuery)) {
    score = 20;
  } else {
    const brand = (food.brand ?? '').toLowerCase();
    const aliases = (food.aliases ?? []).map((a) => a.toLowerCase());
    const category = (food.category ?? '').toLowerCase();
    if (brand.includes(normalizedQuery) || aliases.some((a) => a.includes(normalizedQuery)) || (category !== '' && category.includes(normalizedQuery))) {
      score = 10;
    }
  }
  if (score > 0 && preparationHint) {
    const hint = preparationHint.trim().toLowerCase();
    const haystack = `${name} ${(food.preparation ?? '').toLowerCase()}`;
    if (hint !== '' && haystack.includes(hint)) score += 5;
  }
  return score;
}

/** Ranked search over a food list (store search + resolver share this). */
export function searchFoods(foods: FoodItem[], query: string, limit = 20): ScoredFood[] {
  const q = normalizeFoodQuery(query);
  if (!q) return [];
  const scored: ScoredFood[] = [];
  for (const food of foods) {
    const score = scoreFoodMatch(food, q);
    if (score > 0) scored.push({ food, score });
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return scored.slice(0, limit);
}
