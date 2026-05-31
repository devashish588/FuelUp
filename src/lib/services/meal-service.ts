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
}) {
  return db.foodLog.create({ data: { userId, ...data } });
}

export async function removeFoodLog(id: string, userId: string) {
  return db.foodLog.delete({ where: { id, userId } });
}

export async function searchFoodItems(query: string, userId?: string) {
  return db.foodItem.findMany({
    where: {
      name: { contains: query, mode: 'insensitive' },
      OR: [{ userId }, { isCustom: false }],
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
}) {
  return db.foodItem.create({
    data: { userId, isCustom: true, ...data },
  });
}
