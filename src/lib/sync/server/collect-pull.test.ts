// Pull collector tests: initial full pull, cursor deltas, tombstones,
// truncation flag, and cursor validation.
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createFakeDb, type FakeDb } from '@/test/fake-prisma';
import { collectPullChanges } from './collect-pull';

const USER = 'user-pull';
let db: FakeDb;
let prisma: PrismaClient;

beforeEach(() => {
  db = createFakeDb();
  prisma = db as unknown as PrismaClient;
});

function habitRow(id: string, updatedAt: Date) {
  return { id, userId: USER, name: id, icon: 't', color: '#fff', targetValue: 1, unit: 'x', frequency: 'daily', isActive: true, createdAt: new Date(0), updatedAt };
}

describe('collectPullChanges', () => {
  it('returns the full dataset on first pull (null cursor)', async () => {
    await db.habit.create({ data: habitRow('h-1', new Date('2026-09-20T10:00:00Z')) });
    await db.habitLog.create({ data: { id: 'l-1', userId: USER, habitId: 'h-1', date: '2026-09-20', value: 1, completed: true, createdAt: new Date(0), updatedAt: new Date('2026-09-20T11:00:00Z') } });
    await db.favoriteFood.create({ data: { id: 'fav-1', userId: USER, foodId: 'food-7', createdAt: new Date(0), updatedAt: new Date('2026-09-20T09:00:00Z') } });
    const result = await collectPullChanges(USER, null, prisma);
    expect(result.changes.habit?.map((c) => (c.row as { id: string }).id)).toEqual(['h-1']);
    expect(result.changes.habitLog?.map((c) => (c.row as { id: string }).id)).toEqual(['l-1']);
    expect(result.changes.favorite?.map((c) => (c.row as { id: string }).id)).toEqual(['fav-1']);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBe('2026-09-20T11:00:00.000Z');
  });

  it('returns only rows newer than the cursor', async () => {
    await db.habit.create({ data: habitRow('h-old', new Date('2026-09-20T10:00:00Z')) });
    await db.habit.create({ data: habitRow('h-new', new Date('2026-09-22T10:00:00Z')) });
    const result = await collectPullChanges(USER, '2026-09-21T00:00:00.000Z', prisma);
    expect(result.changes.habit?.map((c) => (c.row as { id: string }).id)).toEqual(['h-new']);
    expect(result.cursor).toBe('2026-09-22T10:00:00.000Z');
  });

  it('includes tombstones for deletions', async () => {
    await db.syncDeletion.create({ data: { userId: USER, entity: 'habit', entityId: 'h-gone', deletedAt: new Date('2026-09-22T10:00:00Z'), mutationId: 'del:habit:h-gone:user-pull' } });
    const result = await collectPullChanges(USER, null, prisma);
    expect(result.deletions).toEqual([{ entity: 'habit', entityId: 'h-gone', deletedAt: '2026-09-22T10:00:00.000Z' }]);
    expect(result.cursor).toBe('2026-09-22T10:00:00.000Z');
  });

  it('never leaks another user’s rows', async () => {
    await db.habit.create({ data: { ...habitRow('h-theirs', new Date()), userId: 'someone-else' } });
    const result = await collectPullChanges(USER, null, prisma);
    expect(result.changes.habit ?? []).toHaveLength(0);
  });

  it('flags truncation when a page overflows', async () => {
    for (let i = 0; i < 201; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      await db.habitLog.create({
        data: { id: `l-${i}`, userId: USER, habitId: `h-${Math.floor(i / 28)}`, date: `2026-09-${day}`, value: 1, completed: true, createdAt: new Date(0), updatedAt: new Date(Date.UTC(2026, 8, 22, 10, 0, i)) },
      });
    }
    const result = await collectPullChanges(USER, null, prisma);
    expect(result.hasMore).toBe(true);
    expect(result.changes.habitLog).toHaveLength(200);
  });

  it('rejects invalid cursors', async () => {
    await expect(collectPullChanges(USER, 'not-a-date', prisma)).rejects.toThrow();
  });

  it('includes recipes with their ingredients', async () => {
    await db.recipe.create({
      data: { id: 'r-1', userId: USER, foodItemId: 'r-1', name: 'Dal', description: '', category: '', preparation: '', yieldQuantity: 500, yieldUnit: 'g', servingQuantity: null, servingDescription: '', source: 'user', isEstimated: false, createdAt: new Date(0), updatedAt: new Date('2026-09-22T10:00:00Z') },
    });
    await db.recipeIngredient.create({
      data: { id: 'i-1', recipeId: 'r-1', userId: USER, foodId: 'f-1', foodName: 'Dal', quantity: 100, quantityUnit: 'g', sortOrder: 0, notes: '', createdAt: new Date(0), updatedAt: new Date('2026-09-22T10:00:00Z') },
    });
    const result = await collectPullChanges(USER, null, prisma);
    expect(result.changes.recipe?.map((c) => (c.row as { id: string }).id)).toEqual(['r-1']);
    expect(result.changes.recipeIngredient?.map((c) => (c.row as { id: string }).id)).toEqual(['i-1']);
  });

  it('includes target-history events', async () => {
    await db.targetHistory.create({
      data: { id: 'th-1', userId: USER, date: '2026-09-22', previousTarget: 2500, newTarget: 2650, reason: 'r', maintenanceEstimate: 3200, validDays: 21, confidence: 'high', goal: 'cut', avgIntakeKcal: 2700, createdAt: new Date(0), updatedAt: new Date('2026-09-22T10:00:00Z') },
    });
    const result = await collectPullChanges(USER, null, prisma);
    expect(result.changes.targetHistory?.map((c) => (c.row as { id: string }).id)).toEqual(['th-1']);
  });
});
