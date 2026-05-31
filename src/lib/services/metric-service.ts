import { db } from '@/lib/db';

export async function getMetrics(userId: string) {
  return db.bodyMetric.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  });
}

export async function addMetric(userId: string, data: {
  date: string;
  weightKg: number;
  heightCm?: number;
  bmi?: number;
  bodyFatPercentage?: number | null;
  waistCm?: number | null;
}) {
  return db.bodyMetric.create({ data: { userId, ...data } });
}

export async function getLatestMetric(userId: string) {
  return db.bodyMetric.findFirst({
    where: { userId },
    orderBy: { date: 'desc' },
  });
}
