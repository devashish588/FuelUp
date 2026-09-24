// =============================================
// FuelUp - Nutrition repository (IndexedDB)
// Only user-created foods live here; the static seed catalog
// (FOOD_DATABASE) ships with the bundle and is merged at the store layer.
// Food logs are repeatable events — each tap is its own row (same as water),
// keyed by id; date+meal queries use compound indexes.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { FavoriteFood, FoodItem, FoodLog } from '@/lib/types';
import { enqueueSyncEvent } from '@/lib/sync/outbox';
import { omitOwner, repoContext, repoError, withoutKeys } from './base';

function strip<T extends { ownerId: string }>(row: T): Omit<T, 'ownerId'> {
  return omitOwner(row);
}

export async function listCustomFoods(ownerId: string, db?: FuelUpLocalDb): Promise<FoodItem[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.foodItems.where('ownerId').equals(o).toArray();
    return rows.map((r) => strip(r) as FoodItem);
  } catch (error) {
    repoError('foods', 'load', error);
  }
}

export async function saveCustomFood(ownerId: string, item: FoodItem, db?: FuelUpLocalDb): Promise<FoodItem> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.foodItems.put({ ...item, ownerId: o });
    await enqueueSyncEvent(o, { entity: 'foodItem', entityId: item.id, operation: 'upsert', payload: { ...item } }, d);
    return item;
  } catch (error) {
    repoError('food', 'save', error);
  }
}

export async function listFoodLogsForDate(
  ownerId: string,
  date: string,
  db?: FuelUpLocalDb
): Promise<FoodLog[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.foodLogs.where('[ownerId+date]').equals([o, date]).toArray();
    return rows.map((r) => strip(r) as FoodLog);
  } catch (error) {
    repoError('food logs', 'load', error);
  }
}

export async function listAllFoodLogs(ownerId: string, db?: FuelUpLocalDb): Promise<FoodLog[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.foodLogs.where('[ownerId+date]').between([o, ''], [o, '\uffff']).toArray();
    return rows.map((r) => strip(r) as FoodLog);
  } catch (error) {
    repoError('food logs', 'load', error);
  }
}

export async function addFoodLog(ownerId: string, log: FoodLog, db?: FuelUpLocalDb): Promise<FoodLog> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    // The embedded food_item snapshot is kept intentionally: logs render
    // offline and survive the referenced food being deleted (same as today).
    // It is stripped before sync (the server joins foodItemId itself).
    await d.foodLogs.put({ ...log, ownerId: o });
    const syncPayload = withoutKeys(log, 'food_item');
    // Seed-catalog foods never sync as items; the snapshot lets the server
    // provision a shared stub so the log's FK stays valid (see apply-push).
    const snapshot = log.food_item
      ? {
          foodSnapshot: {
            name: log.food_item.name,
            brand: log.food_item.brand ?? '',
            serving_unit: log.food_item.serving_unit,
            calories_per_serving: log.food_item.calories_per_serving,
            protein_g: log.food_item.protein_g,
            carbs_g: log.food_item.carbs_g,
            fat_g: log.food_item.fat_g,
          },
        }
      : {};
    await enqueueSyncEvent(o, { entity: 'foodLog', entityId: log.id, operation: 'upsert', payload: { ...syncPayload, ...snapshot } }, d);
    return log;
  } catch (error) {
    repoError('food log', 'save', error);
  }
}

export async function removeFoodLog(ownerId: string, id: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.foodLogs.get(id);
    if (!row || row.ownerId !== o) return;
    await d.foodLogs.delete(id);
    await enqueueSyncEvent(o, { entity: 'foodLog', entityId: id, operation: 'delete', payload: { id } }, d);
  } catch (error) {
    repoError('food log', 'delete', error);
  }
}

/**
 * Edit a log: caller recomputes nutrition via calculateNutritionForQuantity
 * and passes the merged fields. The row (with its frozen snapshot) is
 * replaced and re-synced as an upsert — history of OTHER logs is untouched.
 */
export async function updateFoodLog(
  ownerId: string,
  id: string,
  updates: Partial<FoodLog>,
  db?: FuelUpLocalDb
): Promise<FoodLog | null> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.foodLogs.get(id);
    if (!row || row.ownerId !== o) return null;
    await d.foodLogs.update(id, withoutKeys(updates, 'id', 'user_id'));
    const merged = await d.foodLogs.get(id);
    if (!merged) return null;
    const clean = omitOwner(merged);
    await enqueueSyncEvent(o, { entity: 'foodLog', entityId: id, operation: 'upsert', payload: { ...withoutKeys(clean, 'food_item') } }, d);
    return clean as FoodLog;
  } catch (error) {
    repoError('food log', 'save', error);
  }
}

export async function listFavorites(ownerId: string, db?: FuelUpLocalDb): Promise<FavoriteFood[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.favoriteFoods.where('ownerId').equals(o).toArray();
    return rows.map((r) => omitOwner(r));
  } catch (error) {
    repoError('favorites', 'load', error);
  }
}

export async function addFavorite(
  ownerId: string,
  favorite: FavoriteFood,
  db?: FuelUpLocalDb
): Promise<FavoriteFood> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.favoriteFoods.put({ ...favorite, ownerId: o });
    await enqueueSyncEvent(o, { entity: 'favorite', entityId: favorite.id, operation: 'upsert', payload: { ...favorite } }, d);
    return favorite;
  } catch (error) {
    repoError('favorite', 'save', error);
  }
}

export async function removeFavorite(ownerId: string, id: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const row = await d.favoriteFoods.get(id);
    if (!row || row.ownerId !== o) return;
    await d.favoriteFoods.delete(id);
    await enqueueSyncEvent(o, { entity: 'favorite', entityId: id, operation: 'delete', payload: { id } }, d);
  } catch (error) {
    repoError('favorite', 'delete', error);
  }
}
