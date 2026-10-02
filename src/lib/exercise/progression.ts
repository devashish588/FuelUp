// =============================================
// FuelUp - Progressive-overload guidance (pure, deterministic)
// Advisory only: derives "last time" summaries and conservative next-step
// suggestions from FINISHED local workouts. Never mutates state, never
// claims optimal training weights. No AI, no new dependencies.
// =============================================
import type { ExerciseSet, Workout } from '@/lib/types';

/** Absolute ceiling for any suggested increase (standard small plate). */
export const MAX_PLATE_JUMP_KG = 2.5;
/** Relative ceiling: a suggestion never exceeds 5% over the top set. */
export const MAX_RELATIVE_JUMP = 0.05;
/** Smallest meaningful plate increment; below this we repeat instead. */
export const MIN_MEANINGFUL_JUMP_KG = 0.5;
/** History window and recency limits (days). */
export const HISTORY_WINDOW_DAYS = 42;
export const RECENCY_LIMIT_DAYS = 21;
/** Latest top-set volume below this fraction of the window best = deload. */
export const DELOAD_VOLUME_FRACTION = 0.85;

export interface TopSet {
  weight_kg: number;
  reps: number;
  rpe: number | null;
}

export interface SessionSummary {
  date: string;
  workoutId: string;
  /** Best loaded set (non-warmup, weight > 0, reps > 0), else null. */
  loadedTop: TopSet | null;
  /** Best bodyweight set (non-warmup, no load, reps > 0), else null. */
  bodyweightTop: { reps: number } | null;
}

function validRpe(rpe: number | null | undefined): number | null {
  return typeof rpe === 'number' && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null;
}

function usableSet(s: ExerciseSet): boolean {
  return (
    !s.is_warmup &&
    typeof s.reps === 'number' &&
    Number.isFinite(s.reps) &&
    s.reps > 0 &&
    s.reps <= 100000
  );
}

function validLoad(weight: unknown): weight is number {
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 && weight <= 5000;
}

/**
 * Newest-first per-exercise session summaries from finished workouts.
 * Sessions with no usable sets are skipped (missing data is never evidence).
 */
export function summarizeExerciseSessions(workouts: Workout[], exerciseId: string): SessionSummary[] {
  const out: SessionSummary[] = [];
  for (const w of workouts) {
    if (!w || typeof w.date !== 'string') continue;
    const wb = (w.exercises ?? []).filter((we) => we && we.exercise_id === exerciseId);
    if (wb.length === 0) continue;
    let loadedTop: TopSet | null = null;
    let bwReps = 0;
    for (const we of wb) {
      for (const s of we.sets ?? []) {
        if (!s || !usableSet(s)) continue;
        const rpe = validRpe(s.rpe);
        if (validLoad(s.weight_kg)) {
          const reps = s.reps as number;
          if (
            !loadedTop ||
            (s.weight_kg as number) > loadedTop.weight_kg ||
            ((s.weight_kg as number) === loadedTop.weight_kg && reps > loadedTop.reps)
          ) {
            loadedTop = { weight_kg: s.weight_kg as number, reps, rpe };
          }
        } else if ((s.reps as number) > bwReps) {
          bwReps = s.reps as number;
        }
      }
    }
    if (!loadedTop && bwReps === 0) continue;
    out.push({
      date: w.date,
      workoutId: w.id,
      loadedTop,
      bodyweightTop: bwReps > 0 ? { reps: bwReps } : null,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Conservative plate increment for a top-set weight: capped both absolutely
 * (2.5 kg) and relatively (5%), rounded down to 0.5 kg steps. Returns null
 * when no safe increment can be established (tiny loads) → caller repeats.
 */
export function plateIncrementKg(topWeightKg: number): number | null {
  if (!validLoad(topWeightKg)) return null;
  const relative = Math.floor((topWeightKg * MAX_RELATIVE_JUMP * 2) / 1) / 2;
  const increment = Math.min(MAX_PLATE_JUMP_KG, relative);
  return increment >= MIN_MEANINGFUL_JUMP_KG ? Math.round(increment * 10) / 10 : null;
}

export type GuidanceStatus = 'ok' | 'insufficient' | 'stale' | 'deload' | 'today';

export interface SuggestedSet {
  weight_kg: number | null;
  reps: number;
}

export interface ProgressionGuidance {
  latest: SessionSummary | null;
  previous: SessionSummary | null;
  /** Null unless a suggestion is warranted; history always renders. */
  suggestion: SuggestedSet | null;
  /** Human-readable basis: cited sessions + rule applied. Never optimal-weight language. */
  rationale: string | null;
  status: GuidanceStatus;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

function fmtTop(weightKg: number | null, reps: number): string {
  return weightKg === null ? `${reps} reps` : `${weightKg}kg × ${reps}`;
}

/**
 * Build advisory guidance for one exercise. Reads finished-workout summaries
 * only; RPE is used solely when present and valid (1–10) — missing or
 * invalid RPE is never treated as "easy". Synchronized history without RPE
 * degrades to the stricter reps-only rule automatically.
 */
export function getProgressionGuidance(
  sessions: SessionSummary[],
  today: string,
  opts?: { windowDays?: number; recencyDays?: number }
): ProgressionGuidance {
  const windowDays = opts?.windowDays ?? HISTORY_WINDOW_DAYS;
  const recencyDays = opts?.recencyDays ?? RECENCY_LIMIT_DAYS;
  const none = (status: GuidanceStatus): ProgressionGuidance => ({
    latest: null,
    previous: null,
    suggestion: null,
    rationale: null,
    status,
  });
  if (sessions.length === 0) return none('insufficient');
  const latest = sessions[0];
  if (latest.date === today) {
    return { latest, previous: sessions[1] ?? null, suggestion: null, rationale: null, status: 'today' };
  }
  if (daysBetween(today, latest.date) > recencyDays) {
    return { latest, previous: sessions[1] ?? null, suggestion: null, rationale: null, status: 'stale' };
  }
  const inWindow = sessions.filter((s) => daysBetween(today, s.date) <= windowDays);
  if (inWindow.length < 2) {
    return { latest, previous: null, suggestion: null, rationale: null, status: 'insufficient' };
  }
  const [cur, prev] = inWindow;
  const loadedTrack = cur.loadedTop !== null;
  const curTop = loadedTrack ? cur.loadedTop : null;
  const prevTop = loadedTrack ? prev.loadedTop : null;
  const curBw = !loadedTrack ? cur.bodyweightTop : null;
  const prevBw = !loadedTrack ? prev.bodyweightTop : null;
  if (loadedTrack && (!curTop || !prevTop)) {
    return { latest: cur, previous: prev, suggestion: null, rationale: null, status: 'insufficient' };
  }
  if (!loadedTrack && (!curBw || !prevBw)) {
    return { latest: cur, previous: prev, suggestion: null, rationale: null, status: 'insufficient' };
  }

  // Deload / back-off detection on the active track.
  const curVol = loadedTrack
    ? (curTop as TopSet).weight_kg * (curTop as TopSet).reps
    : (curBw as { reps: number }).reps;
  const bestVol = Math.max(
    ...inWindow.slice(0, 5).map((s) => {
      if (loadedTrack) return s.loadedTop ? s.loadedTop.weight_kg * s.loadedTop.reps : 0;
      return s.bodyweightTop ? s.bodyweightTop.reps : 0;
    })
  );
  if (bestVol > 0 && curVol < bestVol * DELOAD_VOLUME_FRACTION) {
    return { latest: cur, previous: prev, suggestion: null, rationale: null, status: 'deload' };
  }

  if (!loadedTrack && curBw && prevBw) {
    if (curBw.reps > prevBw.reps) {
      const reps = curBw.reps + 1;
      return {
        latest: cur,
        previous: prev,
        suggestion: { weight_kg: null, reps },
        rationale: `You did ${curBw.reps} reps on ${cur.date}, up from ${prevBw.reps} on ${prev.date}. One more rep is a reasonable next step.`,
        status: 'ok',
      };
    }
    return {
      latest: cur,
      previous: prev,
      suggestion: { weight_kg: null, reps: curBw.reps },
      rationale: `Last time (${cur.date}) you did ${curBw.reps} reps. Matching that is a solid session.`,
      status: 'ok',
    };
  }

  const ct = curTop as TopSet;
  const pt = prevTop as TopSet;
  // Any dimension worse than last time → consolidate, never chase.
  const declined = ct.reps < pt.reps || ct.weight_kg < pt.weight_kg;
  const strictlyBetter = ct.reps > pt.reps || ct.weight_kg > pt.weight_kg;
  const rpe = validRpe(ct.rpe);
  // Missing/invalid RPE is never read as "easy": without a valid RPE only an
  // objectively better performance earns an increase; identical performance
  // without RPE repeats. A hard set (RPE 9–10) always consolidates.
  const earnedIncrease =
    !declined && (strictlyBetter ? rpe === null || rpe <= 8 : rpe !== null && rpe <= 8);
  if (earnedIncrease) {
    const increment = plateIncrementKg(ct.weight_kg);
    if (increment !== null) {
      const next = Math.round((ct.weight_kg + increment) * 10) / 10;
      return {
        latest: cur,
        previous: prev,
        suggestion: { weight_kg: next, reps: ct.reps },
        rationale: `You hit ${fmtTop(ct.weight_kg, ct.reps)} on ${cur.date}${
          rpe !== null ? ` at RPE ${rpe}` : ''
        } (previous ${fmtTop(pt.weight_kg, pt.reps)} on ${prev.date}). Adding ${increment}kg is a small, conservative step.`,
        status: 'ok',
      };
    }
  }
  return {
    latest: cur,
    previous: prev,
    suggestion: { weight_kg: ct.weight_kg, reps: ct.reps },
    rationale: `Last time (${cur.date}) you did ${fmtTop(ct.weight_kg, ct.reps)}. Matching that is a solid session.`,
    status: 'ok',
  };
}

export type SuggestionTarget = { type: 'update'; setId: string } | { type: 'create' };

/**
 * Use-action safety: prefill a genuinely empty set (both fields empty), else
 * signal that a new editable set must be created. Never targets a set that
 * already carries a weight or reps value.
 */
export function resolveSuggestionTarget(
  sets: { id: string; weight_kg: number | null; reps: number | null }[]
): SuggestionTarget {
  const empty = (sets ?? []).find((s) => s && s.weight_kg === null && s.reps === null);
  return empty ? { type: 'update', setId: empty.id } : { type: 'create' };
}
