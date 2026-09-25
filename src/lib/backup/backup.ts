// =============================================
// FuelUp - Backup export/restore (Phase 10.5, client IndexedDB only)
// Versioned JSON envelope of raw user facts. Export strips identity
// (ownerId/user_id); restore re-attaches rows to the CURRENT owner inside
// one Dexie transaction after full validation — never partial, never
// cross-owner. Backups never leave the browser (download/upload only),
// never touch the server, AI, outbox, or sync cursors.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { APP_VERSION } from '@/config/app';
import { repoContext, whereOwner, whereOwnerKeys } from '@/lib/repositories/base';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  backupEnvelopeSchema,
  type BackupData,
  type BackupEnvelope,
} from '@/lib/validation/backup';

/** Reject absurd files before JSON.parse allocates (personal datasets). */
export const BACKUP_MAX_BYTES = 10 * 1024 * 1024;

/** Yield every N rows so large restores don't block the main thread. */
const RESTORE_CHUNK_ROWS = 2000;

const BACKUP_META_KEY = 'fuelup:backup-meta';

export interface BackupMeta {
  lastExportAt: string | null;
  lastImportAt: string | null;
  lastImportCounts: Record<string, number> | null;
}

export function getBackupMeta(): BackupMeta {
  const fallback: BackupMeta = { lastExportAt: null, lastImportAt: null, lastImportCounts: null };
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(BACKUP_META_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BackupMeta>;
    return {
      lastExportAt: typeof parsed.lastExportAt === 'string' ? parsed.lastExportAt : null,
      lastImportAt: typeof parsed.lastImportAt === 'string' ? parsed.lastImportAt : null,
      lastImportCounts:
        parsed.lastImportCounts && typeof parsed.lastImportCounts === 'object' ? parsed.lastImportCounts : null,
    };
  } catch {
    return fallback;
  }
}

export function setBackupMeta(patch: Partial<BackupMeta>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(BACKUP_META_KEY, JSON.stringify({ ...getBackupMeta(), ...patch }));
  } catch {
    /* private mode — metadata is best-effort */
  }
}

function strip<T extends object>(row: T): Omit<T, 'ownerId' | 'user_id'> {
  const clone = { ...row } as Record<string, unknown>;
  delete clone.ownerId;
  delete clone.user_id;
  return clone as Omit<T, 'ownerId' | 'user_id'>;
}

/**
 * Re-attach identity to the current owner. Every row gets the local
 * `ownerId` namespace; rows whose domain type carries `user_id` get that
 * too (profiles/weeklyPlans/custom foods/exercises/graph children don't).
 */
const TABLES_WITH_USER_ID = new Set([
  'foodLogs',
  'favoriteFoods',
  'recipes',
  'recipeIngredients',
  'workouts',
  'bodyMetrics',
  'habits',
  'habitLogs',
  'targetHistory',
]);

function withOwner<T extends object>(row: T, ownerId: string, hasUserId: boolean): T & { ownerId: string } {
  const out = { ...row, ownerId } as T & { ownerId: string; user_id?: string };
  if (hasUserId) out.user_id = ownerId;
  else delete out.user_id;
  return out;
}



/** Read every user collection for export (raw facts only — no derived analytics). */
export async function buildBackupSnapshot(ownerId: string, db?: FuelUpLocalDb): Promise<BackupEnvelope> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  const [profileRow, weeklyPlanRow] = await Promise.all([d.profiles.get(o), d.weeklyPlans.get(o)]);
  const [
    foodItems, foodLogs, favoriteFoods, recipes, recipeIngredients,
    exercises, workouts, workoutExercises, exerciseSets,
    bodyMetrics, habits, habitLogs, targetHistory,
  ] = await Promise.all([
    whereOwner(d.foodItems, o),
    whereOwner(d.foodLogs, o),
    whereOwner(d.favoriteFoods, o),
    whereOwner(d.recipes, o),
    whereOwner(d.recipeIngredients, o),
    whereOwner(d.exercises, o),
    whereOwner(d.workouts, o),
    whereOwner(d.workoutExercises, o),
    whereOwner(d.exerciseSets, o),
    whereOwner(d.bodyMetrics, o),
    whereOwner(d.habits, o),
    whereOwner(d.habitLogs, o),
    whereOwner(d.targetHistory, o),
  ]);
  const cast = <K extends keyof BackupData>(rows: unknown): BackupData[K] => rows as BackupData[K];
  const data: BackupData = {
    profile: profileRow ? (strip(profileRow) as unknown as BackupData['profile']) : null,
    foodItems: cast<'foodItems'>(foodItems.map((r) => strip(r))),
    foodLogs: cast<'foodLogs'>(foodLogs.map((r) => strip(r))),
    favoriteFoods: cast<'favoriteFoods'>(favoriteFoods.map((r) => strip(r))),
    recipes: cast<'recipes'>(recipes.map((r) => strip(r))),
    recipeIngredients: cast<'recipeIngredients'>(recipeIngredients.map((r) => strip(r))),
    exercises: cast<'exercises'>(exercises.map((r) => strip(r))),
    workouts: cast<'workouts'>(workouts.map((r) => strip(r))),
    workoutExercises: cast<'workoutExercises'>(workoutExercises.map((r) => strip(r))),
    exerciseSets: cast<'exerciseSets'>(exerciseSets.map((r) => strip(r))),
    bodyMetrics: cast<'bodyMetrics'>(bodyMetrics.map((r) => strip(r))),
    habits: cast<'habits'>(habits.map((r) => strip(r))),
    habitLogs: cast<'habitLogs'>(habitLogs.map((r) => strip(r))),
    targetHistory: cast<'targetHistory'>(targetHistory.map((r) => strip(r))),
    weeklyPlan: weeklyPlanRow ? (strip(weeklyPlanRow) as unknown as BackupData['weeklyPlan']) : null,
  };
  // Self-check: what we write must validate (guards export-side drift).
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data,
  };
  backupEnvelopeSchema.parse(envelope);
  return envelope;
}

export function backupFileName(exportedAt: string): string {
  const day = exportedAt.length >= 10 ? exportedAt.slice(0, 10) : 'backup';
  return `fuelup-backup-${day}.json`;
}

export interface BackupPreview {
  exportedAt: string;
  version: number;
  appVersion: string;
  counts: { label: string; count: number }[];
  totalRows: number;
}

const PREVIEW_LABELS: [keyof BackupData, string][] = [
  ['foodLogs', 'food logs'],
  ['recipes', 'recipes'],
  ['workouts', 'workouts'],
  ['habitLogs', 'habit logs'],
  ['bodyMetrics', 'weight entries'],
  ['foodItems', 'custom foods'],
  ['exercises', 'custom exercises'],
  ['habits', 'habits'],
  ['favoriteFoods', 'favorites'],
  ['targetHistory', 'target events'],
];

/** Human preview of a validated envelope (counts only — never row contents). */
export function previewBackup(envelope: BackupEnvelope): BackupPreview {
  const counts = PREVIEW_LABELS.map(([key, label]) => {
    const value = envelope.data[key];
    return { label, count: Array.isArray(value) ? value.length : value ? 1 : 0 };
  }).filter((c) => c.count > 0);
  const profileCount = envelope.data.profile ? 1 : 0;
  const all = profileCount > 0 ? [{ label: 'profile', count: 1 }, ...counts] : counts;
  return {
    exportedAt: envelope.exportedAt,
    version: envelope.version,
    appVersion: envelope.appVersion,
    counts: all,
    totalRows: all.reduce((s, c) => s + c.count, 0),
  };
}

export type ParseBackupResult =
  | { ok: true; envelope: BackupEnvelope }
  | { ok: false; error: string };

/** File → size → JSON → envelope → version. Pure apart from no I/O. */
export function parseBackupFile(text: string): ParseBackupResult {
  if (text.length > BACKUP_MAX_BYTES) {
    return { ok: false, error: 'That backup file is too large (over 10 MB).' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const envelope = (json ?? {}) as Record<string, unknown>;
  if (envelope.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'That file is not a FuelUp backup.' };
  }
  if (envelope.version !== BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version ${String(envelope.version)}. This app restores version ${BACKUP_FORMAT_VERSION} backups.`,
    };
  }
  const parsed = backupEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'That backup failed validation and was not imported.' };
  }
  return { ok: true, envelope: parsed.data };
}

export type RestoreProgress = (stage: string, done: number, total: number) => void;

/** Backup-covered data tables (excludes profiles/weeklyPlans/outbox/meta). */
export type BackupTableKey =
  | 'bodyMetrics' | 'foodItems' | 'foodLogs' | 'exercises' | 'workouts'
  | 'workoutExercises' | 'exerciseSets' | 'habits' | 'habitLogs'
  | 'favoriteFoods' | 'recipes' | 'recipeIngredients' | 'targetHistory';

/**
 * Replace-local-data restore, atomically where IndexedDB allows:
 * everything validates BEFORE anything writes; the clear + bulk-put run
 * in ONE Dexie transaction (all-or-nothing), chunked with main-thread
 * yields for large tables. Outbox rows for the owner are cleared in the
 * same transaction so stale pre-restore mutations can never overwrite
 * restored data. The sync cursor is deliberately KEPT: restore is local;
 * normal incremental sync resumes afterward.
 */
export async function restoreBackup(
  ownerId: string,
  envelope: BackupEnvelope,
  db?: FuelUpLocalDb,
  onProgress?: RestoreProgress
): Promise<{ counts: Record<string, number>; skipped: number }> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  // Defense in depth: re-validate even though callers parse first.
  // Nothing writes until this passes (atomicity guarantee).
  const checked = backupEnvelopeSchema.safeParse(envelope);
  if (!checked.success || checked.data.version !== BACKUP_FORMAT_VERSION) {
    throw new Error('That backup failed validation and was not imported.');
  }
  const data: BackupData = checked.data.data;
  const report: Record<string, number> = {};
  type AnyTable = {
    toCollection(): {
      filter(fn: (row: { ownerId?: unknown }) => boolean): { primaryKeys(): Promise<unknown[]> };
    };
    bulkDelete(k: string[]): Promise<unknown>;
    bulkPut(rows: never[]): Promise<unknown>;
    get(key: string): Promise<{ ownerId?: unknown } | undefined>;
  };
  const byTable: [key: BackupTableKey, table: AnyTable][] = [
    ['bodyMetrics', d.bodyMetrics],
    ['foodItems', d.foodItems],
    ['foodLogs', d.foodLogs],
    ['exercises', d.exercises],
    ['workouts', d.workouts],
    ['workoutExercises', d.workoutExercises],
    ['exerciseSets', d.exerciseSets],
    ['habits', d.habits],
    ['habitLogs', d.habitLogs],
    ['favoriteFoods', d.favoriteFoods],
    ['recipes', d.recipes],
    ['recipeIngredients', d.recipeIngredients],
    ['targetHistory', d.targetHistory],
  ];
  const txTables = [
    d.profiles, d.weeklyPlans, d.outbox,
    d.bodyMetrics, d.foodItems, d.foodLogs, d.exercises, d.workouts,
    d.workoutExercises, d.exerciseSets, d.habits, d.habitLogs,
    d.favoriteFoods, d.recipes, d.recipeIngredients, d.targetHistory,
  ];
  const totalSteps = byTable.length + 3;
  let step = 0;
  let skipped = 0;
  const tick = (stage: string) => {
    step += 1;
    onProgress?.(stage, step, totalSteps);
  };
  await d.transaction('rw', txTables, async () => {
      // 1. Clear the owner's namespace (data tables + stale outbox).
      // Index-agnostic deletes: plain .where('ownerId') silently misses
      // compound-only tables (foodLogs, habitLogs, outbox).
      for (const [key, table] of byTable) {
        const keys = await whereOwnerKeys(table, o);
        if (keys.length > 0) await table.bulkDelete(keys);
        tick(`Clearing ${key}`);
      }
      const outboxKeys = await whereOwnerKeys(d.outbox, o);
      if (outboxKeys.length > 0) await d.outbox.bulkDelete(outboxKeys);
      await d.profiles.delete(o);
      await d.weeklyPlans.delete(o);
      tick('Clearing profile');

      // 2. Write validated rows, remapped to the current owner.
      // Cross-namespace guard: a row id already owned by SOMEONE ELSE is
      // skipped (never clobbered, never merged) and reported. Same-owner
      // replace — the documented primary flow — never hits this path
      // because its namespace was cleared above.
      const putAll = async (key: BackupTableKey, table: AnyTable, rows: object[]) => {
        let written = 0;
        const hasUserId = TABLES_WITH_USER_ID.has(key);
        // Chunked bulkPuts bound per-operation memory. NOTE: only Dexie
        // promises may be awaited here — a macrotask yield (setTimeout)
        // would auto-commit the IndexedDB transaction and break atomicity.
        for (let i = 0; i < rows.length; i += RESTORE_CHUNK_ROWS) {
          const chunk: object[] = [];
          for (const row of rows.slice(i, i + RESTORE_CHUNK_ROWS)) {
            const id = (row as { id?: unknown }).id;
            if (typeof id === 'string') {
              const existing = await table.get(id);
              if (existing && existing.ownerId !== undefined && existing.ownerId !== o) {
                skipped += 1;
                continue;
              }
            }
            chunk.push(withOwner(row, o, hasUserId));
            written += 1;
          }
          if (chunk.length > 0) await table.bulkPut(chunk as never[]);
        }
        report[key] = written;
      };
      for (const [key, table] of byTable) {
        const rows = (data[key] ?? []) as object[];
        await putAll(key, table, rows);
        tick(`Importing ${key}`);
      }
      if (data.profile) {
        await d.profiles.put({ ...(data.profile as object), ownerId: o } as never);
        report.profile = 1;
      } else {
        report.profile = 0;
      }
      if (data.weeklyPlan) {
        await d.weeklyPlans.put({ ...(data.weeklyPlan as object), ownerId: o } as never);
        report.weeklyPlan = 1;
      } else {
        report.weeklyPlan = 0;
      }
      tick('Finalizing');
    }
  );
  return { counts: report, skipped };
}
