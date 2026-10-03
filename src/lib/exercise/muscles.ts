// =============================================
// FuelUp - Canonical muscle taxonomy (Muscle Map v1, pure)
// 17 stable region IDs shared by the SVG map, exercise matching, and
// filters. Practical exercise-discovery taxonomy, not a medical model:
// region names describe where an exercise is felt/worked for filtering.
// =============================================
import type { Exercise, MuscleGroup } from '@/lib/types';

export type MuscleRegionId =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'biceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'quads'
  | 'traps'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'triceps'
  | 'glutes'
  | 'hamstrings'
  | 'calves';

export type MuscleView = 'front' | 'back';

export interface MuscleRegion {
  id: MuscleRegionId;
  label: string;
  view: MuscleView;
  /** Legacy group this region belongs to (compatibility + badges). */
  group: Exclude<MuscleGroup, 'cardio' | 'full_body'>;
}

export const MUSCLE_REGIONS: Record<MuscleRegionId, MuscleRegion> = {
  chest: { id: 'chest', label: 'Chest', view: 'front', group: 'chest' },
  front_delts: { id: 'front_delts', label: 'Front delts', view: 'front', group: 'shoulders' },
  side_delts: { id: 'side_delts', label: 'Side delts', view: 'front', group: 'shoulders' },
  biceps: { id: 'biceps', label: 'Biceps', view: 'front', group: 'arms' },
  forearms: { id: 'forearms', label: 'Forearms', view: 'front', group: 'arms' },
  abs: { id: 'abs', label: 'Abs', view: 'front', group: 'core' },
  obliques: { id: 'obliques', label: 'Obliques', view: 'front', group: 'core' },
  quads: { id: 'quads', label: 'Quads', view: 'front', group: 'legs' },
  traps: { id: 'traps', label: 'Traps', view: 'back', group: 'back' },
  rear_delts: { id: 'rear_delts', label: 'Rear delts', view: 'back', group: 'shoulders' },
  lats: { id: 'lats', label: 'Lats', view: 'back', group: 'back' },
  upper_back: { id: 'upper_back', label: 'Upper back', view: 'back', group: 'back' },
  lower_back: { id: 'lower_back', label: 'Lower back', view: 'back', group: 'back' },
  triceps: { id: 'triceps', label: 'Triceps', view: 'back', group: 'arms' },
  glutes: { id: 'glutes', label: 'Glutes', view: 'back', group: 'legs' },
  hamstrings: { id: 'hamstrings', label: 'Hamstrings', view: 'back', group: 'legs' },
  calves: { id: 'calves', label: 'Calves', view: 'back', group: 'legs' },
};

export const MUSCLE_REGION_IDS = Object.keys(MUSCLE_REGIONS) as MuscleRegionId[];

export const FRONT_REGION_IDS: MuscleRegionId[] = MUSCLE_REGION_IDS.filter(
  (id) => MUSCLE_REGIONS[id].view === 'front'
);

export const BACK_REGION_IDS: MuscleRegionId[] = MUSCLE_REGION_IDS.filter(
  (id) => MUSCLE_REGIONS[id].view === 'back'
);

/**
 * Deterministic legacy group expansion (spec §2). Cardio and full_body map
 * to nothing: cardio exercises stay reachable through the equipment filter,
 * never through anatomy.
 */
export const GROUP_REGION_EXPANSION: Record<MuscleGroup, MuscleRegionId[]> = {
  chest: ['chest'],
  back: ['lats', 'traps', 'upper_back', 'lower_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  arms: ['biceps', 'triceps', 'forearms'],
  legs: ['quads', 'glutes', 'hamstrings', 'calves'],
  core: ['abs', 'obliques'],
  cardio: [],
  full_body: [],
};

/** Canonical resolution for exact free-text muscle labels. */
const LABEL_TO_REGION: Record<string, MuscleRegionId[]> = {
  chest: ['chest'],
  'front shoulders': ['front_delts'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  'side delts': ['side_delts'],
  'rear shoulders': ['rear_delts'],
  'rear delts': ['rear_delts'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms'],
  lats: ['lats'],
  traps: ['traps'],
  'upper back': ['upper_back'],
  back: ['lats', 'traps', 'upper_back', 'lower_back'],
  'lower back': ['lower_back'],
  abs: ['abs'],
  core: ['abs', 'obliques'],
  obliques: ['obliques'],
  quadriceps: ['quads'],
  quads: ['quads'],
  glutes: ['glutes'],
  hamstrings: ['hamstrings'],
  calves: ['calves'],
};

/**
 * Per-exercise precision for ambiguous bare labels, keyed by exact exercise
 * name. Only entries whose own Wiki content supports the narrower reading
 * are listed; everything else falls back to the whole-group resolution
 * above (documented over-inclusion, never invented precision).
 */
const EXERCISE_LABEL_OVERRIDES: Record<string, Record<string, MuscleRegionId[]>> = {
  'Barbell Deadlift': {
    // Hinge pattern: the back work is the spinal erectors.
    back: ['lower_back'],
  },
  Plank: {
    // Core-stability hold: anterior shoulder + whole posterior stabilizers
    // are supporting actors next to abs/glutes, not prime movers.
    shoulders: ['front_delts'],
    back: ['upper_back', 'lower_back'],
  },
};

/** Normalize one free-text muscle label for one exercise into region IDs. */
export function normalizeMuscleLabel(exerciseName: string, label: string): MuscleRegionId[] {
  const key = (label ?? '').trim().toLowerCase();
  if (!key) return [];
  const override = EXERCISE_LABEL_OVERRIDES[exerciseName]?.[key];
  if (override) return [...override];
  return [...(LABEL_TO_REGION[key] ?? [])];
}

export interface ExerciseRegions {
  primary: MuscleRegionId[];
  secondary: MuscleRegionId[];
}

function dedupe(ids: MuscleRegionId[]): MuscleRegionId[] {
  return [...new Set(ids)];
}

/**
 * Resolve the canonical regions for any exercise row. Enriched Wiki rows
 * use their normalized primary/secondary strings; legacy rows fall back to
 * `muscle_group` expansion (documented over-inclusion keeps them visible).
 */
export function regionsForExercise(
  exercise: Pick<Exercise, 'name' | 'muscle_group' | 'primary_muscles' | 'secondary_muscles'>
): ExerciseRegions {
  const primary = dedupe(
    (exercise.primary_muscles ?? []).flatMap((label) => normalizeMuscleLabel(exercise.name, label))
  );
  const secondary = dedupe(
    (exercise.secondary_muscles ?? [])
      .flatMap((label) => normalizeMuscleLabel(exercise.name, label))
      .filter((id) => !primary.includes(id))
  );
  if (primary.length === 0 && secondary.length === 0) {
    return { primary: [...GROUP_REGION_EXPANSION[exercise.muscle_group]], secondary: [] };
  }
  return { primary, secondary };
}

/** True when a region is a primary or secondary region of the exercise. */
export function regionMatches(
  exercise: Pick<Exercise, 'name' | 'muscle_group' | 'primary_muscles' | 'secondary_muscles'>,
  region: MuscleRegionId
): boolean {
  const regions = regionsForExercise(exercise);
  return regions.primary.includes(region) || regions.secondary.includes(region);
}
