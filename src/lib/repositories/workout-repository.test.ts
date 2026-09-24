import { beforeEach, describe, expect, it } from 'vitest';
import { OWNER_A, OWNER_B, testDb } from '@/test/idb-harness';
import type { FuelUpLocalDb } from '@/lib/db/local-db';
import {
  getWeeklyPlan,
  listCustomExercises,
  listWorkouts,
  listWorkoutsForDate,
  removeWorkout,
  saveCustomExercise,
  saveFinishedWorkout,
  saveWeeklyPlan,
} from './workout-repository';

let db: FuelUpLocalDb;
beforeEach(async () => {
  db = await testDb();
});

function graph(id: string) {
  const now = new Date().toISOString();
  return {
    workout: {
      id,
      user_id: OWNER_A,
      name: 'Push Day',
      date: '2026-09-22',
      start_time: now,
      end_time: now,
      duration_minutes: 45,
      calories_burned: null,
      notes: '',
      exercises: [],
      created_at: now,
    },
    exercises: [
      {
        id: `${id}-we`,
        workout_id: id,
        exercise_id: 'ex-0',
        sort_order: 0,
        notes: '',
        sets: [],
        created_at: now,
      },
    ],
    setsByExercise: {
      [`${id}-we`]: [
        {
          id: `${id}-s1`,
          workout_exercise_id: `${id}-we`,
          set_number: 1,
          weight_kg: 60,
          reps: 8,
          duration_seconds: null,
          distance_km: null,
          is_warmup: false,
          is_pr: false,
          rpe: null,
          created_at: now,
        },
        {
          id: `${id}-s2`,
          workout_exercise_id: `${id}-we`,
          set_number: 2,
          weight_kg: 60,
          reps: 8,
          duration_seconds: null,
          distance_km: null,
          is_warmup: false,
          is_pr: false,
          rpe: null,
          created_at: now,
        },
      ],
    },
  };
}

describe('workout repository', () => {
  it('saves and rehydrates the full workout graph (workout + exercises + sets)', async () => {
    await saveFinishedWorkout(OWNER_A, graph('w-1'), db);
    const all = await listWorkouts(OWNER_A, db);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'w-1', name: 'Push Day', date: '2026-09-22' });
    expect(all[0].exercises).toHaveLength(1);
    expect(all[0].exercises[0].sets).toHaveLength(2);
    expect(all[0].exercises[0].sets[0]).toMatchObject({ weight_kg: 60, reps: 8 });
    expect(await listWorkoutsForDate(OWNER_A, '2026-09-22', db)).toHaveLength(1);
    expect(await listWorkoutsForDate(OWNER_A, '2026-09-21', db)).toHaveLength(0);
  });

  it('isolates workouts between owners, including deletes', async () => {
    await saveFinishedWorkout(OWNER_A, graph('w-1'), db);
    expect(await listWorkouts(OWNER_B, db)).toHaveLength(0);
    await removeWorkout(OWNER_B, 'w-1', db); // cross-owner: no-op
    expect(await listWorkouts(OWNER_A, db)).toHaveLength(1);
    await removeWorkout(OWNER_A, 'w-1', db);
    expect(await listWorkouts(OWNER_A, db)).toHaveLength(0);
  });

  it('persists custom exercises per owner', async () => {
    const now = new Date().toISOString();
    await saveCustomExercise(
      OWNER_A,
      { id: 'cx-1', name: 'Zercher Squat', muscle_group: 'legs', equipment: 'barbell', instructions: '', is_custom: true, created_by: null, created_at: now },
      db
    );
    expect(await listCustomExercises(OWNER_A, db)).toHaveLength(1);
    expect(await listCustomExercises(OWNER_B, db)).toHaveLength(0);
  });

  it('round-trips the weekly plan with PRs', async () => {
    expect(await getWeeklyPlan(OWNER_A, db)).toBeNull();
    await saveWeeklyPlan(
      OWNER_A,
      {
        ownerId: OWNER_A,
        days: [{ day: 'monday', label: 'Push Day', exercises: [] }],
        prs: [{ id: 'pr-1', exercise_id: 'ex-0', exercise_name: 'Bench', weight_kg: 100, reps: 1, date: '2026-09-22', notes: '' }],
        updatedAt: new Date().toISOString(),
      },
      db
    );
    const row = await getWeeklyPlan(OWNER_A, db);
    expect(row?.days).toHaveLength(1);
    expect(row?.prs).toHaveLength(1);
    expect(await getWeeklyPlan(OWNER_B, db)).toBeNull();
  });
});
