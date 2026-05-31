import { db } from '@/lib/db';

export async function createOrUpdateUser(clerkId: string, email: string, name?: string) {
  return db.user.upsert({
    where: { clerkId },
    update: { email, name },
    create: { clerkId, email, name },
  });
}

export async function getUserByClerkId(clerkId: string) {
  return db.user.findUnique({ where: { clerkId } });
}

export async function updateUserProfile(clerkId: string, data: {
  name?: string;
  gender?: string;
  activityLevel?: string;
  goal?: string;
  dailyCalorieTarget?: number;
  proteinTargetG?: number;
  carbsTargetG?: number;
  fatTargetG?: number;
}) {
  return db.user.update({ where: { clerkId }, data });
}

export async function deleteUser(clerkId: string) {
  return db.user.delete({ where: { clerkId } });
}
