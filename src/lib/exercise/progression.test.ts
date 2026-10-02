// Progressive-overload guidance: deterministic rules, RPE handling,
// bodyweight, deload, stale/today/insufficient cases, Use-action safety.
// Pure logic (node env); UI wiring verified separately.
import { describe, expect, it } from 'vitest';
import type { ExerciseSet, Workout } from '@/lib/types';
import {
  getProgressionGuidance,
  plateIncrementKg,
  resolveSuggestionTarget,
  summarizeExerciseSessions,
} from './progression';

let n = 0;
function set(over: Partial<ExerciseSet> = {}): ExerciseSet {
  n += 1;
  return {
    id: `s${n}`,
    workout_exercise_id: 'we1',
    set_number: 1,
    weight_kg: null,
    reps: null,
    duration_seconds: null,
    distance_km: null,
    is_warmup: false,
    is_pr: false,
    rpe: null,
    created_at: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

function workout(date: string, id: string, sets: ExerciseSet[], exerciseId = 'ex-0'): Workout {
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
        id: 'we1',
        workout_id: id,
        exercise_id: exerciseId,
        sort_order: 0,
        notes: '',
        sets,
        created_at: `${date}T10:00:00.000Z`,
      },
    ],
    created_at: `${date}T10:00:00.000Z`,
  };
}

const TODAY = '2026-10-03';
const D1 = '2026-09-29';
const D2 = '2026-10-01';

function loaded(w: number, r: number, extra: Partial<ExerciseSet> = {}) {
  return set({ weight_kg: w, reps: r, ...extra });
}

describe('summarizeExerciseSessions', () => {
  it('returns newest-first summaries with top sets, skipping warmups', () => {
    const sessions = summarizeExerciseSessions(
      [
        workout(D1, 'w1', [loaded(20, 8, { is_warmup: true }), loaded(60, 8), loaded(60, 7)]),
        workout(D2, 'w2', [loaded(60, 9)]),
      ],
      'ex-0'
    );
    expect(sessions).toHaveLength(2);
    expect(sessions[0].date).toBe(D2);
    expect(sessions[0].loadedTop).toMatchObject({ weight_kg: 60, reps: 9 });
    expect(sessions[1].loadedTop).toMatchObject({ weight_kg: 60, reps: 8 });
  });

  it('skips sessions with no usable sets and isolates other exercises', () => {
    const sessions = summarizeExerciseSessions(
      [
        workout(D1, 'w1', [set()]),
        workout(D1, 'w2', [loaded(40, 10)], 'ex-9'),
        workout(D2, 'w3', [loaded(50, 5)]),
      ],
      'ex-0'
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].workoutId).toBe('w3');
  });

  it('handles null/invalid set data safely', () => {
    const sessions = summarizeExerciseSessions(
      [workout(D2, 'w1', [loaded(NaN, 8), loaded(60, 0), loaded(-5, 8), loaded(60, 8)])],
      'ex-0'
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].loadedTop).toMatchObject({ weight_kg: 60, reps: 8 });
  });
});

describe('plateIncrementKg', () => {
  it('caps absolutely and relatively, floors tiny loads to repeat', () => {
    expect(plateIncrementKg(60)).toBe(2.5);
    expect(plateIncrementKg(100)).toBe(2.5);
    expect(plateIncrementKg(20)).toBe(1);
    expect(plateIncrementKg(10)).toBe(0.5);
    expect(plateIncrementKg(8)).toBeNull();
    expect(plateIncrementKg(0)).toBeNull();
    expect(plateIncrementKg(NaN)).toBeNull();
  });
});

describe('getProgressionGuidance', () => {
  const guide = (ws: Workout[]) =>
    getProgressionGuidance(summarizeExerciseSessions(ws, 'ex-0'), TODAY);

  it('progresses on reps improvement with good RPE, citing both sessions', () => {
    const g = guide([
      workout(D1, 'w1', [loaded(60, 8)]),
      workout(D2, 'w2', [loaded(60, 9, { rpe: 8 })]),
    ]);
    expect(g.status).toBe('ok');
    expect(g.suggestion).toEqual({ weight_kg: 62.5, reps: 9 });
    expect(g.rationale).toContain(D2);
    expect(g.rationale).toContain(D1);
    expect(g.rationale).toContain('RPE 8');
  });

  it('progresses on objective improvement when RPE is missing (never assumed easy)', () => {
    const g = guide([workout(D1, 'w1', [loaded(60, 8)]), workout(D2, 'w2', [loaded(60, 9)])]);
    expect(g.suggestion).toEqual({ weight_kg: 62.5, reps: 9 });
    expect(g.rationale).not.toContain('RPE');
  });

  it('repeats identical performance when RPE is missing', () => {
    const g = guide([workout(D1, 'w1', [loaded(60, 8)]), workout(D2, 'w2', [loaded(60, 8)])]);
    expect(g.status).toBe('ok');
    expect(g.suggestion).toEqual({ weight_kg: 60, reps: 8 });
  });

  it('repeats on hard sets (RPE 9+) even with improvement', () => {
    const g = guide([
      workout(D1, 'w1', [loaded(60, 8)]),
      workout(D2, 'w2', [loaded(60, 9, { rpe: 10 })]),
    ]);
    expect(g.suggestion).toEqual({ weight_kg: 60, reps: 9 });
  });

  it('treats invalid RPE as missing', () => {
    const g = guide([
      workout(D1, 'w1', [loaded(60, 8)]),
      workout(D2, 'w2', [loaded(60, 9, { rpe: 99 })]),
    ]);
    expect(g.suggestion).toEqual({ weight_kg: 62.5, reps: 9 });
  });

  it('consolidates when any dimension declined (above the deload line)', () => {
    const g = guide([workout(D1, 'w1', [loaded(60, 8)]), workout(D2, 'w2', [loaded(62.5, 7)])]);
    expect(g.status).toBe('ok');
    expect(g.suggestion).toEqual({ weight_kg: 62.5, reps: 7 });
  });

  it('uses a relative increment on light lifts, repeat when too light', () => {
    const light = guide([workout(D1, 'w1', [loaded(20, 10)]), workout(D2, 'w2', [loaded(20, 12)])]);
    expect(light.suggestion).toEqual({ weight_kg: 21, reps: 12 });
    const tiny = guide([workout(D1, 'w1', [loaded(8, 10)]), workout(D2, 'w2', [loaded(8, 12)])]);
    expect(tiny.suggestion).toEqual({ weight_kg: 8, reps: 12 });
  });

  it('handles bodyweight progression and plateaus', () => {
    const up = guide([workout(D1, 'w1', [set({ reps: 8 })]), workout(D2, 'w2', [set({ reps: 10 })])]);
    expect(up.suggestion).toEqual({ weight_kg: null, reps: 11 });
    const flat = guide([workout(D1, 'w1', [set({ reps: 10 })]), workout(D2, 'w2', [set({ reps: 10 })])]);
    expect(flat.suggestion).toEqual({ weight_kg: null, reps: 10 });
  });

  it('withholds suggestions on deload patterns but keeps history', () => {
    const g = guide([workout(D1, 'w1', [loaded(100, 5)]), workout(D2, 'w2', [loaded(60, 5)])]);
    expect(g.status).toBe('deload');
    expect(g.suggestion).toBeNull();
    expect(g.latest?.loadedTop).toMatchObject({ weight_kg: 60, reps: 5 });
  });

  it('withholds on stale, single-session, empty, and same-day history', () => {
    expect(guide([workout('2026-08-01', 'w1', [loaded(60, 8)]), workout('2026-08-05', 'w2', [loaded(60, 9)])]).status).toBe(
      'stale'
    );
    expect(guide([workout(D2, 'w1', [loaded(60, 8)])]).status).toBe('insufficient');
    expect(guide([]).status).toBe('insufficient');
    const todayG = guide([workout(D1, 'w1', [loaded(60, 8)]), workout(TODAY, 'w2', [loaded(60, 9)])]);
    expect(todayG.status).toBe('today');
    expect(todayG.suggestion).toBeNull();
    expect(todayG.latest?.date).toBe(TODAY);
  });

  it('works with synchronized history that lacks RPE fields', () => {
    const synced = {
      id: 'w2',
      user_id: 'u',
      name: 'W',
      date: D2,
      start_time: `${D2}T10:00:00.000Z`,
      end_time: null,
      duration_minutes: null,
      calories_burned: null,
      notes: '',
      exercises: [
        {
          id: 'we9',
          workout_id: 'w2',
          exercise_id: 'ex-0',
          sort_order: 0,
          notes: '',
          sets: [{ id: 's9', workout_exercise_id: 'we9', set_number: 1, weight_kg: 60, reps: 9, created_at: D2 }],
          created_at: D2,
        },
      ],
      created_at: D2,
    } as unknown as Workout;
    const g = guide([workout(D1, 'w1', [loaded(60, 8)]), synced]);
    expect(g.status).toBe('ok');
    expect(g.suggestion).toEqual({ weight_kg: 62.5, reps: 9 });
  });
});

describe('resolveSuggestionTarget', () => {
  const populated = { id: 'a', weight_kg: 60, reps: 8 };
  it('prefills a genuinely empty set', () => {
    expect(resolveSuggestionTarget([{ ...populated }, { id: 'b', weight_kg: null, reps: null }])).toEqual({
      type: 'update',
      setId: 'b',
    });
  });

  it('creates when every set is populated or partially filled', () => {
    expect(resolveSuggestionTarget([populated])).toEqual({ type: 'create' });
    expect(resolveSuggestionTarget([{ id: 'c', weight_kg: 60, reps: null }])).toEqual({ type: 'create' });
    expect(resolveSuggestionTarget([])).toEqual({ type: 'create' });
  });
});
