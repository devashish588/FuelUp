// =============================================
// FuelUp - Pull application (client)
// Applies server changes into IndexedDB in ONE transaction together with
// the cursor write: either everything lands and the cursor advances, or
// nothing does and the next pull retries the same window.
// Conflict policy: server state wins EXCEPT rows with pending local outbox
// events (unpushed edits are never clobbered; the pending push resolves
// them). Remote deletes lose to pending local edits (delete wins over
// clean state only). Event rows merge by id — independent events from two
// devices always both survive.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import { repoContext } from '@/lib/repositories/base';
import { generateId } from '@/lib/utils';
import type { SyncChange, SyncDeletionChange, SyncEntity, SyncPullResponse } from './sync-contracts';

export const SYNC_CURSOR_KEY = (ownerId: string) => `sync:cursor:${ownerId}`;

export async function getSyncCursor(ownerId: string, db?: FuelUpLocalDb): Promise<string | null> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  const row = await d.meta.get(SYNC_CURSOR_KEY(o));
  return row ? row.value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export interface PullApplyOutcome {
  changedKinds: SyncEntity[];
  appliedRows: number;
  appliedDeletions: number;
}

/** Runtime-guard the pull payload (hand-rolled: keeps zod server-only). */
export function assertPullResponse(value: unknown): asserts value is SyncPullResponse {
  if (!isRecord(value)) throw new Error('INVALID_PULL');
  if (typeof value.cursor !== 'string' || Number.isNaN(Date.parse(value.cursor))) throw new Error('INVALID_PULL');
  if (typeof value.hasMore !== 'boolean') throw new Error('INVALID_PULL');
  if (!isRecord(value.changes) || !Array.isArray(value.deletions)) throw new Error('INVALID_PULL');
}

export async function applyPullResponse(
  ownerId: string,
  response: SyncPullResponse,
  db?: FuelUpLocalDb
): Promise<PullApplyOutcome> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  assertPullResponse(response);

  // Rows with pending local mutations are skipped: the pending push (which
  // runs before pull in every sync) resolves them on the server instead.
  const pending = await d.outbox.where('[ownerId+status]').equals([o, 'pending']).toArray();
  const inflight = await d.outbox.where('[ownerId+status]').equals([o, 'inflight']).toArray();
  const guarded = new Set([...pending, ...inflight].map((e) => `${e.entity}:${e.entityId}`));
  const isGuarded = (entity: SyncEntity, entityId: string) => guarded.has(`${entity}:${entityId}`);

  const changed = new Set<SyncEntity>();
  let appliedRows = 0;
  let appliedDeletions = 0;
  const nowIso = new Date().toISOString();

  await d.transaction(
    'rw',
    [d.profiles, d.foodItems, d.foodLogs, d.exercises, d.workouts, d.workoutExercises, d.exerciseSets, d.bodyMetrics, d.habits, d.habitLogs, d.favoriteFoods, d.recipes, d.recipeIngredients, d.targetHistory, d.meta],
    async () => {
      for (const [entity, list] of Object.entries(response.changes) as [SyncEntity, SyncChange[]][]) {
        for (const change of list ?? []) {
          if (!isRecord(change.row)) continue;
          const applied = await applyRow(d, o, entity, change.row, isGuarded);
          if (applied) {
            appliedRows++;
            changed.add(entity);
          }
        }
      }
      for (const del of response.deletions) {
        if (!isRecord(del) || typeof del.entity !== 'string' || typeof del.entityId !== 'string') continue;
        const entity = del.entity as SyncEntity;
        if (isGuarded(entity, del.entityId as string)) continue; // pending local edit wins
        await applyDeletion(d, o, entity, del as SyncDeletionChange);
        appliedDeletions++;
        changed.add(entity);
      }
      await d.meta.put({ key: SYNC_CURSOR_KEY(o), value: response.cursor, updatedAt: nowIso });
    }
  );

  return { changedKinds: [...changed], appliedRows, appliedDeletions };
}

async function applyRow(
  d: FuelUpLocalDb,
  o: string,
  entity: SyncEntity,
  row: Record<string, unknown>,
  isGuarded: (entity: SyncEntity, entityId: string) => boolean
): Promise<boolean> {
  const id = str(row.id);
  if (!id) return false;
  if (isGuarded(entity, id)) return false;

  switch (entity) {
    case 'profile':
      await applyProfileRow(d, o, row);
      return true;
    case 'foodItem': {
      const validSource = (v: unknown): import('@/lib/types').FoodSource | undefined =>
        v === 'builtin' || v === 'verified' || v === 'branded' || v === 'user' || v === 'recipe' || v === 'imported' || v === 'estimated' ? v : undefined;
      await d.foodItems.put({
        id,
        ownerId: o,
        name: str(row.name, 'Food'),
        brand: typeof row.brand === 'string' ? row.brand : '',
        serving_size: num(row.servingSize, 1),
        serving_unit: str(row.servingUnit, 'serving'),
        calories_per_serving: num(row.caloriesPerServing, 0),
        protein_g: num(row.proteinG, 0),
        carbs_g: num(row.carbsG, 0),
        fat_g: num(row.fatG, 0),
        fiber_g: num(row.fiberG, 0),
        barcode: typeof row.barcode === 'string' ? row.barcode : null,
        is_custom: row.isCustom === true,
        created_by: typeof row.userId === 'string' ? row.userId : null,
        created_at: str(row.createdAt, nowIsoFallback()),
        category: typeof row.category === 'string' ? row.category : undefined,
        source: validSource(row.source),
        source_id: typeof row.sourceId === 'string' ? row.sourceId : undefined,
        aliases: Array.isArray(row.aliases) ? (row.aliases as unknown[]).filter((a): a is string => typeof a === 'string') : undefined,
        count_weight_g: typeof row.countWeightG === 'number' ? row.countWeightG : undefined,
        food_state: typeof row.foodState === 'string' ? (row.foodState as never) : undefined,
        preparation: typeof row.preparation === 'string' ? row.preparation : undefined,
        serving_description: typeof row.servingDescription === 'string' ? row.servingDescription : undefined,
        sugar_g: typeof row.sugarG === 'number' ? row.sugarG : undefined,
        sodium_mg: typeof row.sodiumMg === 'number' ? row.sodiumMg : undefined,
        is_estimated: row.isEstimated === true ? true : undefined,
      });
      return true;
    }
    case 'foodLog':
      await d.foodLogs.put({
        id,
        ownerId: o,
        user_id: o,
        food_item_id: str(row.foodItemId),
        date: str(row.date),
        meal_type: (['breakfast', 'lunch', 'dinner', 'snack'] as const).includes(row.mealType as never)
          ? (row.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack')
          : 'snack',
        servings: num(row.servings, 1),
        calories: num(row.calories, 0),
        protein_g: num(row.proteinG, 0),
        carbs_g: num(row.carbsG, 0),
        fat_g: num(row.fatG, 0),
        notes: typeof row.notes === 'string' ? row.notes : '',
        created_at: str(row.createdAt, nowIsoFallback()),
        quantity: typeof row.quantity === 'number' ? row.quantity : undefined,
        quantity_unit: typeof row.quantityUnit === 'string' ? (row.quantityUnit as never) : undefined,
        fiber_g: typeof row.fiberG === 'number' ? row.fiberG : undefined,
        sugar_g: typeof row.sugarG === 'number' ? row.sugarG : undefined,
        sodium_mg: typeof row.sodiumMg === 'number' ? row.sodiumMg : undefined,
        food_name: typeof row.foodName === 'string' ? row.foodName : undefined,
        is_estimated: row.isEstimated === true ? true : undefined,
      });
      return true;
    case 'favorite':
      await d.favoriteFoods.put({
        id,
        ownerId: o,
        user_id: o,
        food_id: str(row.foodId),
        created_at: str(row.createdAt, nowIsoFallback()),
      });
      return true;
    case 'recipe':
      await d.recipes.put({
        id,
        ownerId: o,
        user_id: o,
        food_item_id: str(row.foodItemId, id),
        name: str(row.name, 'Recipe'),
        description: typeof row.description === 'string' ? row.description : '',
        category: typeof row.category === 'string' ? row.category : '',
        preparation: typeof row.preparation === 'string' ? row.preparation : '',
        yield_quantity: num(row.yieldQuantity, 0),
        yield_unit: row.yieldUnit === 'ml' ? 'ml' : 'g',
        serving_quantity: typeof row.servingQuantity === 'number' ? row.servingQuantity : null,
        serving_description: typeof row.servingDescription === 'string' ? row.servingDescription : '',
        source: validRecipeSource(row.source),
        is_estimated: row.isEstimated === true,
        created_at: str(row.createdAt, nowIsoFallback()),
        updated_at: str(row.updatedAt, nowIsoFallback()),
      });
      return true;
    case 'recipeIngredient':
      await d.recipeIngredients.put({
        id,
        ownerId: o,
        recipe_id: str(row.recipeId),
        user_id: o,
        food_id: str(row.foodId),
        food_name: typeof row.foodName === 'string' ? row.foodName : '',
        quantity: num(row.quantity, 0),
        quantity_unit: (['g', 'kg', 'ml', 'L', 'count', 'serving'] as const).includes(row.quantityUnit as never)
          ? (row.quantityUnit as 'g' | 'kg' | 'ml' | 'L' | 'count' | 'serving')
          : 'g',
        sort_order: typeof row.sortOrder === 'number' ? Math.round(row.sortOrder) : 0,
        notes: typeof row.notes === 'string' ? row.notes : '',
        created_at: str(row.createdAt, nowIsoFallback()),
      });
      return true;
    case 'targetHistory':
      await d.targetHistory.put({
        id,
        ownerId: o,
        user_id: o,
        date: str(row.date),
        previous_target: num(row.previousTarget, 0),
        new_target: num(row.newTarget, 0),
        reason: typeof row.reason === 'string' ? row.reason : '',
        maintenance_estimate: typeof row.maintenanceEstimate === 'number' ? row.maintenanceEstimate : null,
        valid_days: typeof row.validDays === 'number' ? row.validDays : 0,
        confidence:
          row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
            ? row.confidence
            : 'low',
        goal:
          row.goal === 'cut' || row.goal === 'bulk' || row.goal === 'recomp' || row.goal === 'maintain' || row.goal === 'custom'
            ? row.goal
            : 'recomp',
        avg_intake_kcal: typeof row.avgIntakeKcal === 'number' ? row.avgIntakeKcal : null,
        previous_rate_kg_per_week: typeof row.previousRateKgPerWeek === 'number' ? row.previousRateKgPerWeek : null,
        new_rate_kg_per_week: typeof row.newRateKgPerWeek === 'number' ? row.newRateKgPerWeek : null,
        created_at: str(row.createdAt, nowIsoFallback()),
      });
      return true;
    case 'exercise':
      await d.exercises.put({
        id,
        ownerId: o,
        name: str(row.name, 'Exercise'),
        muscle_group: str(row.muscleGroup, 'full_body') as never,
        equipment: typeof row.equipment === 'string' ? row.equipment : '',
        instructions: typeof row.instructions === 'string' ? row.instructions : '',
        is_custom: row.isCustom === true,
        created_by: typeof row.userId === 'string' ? row.userId : null,
        created_at: str(row.createdAt, nowIsoFallback()),
      });
      return true;
    case 'workout': {
      const workoutId = id;
      await d.workouts.put({
        id: workoutId,
        ownerId: o,
        user_id: o,
        name: str(row.name, 'Workout'),
        date: str(row.date),
        start_time: str(row.startTime),
        end_time: typeof row.endTime === 'string' ? row.endTime : null,
        duration_minutes: typeof row.durationMinutes === 'number' ? row.durationMinutes : null,
        calories_burned: typeof row.caloriesBurned === 'number' ? row.caloriesBurned : null,
        notes: typeof row.notes === 'string' ? row.notes : '',
        exercises: [],
        created_at: str(row.createdAt, nowIsoFallback()),
      });
      // Graph replace: children are immutable snapshots of the server graph.
      const oldExercises = await d.workoutExercises.where('workout_id').equals(workoutId).toArray();
      const owned = oldExercises.filter((e) => e.ownerId === o);
      if (owned.length > 0) {
        await d.exerciseSets.where('workout_exercise_id').anyOf(owned.map((e) => e.id)).delete();
        await d.workoutExercises.where('workout_id').equals(workoutId).delete();
      }
      const exercises = Array.isArray(row.exercises) ? (row.exercises as Record<string, unknown>[]) : [];
      for (const we of exercises) {
        const weId = str(we.id);
        if (!weId) continue;
        await d.workoutExercises.put({
          id: weId,
          ownerId: o,
          workout_id: workoutId,
          exercise_id: str(we.exerciseId),
          sort_order: num(we.sortOrder, 0),
          notes: typeof we.notes === 'string' ? we.notes : '',
          sets: [],
          created_at: str(we.createdAt, nowIsoFallback()),
        });
        const sets = Array.isArray(we.sets) ? (we.sets as Record<string, unknown>[]) : [];
        for (const s of sets) {
          const setId = str(s.id);
          if (!setId) continue;
          await d.exerciseSets.put({
            id: setId,
            ownerId: o,
            workout_exercise_id: weId,
            set_number: num(s.setNumber, 1),
            weight_kg: typeof s.weightKg === 'number' ? s.weightKg : null,
            reps: typeof s.reps === 'number' ? s.reps : null,
            duration_seconds: typeof s.durationSeconds === 'number' ? s.durationSeconds : null,
            distance_km: typeof s.distanceMeters === 'number' ? s.distanceMeters : null,
            is_warmup: s.isWarmup === true,
            is_pr: false,
            rpe: null,
            created_at: str(s.createdAt, nowIsoFallback()),
          });
        }
      }
      return true;
    }
    case 'bodyMetric':
      await d.bodyMetrics.put({
        id,
        ownerId: o,
        user_id: o,
        date: str(row.date),
        weight_kg: num(row.weightKg, 0),
        height_cm: typeof row.heightCm === 'number' ? row.heightCm : 0,
        body_fat_percentage: typeof row.bodyFatPercentage === 'number' ? row.bodyFatPercentage : null,
        bmi: typeof row.bmi === 'number' ? row.bmi : null,
        waist_cm: typeof row.waistCm === 'number' ? row.waistCm : null,
        chest_cm: typeof row.chestCm === 'number' ? row.chestCm : null,
        arms_cm: typeof row.armsCm === 'number' ? row.armsCm : null,
        thighs_cm: typeof row.thighsCm === 'number' ? row.thighsCm : null,
        notes: typeof row.notes === 'string' ? row.notes : '',
        created_at: str(row.createdAt, nowIsoFallback()),
      });
      return true;
    case 'habit':
      await d.habits.put({
        id,
        ownerId: o,
        user_id: o,
        name: str(row.name, 'Habit'),
        icon: typeof row.icon === 'string' ? row.icon : 'target',
        color: typeof row.color === 'string' ? row.color : '#f59e0b',
        target_value: num(row.targetValue, 1),
        unit: typeof row.unit === 'string' ? row.unit : 'times',
        frequency: row.frequency === 'weekly' ? 'weekly' : 'daily',
        is_default: false,
        is_active: row.isActive !== false,
        sort_order: 0,
        created_at: str(row.createdAt, nowIsoFallback()),
        updated_at: str(row.updatedAt, nowIsoFallback()),
      });
      return true;
    case 'habitLog':
      await d.habitLogs.put({
        id,
        ownerId: o,
        habit_id: str(row.habitId),
        user_id: o,
        date: str(row.date),
        value: num(row.value, 0),
        completed: row.completed === true,
        notes: '',
        created_at: str(row.createdAt, nowIsoFallback()),
      });
      return true;
    default:
      return false;
  }
}

async function applyProfileRow(d: FuelUpLocalDb, o: string, row: Record<string, unknown>): Promise<void> {
  const existing = await d.profiles.get(o);
  const dob = typeof row.dateOfBirth === 'string' ? row.dateOfBirth.slice(0, 10) : existing?.date_of_birth ?? '';
  const gender = row.gender === 'male' || row.gender === 'female' || row.gender === 'other' ? row.gender : (existing?.gender ?? 'male');
  const goal = row.goal === 'cut' || row.goal === 'bulk' || row.goal === 'recomp' || row.goal === 'maintain' || row.goal === 'custom' ? row.goal : (existing?.goal ?? 'recomp');
  const targetSource = row.targetSource === 'adaptive' || row.targetSource === 'manual' ? row.targetSource : (existing?.target_source ?? 'initial');
  await d.profiles.put({
    id: existing?.id ?? `srv-${generateId()}`,
    ownerId: o,
    full_name: typeof row.name === 'string' && row.name ? row.name : (existing?.full_name ?? 'User'),
    email: typeof row.email === 'string' ? row.email : (existing?.email ?? ''),
    date_of_birth: dob,
    gender,
    activity_level: typeof row.activityLevel === 'string' && row.activityLevel ? (row.activityLevel as never) : (existing?.activity_level ?? 'moderately_active'),
    goal,
    unit_system: existing?.unit_system ?? 'metric',
    daily_calorie_target: num(row.dailyCalorieTarget, existing?.daily_calorie_target ?? 2000),
    protein_target_g: num(row.proteinTargetG, existing?.protein_target_g ?? 150),
    carbs_target_g: num(row.carbsTargetG, existing?.carbs_target_g ?? 200),
    fat_target_g: num(row.fatTargetG, existing?.fat_target_g ?? 65),
    // Phase 7: adaptive preferences (whole-profile upsert; fall back to local).
    target_rate_kg_per_week:
      typeof row.targetRateKgPerWeek === 'number' ? row.targetRateKgPerWeek : (existing?.target_rate_kg_per_week ?? null),
    target_source: targetSource,
    created_at: existing?.created_at ?? nowIsoFallback(),
    updated_at: nowIsoFallback(),
  });
}

async function applyDeletion(d: FuelUpLocalDb, o: string, entity: SyncEntity, del: SyncDeletionChange): Promise<void> {
  const id = del.entityId;
  switch (entity) {
    case 'foodItem':
      await d.foodItems.delete(id);
      break;
    case 'foodLog':
      await d.foodLogs.delete(id);
      break;
    case 'exercise':
      await d.exercises.delete(id);
      break;
    case 'workout': {
      const exercises = await d.workoutExercises.where('workout_id').equals(id).toArray();
      const owned = exercises.filter((e) => e.ownerId === o);
      if (owned.length > 0) {
        await d.exerciseSets.where('workout_exercise_id').anyOf(owned.map((e) => e.id)).delete();
      }
      await d.workoutExercises.where('workout_id').equals(id).delete();
      await d.workouts.delete(id);
      break;
    }
    case 'bodyMetric':
      await d.bodyMetrics.delete(id);
      break;
    case 'habit':
      // Cascade habit logs (small table: filtered delete avoids sentinels).
      await d.habitLogs.toCollection().filter((l) => l.ownerId === o && l.habit_id === id).delete();
      await d.habits.delete(id);
      break;
    case 'habitLog':
      await d.habitLogs.delete(id);
      break;
    case 'favorite':
      await d.favoriteFoods.delete(id);
      break;
    case 'recipe':
      // Cascade ingredients + the materialized food item (shares the id).
      await d.recipeIngredients.toCollection().filter((r) => r.ownerId === o && r.recipe_id === id).delete();
      await d.foodItems.delete(id);
      await d.recipes.delete(id);
      break;
    case 'recipeIngredient':
      await d.recipeIngredients.delete(id);
      break;
    case 'targetHistory':
      await d.targetHistory.delete(id);
      break;
    case 'profile':
      break; // profiles are never tombstoned
  }
}

function nowIsoFallback(): string {
  return new Date().toISOString();
}

function validRecipeSource(v: unknown): import('@/lib/types').FoodSource {
  return v === 'builtin' || v === 'verified' || v === 'branded' || v === 'user' || v === 'recipe' || v === 'imported' || v === 'estimated'
    ? v
    : 'user';
}
