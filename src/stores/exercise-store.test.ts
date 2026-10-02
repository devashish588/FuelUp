// Workout completion must be idempotent: double-tapping Finish (or a
// re-render race) persists exactly one workout. Pure in-memory path
// (no owner → no IndexedDB); persistence covered by repository tests.
import { beforeEach, describe, expect, it } from 'vitest';
import { useExerciseStore } from './exercise-store';

beforeEach(() => {
  useExerciseStore.setState({ workouts: [], activeWorkout: null, ownerId: null, lastError: null });
});

describe('finishWorkout idempotency (Phase 10)', () => {
  it('finishes exactly once across repeated calls', () => {
    const store = useExerciseStore.getState();
    store.startWorkout('Push day');
    const weId = useExerciseStore.getState().activeWorkout!.exercises;
    expect(weId).toHaveLength(0);
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    const workoutExerciseId = useExerciseStore.getState().activeWorkout!.exercises[0].id;
    useExerciseStore.getState().addSetToExercise(workoutExerciseId, {
      set_number: 1, weight_kg: 60, reps: 8, duration_seconds: null, distance_km: null,
      is_warmup: false, is_pr: false, rpe: null,
    });
    useExerciseStore.getState().finishWorkout();
    useExerciseStore.getState().finishWorkout();
    useExerciseStore.getState().finishWorkout();
    const state = useExerciseStore.getState();
    expect(state.workouts).toHaveLength(1);
    expect(state.activeWorkout).toBeNull();
    expect(state.workouts[0].exercises[0].sets).toHaveLength(1);
  });

  it('ignores finish with no active workout', () => {
    expect(() => useExerciseStore.getState().finishWorkout()).not.toThrow();
    expect(useExerciseStore.getState().workouts).toHaveLength(0);
  });
});

describe('addExerciseToWorkout duplicate guard (Wiki MVP)', () => {
  it('adds an exercise once across repeated adds', () => {
    const store = useExerciseStore.getState();
    store.startWorkout('Push day');
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    const exercises = useExerciseStore.getState().activeWorkout!.exercises;
    expect(exercises).toHaveLength(1);
    expect(exercises[0].exercise_id).toBe('ex-0');
  });

  it('still allows distinct exercises', () => {
    const store = useExerciseStore.getState();
    store.startWorkout('Push day');
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    useExerciseStore.getState().addExerciseToWorkout('ex-1');
    expect(useExerciseStore.getState().activeWorkout!.exercises).toHaveLength(2);
  });

  it('is a no-op with no active workout', () => {
    expect(() => useExerciseStore.getState().addExerciseToWorkout('ex-0')).not.toThrow();
    expect(useExerciseStore.getState().activeWorkout).toBeNull();
  });

  it('reports membership through hasExerciseInWorkout', () => {
    expect(useExerciseStore.getState().hasExerciseInWorkout('ex-0')).toBe(false);
    useExerciseStore.getState().startWorkout('Push day');
    expect(useExerciseStore.getState().hasExerciseInWorkout('ex-0')).toBe(false);
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    expect(useExerciseStore.getState().hasExerciseInWorkout('ex-0')).toBe(true);
    expect(useExerciseStore.getState().hasExerciseInWorkout('ex-1')).toBe(false);
  });
});

describe('set logging regression (Wiki MVP)', () => {
  function addTrackedExercise() {
    useExerciseStore.getState().startWorkout('Leg day');
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    return useExerciseStore.getState().activeWorkout!.exercises[0].id;
  }

  it('preserves weight, reps, warmup, and RPE through add + update', () => {
    const weId = addTrackedExercise();
    useExerciseStore.getState().addSetToExercise(weId, {
      set_number: 1, weight_kg: 60, reps: 8, duration_seconds: null, distance_km: null,
      is_warmup: true, is_pr: false, rpe: 8,
    });
    const setId = useExerciseStore.getState().activeWorkout!.exercises[0].sets[0].id;
    useExerciseStore.getState().updateSet(weId, setId, { weight_kg: 62.5, reps: 9 });
    const set = useExerciseStore.getState().activeWorkout!.exercises[0].sets[0];
    expect(set.weight_kg).toBe(62.5);
    expect(set.reps).toBe(9);
    expect(set.is_warmup).toBe(true);
    expect(set.rpe).toBe(8);
    expect(set.set_number).toBe(1);
  });

  it('removes single sets and whole exercises without touching siblings', () => {
    const weId = addTrackedExercise();
    const store = () => useExerciseStore.getState();
    store().addSetToExercise(weId, {
      set_number: 1, weight_kg: 60, reps: 8, duration_seconds: null, distance_km: null,
      is_warmup: false, is_pr: false, rpe: null,
    });
    store().addSetToExercise(weId, {
      set_number: 2, weight_kg: 60, reps: 7, duration_seconds: null, distance_km: null,
      is_warmup: false, is_pr: false, rpe: null,
    });
    const [first, second] = store().activeWorkout!.exercises[0].sets;
    store().removeSet(weId, first.id);
    expect(store().activeWorkout!.exercises[0].sets.map((s) => s.id)).toEqual([second.id]);
    store().addExerciseToWorkout('ex-1');
    expect(store().activeWorkout!.exercises).toHaveLength(2);
    store().removeExerciseFromWorkout(weId);
    const remaining = store().activeWorkout!.exercises;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].exercise_id).toBe('ex-1');
  });
});

describe('getExerciseSessions selector (progressive overload)', () => {
  function finishedWorkout(id: string, date: string, exerciseId: string, sets: { weight_kg: number | null; reps: number | null }[]) {
    return {
      id,
      user_id: 'u',
      name: 'W',
      date,
      start_time: `${date}T10:00:00.000Z`,
      end_time: `${date}T11:00:00.000Z`,
      duration_minutes: 60,
      calories_burned: null,
      notes: '',
      exercises: [
        {
          id: `we-${id}`,
          workout_id: id,
          exercise_id: exerciseId,
          sort_order: 0,
          notes: '',
          sets: sets.map((s, i) => ({
            id: `s-${id}-${i}`,
            workout_exercise_id: `we-${id}`,
            set_number: i + 1,
            weight_kg: s.weight_kg,
            reps: s.reps,
            duration_seconds: null,
            distance_km: null,
            is_warmup: false,
            is_pr: false,
            rpe: null,
            created_at: `${date}T10:00:00.000Z`,
          })),
          created_at: `${date}T10:00:00.000Z`,
        },
      ],
      created_at: `${date}T10:00:00.000Z`,
    };
  }

  it('returns newest-first summaries for one exercise only', () => {
    useExerciseStore.setState({
      workouts: [
        finishedWorkout('w1', '2026-09-29', 'ex-0', [{ weight_kg: 60, reps: 8 }]),
        finishedWorkout('w2', '2026-10-01', 'ex-0', [{ weight_kg: 60, reps: 9 }]),
        finishedWorkout('w3', '2026-10-01', 'ex-1', [{ weight_kg: 40, reps: 10 }]),
      ] as never,
    });
    const sessions = useExerciseStore.getState().getExerciseSessions('ex-0');
    expect(sessions).toHaveLength(2);
    expect(sessions[0].date).toBe('2026-10-01');
    expect(sessions[0].loadedTop).toMatchObject({ weight_kg: 60, reps: 9 });
    expect(sessions[1].loadedTop).toMatchObject({ weight_kg: 60, reps: 8 });
    expect(useExerciseStore.getState().getExerciseSessions('ex-9')).toHaveLength(0);
  });

  it('derives from finished flows end to end', () => {
    const store = useExerciseStore.getState();
    store.startWorkout('Push day');
    useExerciseStore.getState().addExerciseToWorkout('ex-0');
    const weId = useExerciseStore.getState().activeWorkout!.exercises[0].id;
    useExerciseStore.getState().addSetToExercise(weId, {
      set_number: 1, weight_kg: 60, reps: 8, duration_seconds: null, distance_km: null,
      is_warmup: false, is_pr: false, rpe: 7,
    });
    useExerciseStore.getState().finishWorkout();
    const sessions = useExerciseStore.getState().getExerciseSessions('ex-0');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].loadedTop).toMatchObject({ weight_kg: 60, reps: 8, rpe: 7 });
  });
});
