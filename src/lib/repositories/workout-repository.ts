// =============================================
// FuelUp - Workout repository
// Finished workouts persist as a graph (workout + exercises + sets) in one
// transaction. Sets are repeatable events — no dedupe beyond their ids.
// The in-progress (active) workout is UI state and stays in Zustand memory
// (persisted draft only); only finished workouts + custom exercises + the
// weekly plan live in IndexedDB.
// Sync: finished graphs + custom exercises enqueue push events. The weekly
// routine plan is LOCAL-ONLY (no server model exists) and never enqueues.
// =============================================
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import type { Exercise, ExerciseSet, Workout, WorkoutExercise } from '@/lib/types';
import type { LocalWeeklyPlan } from '@/lib/db/local-entities';
import { enqueueSyncEvent } from '@/lib/sync/outbox';
import { omitOwner, repoContext, repoError, withoutKeys } from './base';

function strip<T extends { ownerId: string }>(row: T): Omit<T, 'ownerId'> {
  return omitOwner(row);
}

export interface WorkoutGraph {
  workout: Workout;
  exercises: WorkoutExercise[];
  setsByExercise: Record<string, ExerciseSet[]>;
}

export async function listCustomExercises(ownerId: string, db?: FuelUpLocalDb): Promise<Exercise[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const rows = await d.exercises.where('ownerId').equals(o).toArray();
    return rows.map((r) => strip(r) as Exercise);
  } catch (error) {
    repoError('exercises', 'load', error);
  }
}

export async function saveCustomExercise(
  ownerId: string,
  exercise: Exercise,
  db?: FuelUpLocalDb
): Promise<Exercise> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.exercises.put({ ...exercise, ownerId: o });
    await enqueueSyncEvent(o, { entity: 'exercise', entityId: exercise.id, operation: 'upsert', payload: { ...exercise } }, d);
    return exercise;
  } catch (error) {
    repoError('exercise', 'save', error);
  }
}

export async function listWorkouts(ownerId: string, db?: FuelUpLocalDb): Promise<Workout[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const workouts = await d.workouts.where('ownerId').equals(o).toArray();
    const ids = workouts.map((w) => w.id);
    const exercises = ids.length > 0
      ? await d.workoutExercises.where('workout_id').anyOf(ids).toArray()
      : [];
    const allSets = exercises.length > 0
      ? await d.exerciseSets.where('workout_exercise_id').anyOf(exercises.map((e) => e.id)).toArray()
      : [];
    const setsByExercise = new Map<string, typeof allSets>();
    for (const s of allSets) {
      const list = setsByExercise.get(s.workout_exercise_id) ?? [];
      list.push(s);
      setsByExercise.set(s.workout_exercise_id, list);
    }
    const exercisesByWorkout = new Map<string, WorkoutExercise[]>();
    for (const e of exercises) {
      const we = omitOwner(e);
      const list = exercisesByWorkout.get(e.workout_id) ?? [];
      list.push({ ...we, sets: (setsByExercise.get(e.id) ?? []).map((s) => strip(s) as ExerciseSet) });
      exercisesByWorkout.set(e.workout_id, list);
    }
    return workouts.map((w) => {
      const workout = omitOwner(w);
      return { ...workout, exercises: exercisesByWorkout.get(w.id) ?? [] };
    });
  } catch (error) {
    repoError('workouts', 'load', error);
  }
}

export async function listWorkoutsForDate(
  ownerId: string,
  date: string,
  db?: FuelUpLocalDb
): Promise<Workout[]> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    const ids = await d.workouts.where('[ownerId+date]').equals([o, date]).primaryKeys();
    if (ids.length === 0) return [];
    const all = await listWorkouts(ownerId, db);
    const wanted = new Set(ids);
    return all.filter((w) => wanted.has(w.id));
  } catch (error) {
    repoError('workouts', 'load', error);
  }
}

/** Persist a finished workout with its full exercise/set graph atomically. */
export async function saveFinishedWorkout(ownerId: string, graph: WorkoutGraph, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.transaction('rw', d.workouts, d.workoutExercises, d.exerciseSets, async () => {
      const workout = withoutKeys(graph.workout, 'exercises');
      await d.workouts.put({ ...workout, exercises: [], ownerId: o });
      for (const we of graph.exercises) {
        const weRow = withoutKeys(we, 'sets', 'exercise');
        // Sets live in exerciseSets; the exercise row keeps an empty join slot.
        await d.workoutExercises.put({ ...weRow, sets: [], ownerId: o });
        const sets = graph.setsByExercise[we.id] ?? we.sets ?? [];
        for (const s of sets) {
          await d.exerciseSets.put({ ...s, workout_exercise_id: we.id, ownerId: o });
        }
      }
    });
    await enqueueSyncEvent(
      o,
      {
        entity: 'workout',
        entityId: graph.workout.id,
        operation: 'create',
        payload: {
          ...withoutKeys(graph.workout, 'exercises'),
          exercises: graph.exercises.map((we) => ({
            ...withoutKeys(we, 'sets', 'exercise'),
            // Seed-catalog exercises never sync as items; the snapshot lets
            // the server provision a shared stub for the FK (see apply-push).
            exerciseSnapshot: we.exercise
              ? { name: we.exercise.name, muscle_group: we.exercise.muscle_group }
              : undefined,
            sets: graph.setsByExercise[we.id] ?? we.sets ?? [],
          })),
        },
      },
      d
    );
  } catch (error) {
    repoError('workout', 'save', error);
  }
}

export async function removeWorkout(ownerId: string, id: string, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.transaction('rw', d.workouts, d.workoutExercises, d.exerciseSets, async () => {
      const w = await d.workouts.get(id);
      if (!w || w.ownerId !== o) return;
      const exercises = await d.workoutExercises.where('workout_id').equals(id).toArray();
      const owned = exercises.filter((e) => e.ownerId === o);
      await d.exerciseSets.where('workout_exercise_id').anyOf(owned.map((e) => e.id)).delete();
      await d.workoutExercises.where('workout_id').equals(id).delete();
      await d.workouts.delete(id);
    });
    await enqueueSyncEvent(o, { entity: 'workout', entityId: id, operation: 'delete', payload: { id } }, d);
  } catch (error) {
    repoError('workout', 'delete', error);
  }
}

export async function getWeeklyPlan(ownerId: string, db?: FuelUpLocalDb): Promise<LocalWeeklyPlan | null> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    return (await d.weeklyPlans.get(o)) ?? null;
  } catch (error) {
    repoError('workout plan', 'load', error);
  }
}

export async function saveWeeklyPlan(ownerId: string, plan: LocalWeeklyPlan, db?: FuelUpLocalDb): Promise<void> {
  const { db: d, ownerId: o } = repoContext(ownerId, db);
  try {
    await d.weeklyPlans.put({ ...plan, ownerId: o });
  } catch (error) {
    repoError('workout plan', 'save', error);
  }
}
