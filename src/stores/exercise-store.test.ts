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
