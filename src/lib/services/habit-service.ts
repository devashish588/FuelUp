import { db } from '@/lib/db';

export async function getHabits(userId: string) {
  return db.habit.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createHabit(userId: string, data: {
  name: string;
  icon?: string;
  color?: string;
  targetValue?: number;
  unit?: string;
  frequency?: string;
}) {
  return db.habit.create({ data: { userId, ...data } });
}

export async function updateHabit(id: string, userId: string, data: {
  name?: string;
  targetValue?: number;
  isActive?: boolean;
}) {
  return db.habit.update({ where: { id, userId }, data });
}

export async function deleteHabit(id: string, userId: string) {
  return db.habit.delete({ where: { id, userId } });
}

export async function getHabitLogs(userId: string, date: string) {
  return db.habitLog.findMany({
    where: { userId, date },
    include: { habit: true },
  });
}

export async function upsertHabitLog(userId: string, habitId: string, date: string, value: number, completed: boolean) {
  return db.habitLog.upsert({
    where: { habitId_date: { habitId, date } },
    update: { value, completed },
    create: { userId, habitId, date, value, completed },
  });
}
