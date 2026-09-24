// =============================================
// FuelUp - Server pull collector (server-only)
// Returns rows with updatedAt > cursor (bounded pages) plus tombstones.
// The client applies them idempotently and only then advances its cursor.
// =============================================
import { db as realDb } from '@/lib/db';
import type { PrismaClient } from '@prisma/client';
import { SYNC_PULL_PAGE_LIMIT, type SyncChange, type SyncDeletionChange, type SyncEntity } from '@/lib/sync/sync-contracts';

const LIMIT = SYNC_PULL_PAGE_LIMIT;

function iso(value: Date): string {
  return value.toISOString();
}

export interface PullResult {
  cursor: string;
  hasMore: boolean;
  changes: Partial<Record<SyncEntity, SyncChange[]>>;
  deletions: SyncDeletionChange[];
}

export async function collectPullChanges(
  userId: string,
  cursorIso: string | null,
  db: PrismaClient = realDb as PrismaClient
): Promise<PullResult> {
  const since = cursorIso ? new Date(cursorIso) : new Date(0);
  if (Number.isNaN(since.getTime())) throw new Error('INVALID_CURSOR');

  let maxTs = since.getTime();
  let hasMore = false;
  const changes: Partial<Record<SyncEntity, SyncChange[]>> = {};
  const touch = (ts: Date) => {
    const t = ts.getTime();
    if (t > maxTs) maxTs = t;
  };

  const [foodItems, foodLogs, exercises, workouts, metrics, habits, habitLogs, favorites, recipes, recipeIngredients, targetHistory, user, deletions] = await Promise.all([
    db.foodItem.findMany({
      where: { OR: [{ userId }, { userId: null }], updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
      take: LIMIT + 1,
    }),
    db.foodLog.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.exercise.findMany({
      where: { OR: [{ userId }, { userId: null }], updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
      take: LIMIT + 1,
    }),
    db.workout.findMany({
      where: { userId, updatedAt: { gt: since } },
      orderBy: { updatedAt: 'asc' },
      take: LIMIT + 1,
      include: { exercises: { include: { sets: true } } },
    }),
    db.bodyMetric.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.habit.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.habitLog.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.favoriteFood.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.recipe.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.recipeIngredient.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.targetHistory.findMany({ where: { userId, updatedAt: { gt: since } }, orderBy: { updatedAt: 'asc' }, take: LIMIT + 1 }),
    db.user.findUnique({ where: { id: userId } }),
    db.syncDeletion.findMany({ where: { userId, deletedAt: { gt: since } }, orderBy: { deletedAt: 'asc' }, take: LIMIT + 1 }),
  ]);

  const page = <T>(rows: T[]): { kept: T[] } => {
    if (rows.length > LIMIT) {
      hasMore = true;
      return { kept: rows.slice(0, LIMIT) };
    }
    return { kept: rows };
  };

  const put = (entity: SyncEntity, rows: { updatedAt: Date }[]) => {
    const { kept } = page(rows);
    if (kept.length > 0) {
      changes[entity] = kept.map((r) => ({ row: serialize(r), updatedAt: iso(r.updatedAt) }));
      for (const r of kept) touch(r.updatedAt);
    }
  };

  put('foodItem', foodItems);
  put('foodLog', foodLogs);
  put('exercise', exercises);
  put('workout', workouts);
  put('bodyMetric', metrics);
  put('habit', habits);
  put('habitLog', habitLogs);
  put('favorite', favorites);
  put('recipe', recipes);
  put('recipeIngredient', recipeIngredients);
  put('targetHistory', targetHistory);
  if (user && user.updatedAt.getTime() > since.getTime()) {
    changes.profile = [{ row: serialize(user), updatedAt: iso(user.updatedAt) }];
    touch(user.updatedAt);
  }

  const delPage = page(deletions);
  const deletionChanges: SyncDeletionChange[] = delPage.kept.map((d) => ({
    entity: d.entity as SyncEntity,
    entityId: d.entityId,
    deletedAt: iso(d.deletedAt),
  }));
  for (const d of delPage.kept) touch(d.deletedAt);

  return {
    cursor: new Date(maxTs).toISOString(),
    hasMore,
    changes,
    deletions: deletionChanges,
  };
}

function serialize(value: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? Number(v) : v))
  ) as Record<string, unknown>;
}
