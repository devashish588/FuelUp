// =============================================
// FuelUp - Server push application (server-only: Prisma, no client imports)
// Ownership ALWAYS comes from the `userId` argument (Clerk session via
// requireDbUser). Client payloads never carry authority: every existing row
// is owner-checked before write, and every write is stamped with `userId`.
// Idempotency: (1) ProcessedMutation dedupe on mutationId, (2) entity
// upserts on stable client ids, (3) same-date merges for metrics/habit logs
// (unique-constraint races resolve to update, never duplicate).
// =============================================
import { db as realDb } from '@/lib/db';
import { Prisma, type PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger/logger';
import { SYNC_PAYLOAD_SCHEMAS } from '@/lib/validation/sync';
import { z } from 'zod';
import type {
  SyncEntity,
  SyncEventResult,
  SyncOperation,
  SyncPushEvent,
} from '@/lib/sync/sync-contracts';

const deletePayloadSchema = z.object({ id: z.string().min(1).max(128) }).passthrough();

type Tx = PrismaClient;

const INVALID = (mutationId: string, error: string): SyncEventResult => ({
  mutationId,
  status: 'invalid',
  error,
});
const OK = (mutationId: string): SyncEventResult => ({ mutationId, status: 'ok' });

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Push order: referenced rows (items, habits, recipes) before dependents. */
const ENTITY_PRIORITY: Record<SyncEntity, number> = {
  profile: 0,
  foodItem: 1,
  exercise: 1,
  habit: 1,
  favorite: 1,
  recipe: 1,
  bodyMetric: 2,
  foodLog: 3,
  habitLog: 3,
  workout: 3,
  recipeIngredient: 3,
  targetHistory: 3,
};

export async function applyPushEvents(
  userId: string,
  events: SyncPushEvent[],
  db: PrismaClient = realDb as PrismaClient
): Promise<SyncEventResult[]> {
  const ordered = [...events].sort((a, b) => ENTITY_PRIORITY[a.entity] - ENTITY_PRIORITY[b.entity]);
  const results: SyncEventResult[] = [];
  for (const event of ordered) {
    try {
      results.push(await applyOneEvent(db, userId, event));
    } catch (error) {
      logger.error('Sync push event failed', { entity: event.entity });
      void error;
      results.push({ mutationId: event.mutationId, status: 'retryable' });
    }
  }
  return results;
}

async function applyOneEvent(db: PrismaClient, userId: string, event: SyncPushEvent): Promise<SyncEventResult> {
  // Deletes carry only an id; upserts/creates carry the full row snapshot.
  const schema = event.operation === 'delete' ? deletePayloadSchema : SYNC_PAYLOAD_SCHEMAS[event.entity];
  const parsed = schema.safeParse(event.payload);
  if (!parsed.success || parsed.data.id !== event.entityId) {
    return INVALID(event.mutationId, 'That change was invalid and was skipped.');
  }
  const payload = parsed.data as Record<string, unknown> & { id: string };

  const seen = await db.processedMutation.findUnique({ where: { mutationId: event.mutationId } });
  if (seen) return { mutationId: event.mutationId, status: 'duplicate' };

  try {
    await (db.$transaction as unknown as (fn: (tx: Tx) => Promise<unknown>) => Promise<unknown>)(async (tx) => {
      await applyEntity(tx, userId, event.entity, event.operation, payload);
      await tx.processedMutation.create({
        data: { mutationId: event.mutationId, userId, entity: event.entity, entityId: event.entityId },
      });
    });
    return OK(event.mutationId);
  } catch (error) {
    if (isConflictError(error)) {
      return { mutationId: event.mutationId, status: 'conflict', error: 'That change belongs to a different record.' };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Lost a dedupe race (same mutation retried concurrently).
      if (error.code === 'P2002' && isProcessedMutationConflict(error)) {
        return { mutationId: event.mutationId, status: 'duplicate' };
      }
      // Same-date metric/log from another device: merge into the survivor.
      if (error.code === 'P2002') {
        const merged = await mergeOnDateConflict(db, userId, event.entity, payload, event.mutationId);
        if (merged) return OK(event.mutationId);
        return INVALID(event.mutationId, 'That change conflicts with an existing record.');
      }
      if (error.code === 'P2025') return OK(event.mutationId); // deleting what's gone
      if (error.code === 'P2003') return INVALID(event.mutationId, 'That change references a missing record.');
    }
    throw error;
  }
}

function isProcessedMutationConflict(error: Prisma.PrismaClientKnownRequestError): boolean {
  const target = (error.meta?.target as string[] | undefined) ?? [];
  return target.includes('mutation_id') || target.includes('mutationId');
}

function ownedBy<T extends { userId: string | null }>(row: T | null, userId: string): row is T {
  return !!row && (row.userId === userId || row.userId === null);
}

async function applyEntity(
  tx: Tx,
  userId: string,
  entity: SyncEntity,
  operation: SyncOperation,
  payload: Record<string, unknown> & { id: string }
): Promise<void> {
  switch (entity) {
    case 'profile':
      await applyProfile(tx, userId, payload);
      break;
    case 'foodItem':
      if (operation === 'delete') await deleteOwned(tx, 'foodItem', userId, payload.id);
      else await applyFoodItem(tx, userId, payload);
      break;
    case 'foodLog':
      if (operation === 'delete') await deleteOwned(tx, 'foodLog', userId, payload.id);
      else await applyFoodLog(tx, userId, payload);
      break;
    case 'exercise':
      if (operation === 'delete') await deleteOwned(tx, 'exercise', userId, payload.id);
      else await applyExercise(tx, userId, payload);
      break;
    case 'workout':
      if (operation === 'delete') await deleteWorkout(tx, userId, payload.id);
      else await applyWorkoutGraph(tx, userId, payload);
      break;
    case 'bodyMetric':
      if (operation === 'delete') await deleteOwned(tx, 'bodyMetric', userId, payload.id);
      else await applyBodyMetric(tx, userId, payload);
      break;
    case 'habit':
      if (operation === 'delete') await deleteHabit(tx, userId, payload.id);
      else await applyHabit(tx, userId, payload);
      break;
    case 'habitLog':
      if (operation === 'delete') await deleteOwned(tx, 'habitLog', userId, payload.id);
      else await applyHabitLog(tx, userId, payload);
      break;
    case 'favorite':
      if (operation === 'delete') await deleteFavorite(tx, userId, payload.id);
      else await applyFavorite(tx, userId, payload);
      break;
    case 'recipe':
      if (operation === 'delete') await deleteRecipe(tx, userId, payload.id);
      else await applyRecipe(tx, userId, payload);
      break;
    case 'recipeIngredient':
      if (operation === 'delete') await deleteRecipeIngredient(tx, userId, payload.id);
      else await applyRecipeIngredient(tx, userId, payload);
      break;
    case 'targetHistory':
      if (operation === 'delete') await deleteTargetHistory(tx, userId, payload.id);
      else await applyTargetHistory(tx, userId, payload);
      break;
  }
}

const VALID_GOALS = ['cut', 'bulk', 'recomp', 'maintain', 'custom'];
const VALID_TARGET_SOURCES = ['initial', 'adaptive', 'manual'];

async function applyProfile(tx: Tx, userId: string, p: Record<string, unknown>): Promise<void> {
  // Email is owned by Clerk/webhook — never overwritten from sync.
  const rate = typeof p.target_rate_kg_per_week === 'number' ? p.target_rate_kg_per_week : null;
  await tx.user.update({
    where: { id: userId },
    data: {
      name: str(p.full_name) || null,
      gender: str(p.gender) || null,
      activityLevel: str(p.activity_level, 'moderate'),
      goal: VALID_GOALS.includes(p.goal as string) ? (p.goal as string) : 'recomp',
      dailyCalorieTarget: num(p.daily_calorie_target, 2000),
      proteinTargetG: num(p.protein_target_g, 150),
      carbsTargetG: num(p.carbs_target_g, 200),
      fatTargetG: num(p.fat_target_g, 65),
      // Phase 7: adaptive preferences travel with the profile (whole-row upsert).
      targetRateKgPerWeek: rate === null ? null : Math.min(Math.max(rate, 0), 1.5),
      targetSource: VALID_TARGET_SOURCES.includes(p.target_source as string) ? (p.target_source as string) : 'initial',
    },
  });
}

async function applyFoodItem(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.foodItem.findUnique({ where: { id: p.id } });
  if (existing && !ownedBy(existing, userId)) throw conflictError();
  const source = typeof p.source === 'string' ? p.source : 'user';
  const foodState = typeof p.food_state === 'string' ? p.food_state : null;
  const data = {
    userId,
    name: str(p.name),
    brand: typeof p.brand === 'string' ? p.brand : null,
    servingSize: num(p.serving_size, 1),
    servingUnit: str(p.serving_unit, 'serving'),
    caloriesPerServing: num(p.calories_per_serving, 0),
    proteinG: num(p.protein_g, 0),
    carbsG: num(p.carbs_g, 0),
    fatG: num(p.fat_g, 0),
    fiberG: num(p.fiber_g, 0),
    barcode: typeof p.barcode === 'string' ? p.barcode : null,
    isCustom: true,
    category: str(p.category),
    source,
    sourceId: typeof p.source_id === 'string' ? p.source_id : null,
    aliases: Array.isArray(p.aliases) ? (p.aliases as unknown[]).filter((a): a is string => typeof a === 'string').slice(0, 20) : [],
    countWeightG: typeof p.count_weight_g === 'number' ? p.count_weight_g : null,
    foodState,
    preparation: typeof p.preparation === 'string' ? p.preparation : null,
    servingDescription: typeof p.serving_description === 'string' ? p.serving_description : null,
    sugarG: typeof p.sugar_g === 'number' ? p.sugar_g : null,
    sodiumMg: typeof p.sodium_mg === 'number' ? p.sodium_mg : null,
    isEstimated: p.is_estimated === true,
  };
  await tx.foodItem.upsert({
    where: { id: p.id },
    create: { id: p.id, ...data },
    update: data,
  });
}

/** Seed-catalog foods never sync as items: provision a shared stub for the FK. */
async function ensureFoodItem(
  tx: Tx,
  foodItemId: string,
  snapshot: Record<string, unknown> | undefined
): Promise<void> {
  const existing = await tx.foodItem.findUnique({ where: { id: foodItemId } });
  if (existing) return;
  await tx.foodItem.create({
    data: {
      id: foodItemId,
      userId: null,
      name: str(snapshot?.name, 'Food'),
      brand: typeof snapshot?.brand === 'string' ? (snapshot.brand as string) : null,
      servingSize: 1,
      servingUnit: str(snapshot?.serving_unit, 'serving'),
      caloriesPerServing: num(snapshot?.calories_per_serving, 0),
      proteinG: num(snapshot?.protein_g, 0),
      carbsG: num(snapshot?.carbs_g, 0),
      fatG: num(snapshot?.fat_g, 0),
      isCustom: false,
    },
  });
}

async function applyFoodLog(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.foodLog.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  await ensureFoodItem(tx, str(p.food_item_id), p.foodSnapshot as Record<string, unknown> | undefined);
  const data = {
    userId,
    foodItemId: str(p.food_item_id),
    date: str(p.date),
    mealType: str(p.meal_type),
    servings: num(p.servings, 1),
    calories: num(p.calories, 0),
    proteinG: num(p.protein_g, 0),
    carbsG: num(p.carbs_g, 0),
    fatG: num(p.fat_g, 0),
    notes: typeof p.notes === 'string' ? p.notes : null,
    quantity: typeof p.quantity === 'number' ? p.quantity : null,
    quantityUnit: typeof p.quantity_unit === 'string' ? p.quantity_unit : null,
    fiberG: typeof p.fiber_g === 'number' ? p.fiber_g : null,
    sugarG: typeof p.sugar_g === 'number' ? p.sugar_g : null,
    sodiumMg: typeof p.sodium_mg === 'number' ? p.sodium_mg : null,
    foodName: typeof p.food_name === 'string' ? p.food_name : null,
    isEstimated: p.is_estimated === true,
  };
  await tx.foodLog.upsert({
    where: { id: p.id },
    create: { id: p.id, ...data },
    update: data,
  });
}

async function applyFavorite(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const foodId = str(p.food_id);
  if (!foodId) throw conflictError();
  const existing = await tx.favoriteFood.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  await tx.favoriteFood.upsert({
    where: { id: p.id },
    create: { id: p.id, userId, foodId },
    update: { foodId },
  });
}

async function deleteFavorite(tx: Tx, userId: string, id: string): Promise<void> {
  const existing = await tx.favoriteFood.findUnique({ where: { id } });
  if (!existing) return; // already gone: idempotent success
  if (existing.userId !== userId) throw conflictError();
  await tx.favoriteFood.delete({ where: { id } });
  await journalDeletion(tx, userId, 'favorite', id);
}

async function applyTargetHistory(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.targetHistory.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  const data = {
    userId,
    date: str(p.date),
    previousTarget: Math.round(num(p.previous_target, 0)),
    newTarget: Math.round(num(p.new_target, 0)),
    reason: typeof p.reason === 'string' ? p.reason.slice(0, 1000) : '',
    maintenanceEstimate: typeof p.maintenance_estimate === 'number' ? Math.round(p.maintenance_estimate) : null,
    validDays: typeof p.valid_days === 'number' ? Math.round(p.valid_days) : null,
    confidence: p.confidence === 'high' || p.confidence === 'medium' || p.confidence === 'low' ? (p.confidence as string) : null,
    goal: VALID_GOALS.includes(p.goal as string) ? (p.goal as string) : 'recomp',
    avgIntakeKcal: typeof p.avg_intake_kcal === 'number' ? Math.round(p.avg_intake_kcal) : null,
  };
  await tx.targetHistory.upsert({
    where: { id: p.id },
    create: { id: p.id, ...data },
    update: data,
  });
}

async function deleteTargetHistory(tx: Tx, userId: string, id: string): Promise<void> {
  const existing = await tx.targetHistory.findUnique({ where: { id } });
  if (!existing) return; // already gone: idempotent success
  if (existing.userId !== userId) throw conflictError();
  await tx.targetHistory.delete({ where: { id } });
  await journalDeletion(tx, userId, 'targetHistory', id);
}

async function applyRecipe(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.recipe.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  const data = {
    userId,
    foodItemId: str(p.food_item_id, p.id),
    name: str(p.name),
    description: typeof p.description === 'string' ? p.description : '',
    category: typeof p.category === 'string' ? p.category : '',
    preparation: typeof p.preparation === 'string' ? p.preparation : '',
    yieldQuantity: num(p.yield_quantity, 0),
    yieldUnit: p.yield_unit === 'ml' ? 'ml' : 'g',
    servingQuantity: typeof p.serving_quantity === 'number' ? p.serving_quantity : null,
    servingDescription: typeof p.serving_description === 'string' ? p.serving_description : '',
    source: typeof p.source === 'string' ? p.source : 'user',
    isEstimated: p.is_estimated === true,
  };
  await tx.recipe.upsert({
    where: { id: p.id },
    create: { id: p.id, ...data },
    update: data,
  });
}

async function applyRecipeIngredient(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const recipeId = str(p.recipe_id);
  const recipe = await tx.recipe.findUnique({ where: { id: recipeId } });
  // An ingredient may only attach to the user's own recipe.
  if (!recipe || recipe.userId !== userId) throw conflictError();
  const existing = await tx.recipeIngredient.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  const data = {
    userId,
    recipeId,
    foodId: str(p.food_id),
    foodName: typeof p.food_name === 'string' ? p.food_name : '',
    quantity: num(p.quantity, 0),
    quantityUnit: str(p.quantity_unit, 'g'),
    sortOrder: typeof p.sort_order === 'number' ? Math.round(p.sort_order) : 0,
    notes: typeof p.notes === 'string' ? p.notes : '',
  };
  await tx.recipeIngredient.upsert({
    where: { id: p.id },
    create: { id: p.id, ...data },
    update: data,
  });
}

async function deleteRecipe(tx: Tx, userId: string, id: string): Promise<void> {
  const existing = await tx.recipe.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.userId !== userId) throw conflictError();
  await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
  await tx.recipe.delete({ where: { id } });
  // The materialized FoodItem shares the recipe id: remove + tombstone it so
  // no orphan recipe-food lingers on any device.
  const item = await tx.foodItem.findUnique({ where: { id } });
  if (item && item.userId === userId) {
    await tx.foodItem.delete({ where: { id } });
    await journalDeletion(tx, userId, 'foodItem', id);
  }
  // Clients cascade ingredients locally from the recipe tombstone
  // (same pattern as habit → habitLog).
  await journalDeletion(tx, userId, 'recipe', id);
}

async function deleteRecipeIngredient(tx: Tx, userId: string, id: string): Promise<void> {
  const existing = await tx.recipeIngredient.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.userId !== userId) throw conflictError();
  await tx.recipeIngredient.delete({ where: { id } });
  await journalDeletion(tx, userId, 'recipeIngredient', id);
}

async function ensureExercise(
  tx: Tx,
  exerciseId: string,
  snapshot: Record<string, unknown> | undefined
): Promise<void> {
  const existing = await tx.exercise.findUnique({ where: { id: exerciseId } });
  if (existing) return;
  await tx.exercise.create({
    data: {
      id: exerciseId,
      userId: null,
      name: str(snapshot?.name, 'Exercise'),
      muscleGroup: str(snapshot?.muscle_group, 'full_body'),
      isCustom: false,
    },
  });
}

async function applyExercise(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.exercise.findUnique({ where: { id: p.id } });
  if (existing && !ownedBy(existing, userId)) throw conflictError();
  await tx.exercise.upsert({
    where: { id: p.id },
    create: {
      id: p.id,
      userId,
      name: str(p.name),
      muscleGroup: str(p.muscle_group, 'full_body'),
      equipment: typeof p.equipment === 'string' ? p.equipment : null,
      instructions: typeof p.instructions === 'string' ? p.instructions : null,
      isCustom: true,
    },
    update: {
      name: str(p.name),
      muscleGroup: str(p.muscle_group, 'full_body'),
      equipment: typeof p.equipment === 'string' ? p.equipment : null,
      instructions: typeof p.instructions === 'string' ? p.instructions : null,
    },
  });
}

async function applyWorkoutGraph(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.workout.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  await tx.workout.upsert({
    where: { id: p.id },
    create: {
      id: p.id,
      userId,
      name: str(p.name),
      date: str(p.date),
      startTime: str(p.start_time),
      endTime: typeof p.end_time === 'string' ? p.end_time : null,
      durationMinutes: typeof p.duration_minutes === 'number' ? p.duration_minutes : null,
      caloriesBurned: typeof p.calories_burned === 'number' ? p.calories_burned : null,
      notes: typeof p.notes === 'string' ? p.notes : null,
    },
    update: {
      name: str(p.name),
      date: str(p.date),
      endTime: typeof p.end_time === 'string' ? p.end_time : null,
      durationMinutes: typeof p.duration_minutes === 'number' ? p.duration_minutes : null,
      caloriesBurned: typeof p.calories_burned === 'number' ? p.calories_burned : null,
      notes: typeof p.notes === 'string' ? p.notes : null,
    },
  });
  const exercises = Array.isArray(p.exercises) ? (p.exercises as Record<string, unknown>[]) : [];
  for (const [index, raw] of exercises.entries()) {
    const weId = str(raw.id);
    const exerciseId = str(raw.exercise_id);
    if (!weId || !exerciseId) continue;
    await ensureExercise(tx, exerciseId, raw.exerciseSnapshot as Record<string, unknown> | undefined);
    await tx.workoutExercise.upsert({
      where: { id: weId },
      create: { id: weId, workoutId: p.id, exerciseId, sortOrder: num(raw.sort_order, index), notes: typeof raw.notes === 'string' ? raw.notes : null },
      update: { exerciseId, sortOrder: num(raw.sort_order, index), notes: typeof raw.notes === 'string' ? raw.notes : null },
    });
    const sets = Array.isArray(raw.sets) ? (raw.sets as Record<string, unknown>[]) : [];
    for (const s of sets) {
      const setId = str(s.id);
      if (!setId) continue;
      await tx.exerciseSet.upsert({
        where: { id: setId },
        create: {
          id: setId,
          workoutExerciseId: weId,
          setNumber: num(s.set_number, 1),
          reps: typeof s.reps === 'number' ? s.reps : null,
          weightKg: typeof s.weight_kg === 'number' ? s.weight_kg : null,
          durationSeconds: typeof s.duration_seconds === 'number' ? s.duration_seconds : null,
          distanceMeters: typeof s.distance_meters === 'number' ? s.distance_meters : null,
          isWarmup: s.is_warmup === true,
        },
        update: {
          setNumber: num(s.set_number, 1),
          reps: typeof s.reps === 'number' ? s.reps : null,
          weightKg: typeof s.weight_kg === 'number' ? s.weight_kg : null,
          durationSeconds: typeof s.duration_seconds === 'number' ? s.duration_seconds : null,
          distanceMeters: typeof s.distance_meters === 'number' ? s.distance_meters : null,
          isWarmup: s.is_warmup === true,
        },
      });
    }
  }
}

async function applyBodyMetric(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.bodyMetric.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  const data = {
    userId,
    date: str(p.date),
    weightKg: num(p.weight_kg, 0),
    heightCm: typeof p.height_cm === 'number' ? p.height_cm : null,
    bmi: typeof p.bmi === 'number' ? p.bmi : null,
    bodyFatPercentage: typeof p.body_fat_percentage === 'number' ? p.body_fat_percentage : null,
    waistCm: typeof p.waist_cm === 'number' ? p.waist_cm : null,
    chestCm: typeof p.chest_cm === 'number' ? p.chest_cm : null,
    armsCm: typeof p.arms_cm === 'number' ? p.arms_cm : null,
    thighsCm: typeof p.thighs_cm === 'number' ? p.thighs_cm : null,
    notes: typeof p.notes === 'string' ? p.notes : null,
  };
  await tx.bodyMetric.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
}

async function applyHabit(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const existing = await tx.habit.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  const data = {
    userId,
    name: str(p.name),
    icon: typeof p.icon === 'string' ? p.icon : 'target',
    color: typeof p.color === 'string' ? p.color : '#f59e0b',
    targetValue: num(p.target_value, 1),
    unit: str(p.unit, 'times'),
    frequency: p.frequency === 'weekly' ? 'weekly' : 'daily',
    isActive: p.is_active !== false,
  };
  await tx.habit.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
}

async function applyHabitLog(tx: Tx, userId: string, p: Record<string, unknown> & { id: string }): Promise<void> {
  const habitId = str(p.habit_id);
  const habit = await tx.habit.findUnique({ where: { id: habitId } });
  // A log may only attach to the user's own habit (shared stubs never apply).
  if (!habit || habit.userId !== userId) throw conflictError();
  const existing = await tx.habitLog.findUnique({ where: { id: p.id } });
  if (existing && existing.userId !== userId) throw conflictError();
  const data = {
    userId,
    habitId,
    date: str(p.date),
    value: num(p.value, 0),
    completed: p.completed === true,
  };
  await tx.habitLog.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
}

async function deleteOwned(tx: Tx, model: 'foodItem' | 'foodLog' | 'exercise' | 'bodyMetric' | 'habitLog', userId: string, id: string): Promise<void> {
  const entity = modelToEntity(model);
  if (model === 'foodItem') {
    const existing = await tx.foodItem.findUnique({ where: { id } });
    if (!existing) return;
    if (existing.userId !== userId) throw conflictError();
    await tx.foodItem.delete({ where: { id } });
  } else if (model === 'foodLog') {
    const existing = await tx.foodLog.findUnique({ where: { id } });
    if (!existing) return;
    if (existing.userId !== userId) throw conflictError();
    await tx.foodLog.delete({ where: { id } });
  } else if (model === 'exercise') {
    const existing = await tx.exercise.findUnique({ where: { id } });
    if (!existing) return;
    if (existing.userId !== userId) throw conflictError();
    await tx.exercise.delete({ where: { id } });
  } else if (model === 'bodyMetric') {
    const existing = await tx.bodyMetric.findUnique({ where: { id } });
    if (!existing) return;
    if (existing.userId !== userId) throw conflictError();
    await tx.bodyMetric.delete({ where: { id } });
  } else {
    const existing = await tx.habitLog.findUnique({ where: { id } });
    if (!existing) return;
    if (existing.userId !== userId) throw conflictError();
    await tx.habitLog.delete({ where: { id } });
  }
  await journalDeletion(tx, userId, entity, id);
}

async function deleteWorkout(tx: Tx, userId: string, id: string): Promise<void> {
  const existing = await tx.workout.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.userId !== userId) throw conflictError();
  const exercises = await tx.workoutExercise.findMany({ where: { workoutId: id } });
  await tx.exerciseSet.deleteMany({ where: { workoutExerciseId: { in: exercises.map((e) => e.id) } } });
  await tx.workoutExercise.deleteMany({ where: { workoutId: id } });
  await tx.workout.delete({ where: { id } });
  // Clients cascade children locally from the workout tombstone.
  await journalDeletion(tx, userId, 'workout', id);
}

async function deleteHabit(tx: Tx, userId: string, id: string): Promise<void> {
  const existing = await tx.habit.findUnique({ where: { id } });
  if (!existing) return;
  if (existing.userId !== userId) throw conflictError();
  await tx.habitLog.deleteMany({ where: { habitId: id } });
  await tx.habit.delete({ where: { id } });
  // Clients cascade logs locally from the habit tombstone.
  await journalDeletion(tx, userId, 'habit', id);
}

async function journalDeletion(tx: Tx, userId: string, entity: SyncEntity, entityId: string): Promise<void> {
  await tx.syncDeletion.upsert({
    where: { mutationId: `del:${entity}:${entityId}:${userId}` },
    create: { userId, entity, entityId, mutationId: `del:${entity}:${entityId}:${userId}` },
    update: {},
  });
}

function modelToEntity(model: 'foodItem' | 'foodLog' | 'exercise' | 'bodyMetric' | 'habitLog'): SyncEntity {
  return model;
}

/** Same-date survivor merge (unique-constraint race across devices). */
async function mergeOnDateConflict(
  db: PrismaClient,
  userId: string,
  entity: SyncEntity,
  payload: Record<string, unknown> & { id: string },
  mutationId: string
): Promise<boolean> {
  try {
    if (entity === 'bodyMetric') {
      const survivor = await db.bodyMetric.findUnique({
        where: { userId_date: { userId, date: str(payload.date) } },
      });
      if (!survivor || survivor.userId !== userId) return false;
      await db.bodyMetric.update({ where: { id: survivor.id }, data: { weightKg: num(payload.weight_kg, survivor.weightKg) } });
      await db.processedMutation.create({ data: { mutationId, userId, entity, entityId: survivor.id } });
      return true;
    }
    if (entity === 'habitLog') {
      const survivor = await db.habitLog.findUnique({
        where: { habitId_date: { habitId: str(payload.habit_id), date: str(payload.date) } },
      });
      if (!survivor || survivor.userId !== userId) return false;
      await db.habitLog.update({ where: { id: survivor.id }, data: { value: num(payload.value, 0), completed: payload.completed === true } });
      await db.processedMutation.create({ data: { mutationId, userId, entity, entityId: survivor.id } });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function conflictError(): Error {
  const error = new Error('SYNC_CONFLICT');
  (error as { code?: string }).code = 'SYNC_CONFLICT';
  return error;
}

/** Cross-owner writes surface as `conflict` results (caller maps them). */
export function isConflictError(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === 'SYNC_CONFLICT';
}
