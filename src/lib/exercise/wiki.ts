// =============================================
// FuelUp - Exercise Wiki helpers (MVP, pure)
// Normalized equipment taxonomy + legacy free-text mapping, search/filter,
// and legacy-safe detail sections. No store/IO imports: safe for UI + tests.
// =============================================
import type {
  EquipmentTag,
  Exercise,
  ExerciseDifficulty,
  MovementPattern,
  MuscleGroup,
} from '@/lib/types';
import { regionMatches, type MuscleRegionId } from './muscles';

export const EQUIPMENT_LABELS: Record<EquipmentTag, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  cable: 'Cable',
  machine: 'Machine',
  bench: 'Bench',
  rack: 'Rack',
  bodyweight: 'Bodyweight',
  pullup_bar: 'Pull-up bar',
  dip_bars: 'Dip bars',
  bands: 'Bands',
  cardio_machine: 'Cardio machine',
  jump_rope: 'Jump rope',
  other: 'Other',
};

export const EQUIPMENT_TAGS = Object.keys(EQUIPMENT_LABELS) as EquipmentTag[];

export const MOVEMENT_LABELS: Record<MovementPattern, string> = {
  push: 'Push',
  pull: 'Pull',
  hinge: 'Hinge',
  squat: 'Squat',
  lunge: 'Lunge',
  carry: 'Carry',
  rotation: 'Rotation',
  core_stability: 'Core stability',
  isolation: 'Isolation',
  cardio: 'Cardio',
};

export const DIFFICULTY_LABELS: Record<ExerciseDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** Map one normalized legacy token (lowercased, trimmed) onto a tag. */
function tokenToTag(token: string): EquipmentTag {
  const t = token.toLowerCase().trim();
  if (!t) return 'other';
  if (t.includes('cable')) return 'cable';
  if (t.includes('squat rack') || (t.includes('rack') && !t.includes('leg press'))) return 'rack';
  if (t.includes('leg press')) return 'machine';
  if (t.includes('pull-up') || t.includes('pullup') || t.includes('pull up')) return 'pullup_bar';
  if (t.includes('dip bar')) return 'dip_bars';
  if (t.includes('ez bar')) return 'barbell';
  if (t.includes('barbell') || t.includes('t-bar') || t.includes('tbar')) return 'barbell';
  if (t.includes('dumbbell')) return 'dumbbell';
  if (t.includes('kettlebell')) return 'kettlebell';
  if (t.includes('band')) return 'bands';
  if (t.includes('bench') || t.includes('preacher')) return 'bench';
  if (
    t.includes('elliptical') ||
    t.includes('treadmill') ||
    t.includes('bike') ||
    t.includes('rower') ||
    t.includes('stair') ||
    t.includes('climber')
  ) return 'cardio_machine';
  if (t.includes('machine')) return 'machine';
  if (t.includes('bodyweight') || t.includes('plate')) return 'bodyweight';
  if (t.includes('ab wheel')) return 'other';
  if (t.includes('jump rope')) return 'jump_rope';
  if (t.includes('rope')) return 'other';
  return 'other';
}

/**
 * Resolve normalized equipment tags for any exercise row. Prefers explicit
 * `equipment_tags`; falls back to mapping the legacy free-text `equipment`
 * (comma- and slash-separated). Never returns an empty list.
 */
export function resolveEquipmentTags(exercise: Pick<Exercise, 'equipment' | 'equipment_tags'>): EquipmentTag[] {
  if (exercise.equipment_tags && exercise.equipment_tags.length > 0) {
    return [...new Set(exercise.equipment_tags)];
  }
  const raw = (exercise.equipment ?? '').trim();
  if (!raw) return ['bodyweight'];
  const tags = raw
    .split(/[,/]/)
    .map((part) => tokenToTag(part))
    .filter((tag, index, all) => all.indexOf(tag) === index);
  return tags.length > 0 ? tags : ['other'];
}

/** True when an exercise carries enriched Wiki content. */
export function hasWikiContent(exercise: Pick<Exercise, 'detailed_instructions' | 'cues'>): boolean {
  return (exercise.detailed_instructions?.length ?? 0) > 0 || (exercise.cues?.length ?? 0) > 0;
}

export interface WikiFilter {
  query: string;
  muscle: MuscleGroup | 'all';
  equipment: EquipmentTag | 'all';
  /** Muscle Map v1: optional canonical region; absent/null = no region filter. */
  region?: MuscleRegionId | null;
}

/**
 * Search + filter exercises. Query matches the name (case-insensitive);
 * muscle matches `muscle_group`; equipment matches resolved tags; region
 * matches normalized primary/secondary muscles with legacy group fallback.
 */
export function filterExercises(exercises: Exercise[], filter: WikiFilter): Exercise[] {
  const q = filter.query.trim().toLowerCase();
  return exercises.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (filter.muscle !== 'all' && e.muscle_group !== filter.muscle) return false;
    if (filter.equipment !== 'all' && !resolveEquipmentTags(e).includes(filter.equipment)) return false;
    if (filter.region != null && !regionMatches(e, filter.region)) return false;
    return true;
  });
}

export interface DetailSections {
  /** Steps to show: detailed list, or the legacy one-liner as a single step. */
  instructions: string[];
  cues: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipmentTags: EquipmentTag[];
}

/**
 * Legacy-safe view model for the detail sheet. Rows without Wiki metadata
 * still render: instructions fall back to the legacy one-liner (or nothing
 * when that is blank), every other section degrades to an empty list.
 */
export function getDetailSections(exercise: Exercise): DetailSections {
  const detailed = (exercise.detailed_instructions ?? []).filter((s) => s.trim().length > 0);
  const legacy = (exercise.instructions ?? '').trim();
  return {
    instructions: detailed.length > 0 ? detailed : legacy ? [legacy] : [],
    cues: (exercise.cues ?? []).filter((s) => s.trim().length > 0),
    primaryMuscles: (exercise.primary_muscles ?? []).filter((s) => s.trim().length > 0),
    secondaryMuscles: (exercise.secondary_muscles ?? []).filter((s) => s.trim().length > 0),
    equipmentTags: resolveEquipmentTags(exercise),
  };
}
