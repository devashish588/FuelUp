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
