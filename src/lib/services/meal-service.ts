import { db } from '@/lib/db';

export async function getFoodLogs(userId: string, date: string) {
  return db.foodLog.findMany({
    where: { userId, date },
    include: { foodItem: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function addFoodLog(userId: string, data: {
  foodItemId: string;
  date: string;
  mealType: string;
  servings: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes?: string;
  quantity?: number;
  quantityUnit?: string;
  fiberG?: number | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  foodName?: string;
  isEstimated?: boolean;
}) {
  return db.foodLog.create({ data: { userId, ...data } });
}

export async function removeFoodLog(id: string, userId: string) {
  return db.foodLog.deleteMany({ where: { id, userId } });
}

export async function searchFoodItems(query: string, userId?: string) {
  return db.foodItem.findMany({
    where: {
      name: { contains: query, mode: 'insensitive' },
      OR: userId
        ? [{ userId }, { isCustom: false }]
        : [{ isCustom: false }],
    },
    take: 20,
  });
}

export async function createFoodItem(userId: string, data: {
  name: string;
  brand?: string;
  caloriesPerServing: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  servingUnit?: string;
  servingSize?: number;
  fiberG?: number | null;
  category?: string;
  source?: string;
  sourceId?: string | null;
  aliases?: string[];
  countWeightG?: number | null;
  foodState?: string | null;
  preparation?: string | null;
  servingDescription?: string | null;
  sugarG?: number | null;
  sodiumMg?: number | null;
  isEstimated?: boolean;
  barcode?: string | null;
}) {
  // fiberG is a non-nullable defaulted column: null means "use the default".
  const { fiberG, ...rest } = data;
  return db.foodItem.create({
    data: { userId, isCustom: true, ...rest, ...(fiberG == null ? {} : { fiberG }) },
  });
}
