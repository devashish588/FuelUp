// In-memory fake of the Prisma surface used by sync server code.
// Supports equality matching, composite-unique lookups, upserts with
// same-date unique enforcement (P2002), deletes (P2025), and $transaction.
import { Prisma } from '@prisma/client';

type KnownError = InstanceType<typeof Prisma.PrismaClientKnownRequestError>;

type Row = Record<string, unknown> & { id?: string };

function p2002(target: string[]): KnownError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

function p2025(): KnownError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', { code: 'P2025', clientVersion: 'test' });
}

export interface UniqueRule {
  fields: string[];
  target: string[];
}

function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR' && Array.isArray(cond)) {
      return cond.some((branch) => matches(row, branch as Record<string, unknown>));
    }
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as Record<string, unknown>;
      if ('gt' in c) return (row[key] as Date) > (c.gt as Date);
      if ('in' in c) return (c.in as unknown[]).includes(row[key]);
      // Composite-unique object, e.g. { userId_date: { userId, date } }.
      return Object.entries(c).every(([fk, fv]) => row[fk] === fv);
    }
    return row[key] === cond;
  });
}

function findIn(rows: Map<string, Row>, where: Record<string, unknown>): Row | null {
  if (typeof where.id === 'string') return rows.get(where.id) ?? null;
  if (typeof where.mutationId === 'string') {
    for (const r of rows.values()) if (r.mutationId === where.mutationId) return r;
    return null;
  }
  for (const r of rows.values()) if (matches(r, where)) return r;
  return null;
}

export function makeTable(rules: UniqueRule[] = []) {
  const rows = new Map<string, Row>();
  const checkUnique = (row: Row, ignoreId?: string) => {
    for (const rule of rules) {
      for (const [id, other] of rows) {
        if (id === ignoreId) continue;
        if (rule.fields.every((f) => other[f] === row[f] && row[f] !== undefined)) {
          throw p2002(rule.target);
        }
      }
    }
  };
  const table = {
    rows,
    findUnique: async ({ where }: { where: Record<string, unknown> }) => findIn(rows, where),
    findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
      for (const r of rows.values()) if (matches(r, where)) return r;
      return null;
    },
    findMany: async (args: { where?: Record<string, unknown>; orderBy?: Record<string, 'asc'>; take?: number } = {}) => {
      const out = [...rows.values()].filter((r) => matches(r, args.where));
      const order = args.orderBy ? Object.entries(args.orderBy)[0] : undefined;
      if (order) {
        const [field, dir] = order;
        out.sort((a, b) => {
          const av = a[field] as Date;
          const bv = b[field] as Date;
          return dir === 'asc' ? av.getTime() - bv.getTime() : bv.getTime() - av.getTime();
        });
      }
      return args.take !== undefined ? out.slice(0, args.take) : out;
    },
    create: async ({ data }: { data: Row }) => {
      const row: Row = { ...data, createdAt: data.createdAt ?? new Date(), updatedAt: data.updatedAt ?? new Date() };
      checkUnique(row);
      const key = (row.id ?? row.mutationId) as string;
      rows.set(key, row);
      return row;
    },
    upsert: async ({ where, create, update }: { where: { id: string }; create: Row; update: Row }) => {
      const existing = rows.get(where.id);
      if (existing) {
        const merged = { ...existing, ...update, updatedAt: new Date() };
        checkUnique(merged, where.id);
        rows.set(where.id, merged);
        return merged;
      }
      const row: Row = { ...create, createdAt: create.createdAt ?? new Date(), updatedAt: create.updatedAt ?? new Date() };
      checkUnique(row);
      rows.set(create.id as string, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const existing = rows.get(where.id);
      if (!existing) throw p2025();
      const merged = { ...existing, ...data, updatedAt: new Date() };
      rows.set(where.id, merged);
      return merged;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const existing = rows.get(where.id);
      if (!existing) throw p2025();
      rows.delete(where.id);
      return existing;
    },
    deleteMany: async ({ where }: { where?: Record<string, unknown> }) => {
      let count = 0;
      for (const [id, r] of [...rows]) {
        if (matches(r, where)) {
          rows.delete(id);
          count++;
        }
      }
      return { count };
    },
  };
  return table;
}

export type FakeTable = ReturnType<typeof makeTable>;

export interface FakeDb {
  user: FakeTable;
  foodItem: FakeTable;
  foodLog: FakeTable;
  exercise: FakeTable;
  workout: FakeTable;
  workoutExercise: FakeTable;
  exerciseSet: FakeTable;
  bodyMetric: FakeTable;
  habit: FakeTable;
  habitLog: FakeTable;
  favoriteFood: FakeTable;
  recipe: FakeTable;
  recipeIngredient: FakeTable;
  targetHistory: FakeTable;
  processedMutation: FakeTable;
  syncDeletion: FakeTable;
  $transaction<T>(fn: (tx: FakeDb) => Promise<T>): Promise<T>;
}

export function createFakeDb(): FakeDb {
  const fake = {
    user: makeTable(),
    foodItem: makeTable(),
    foodLog: makeTable(),
    exercise: makeTable(),
    workout: makeTable(),
    workoutExercise: makeTable(),
    exerciseSet: makeTable(),
    bodyMetric: makeTable([{ fields: ['userId', 'date'], target: ['user_id', 'date'] }]),
    habit: makeTable(),
    habitLog: makeTable([{ fields: ['habitId', 'date'], target: ['habit_id', 'date'] }]),
    favoriteFood: makeTable([{ fields: ['userId', 'foodId'], target: ['user_id', 'food_id'] }]),
    recipe: makeTable(),
    recipeIngredient: makeTable(),
    targetHistory: makeTable(),
    processedMutation: makeTable([{ fields: ['mutationId'], target: ['mutation_id'] }]),
    syncDeletion: makeTable([{ fields: ['mutationId'], target: ['mutation_id'] }]),
    $transaction: async <T>(fn: (tx: FakeDb) => Promise<T>): Promise<T> => fn(fake as FakeDb),
  };
  return fake as FakeDb;
}
