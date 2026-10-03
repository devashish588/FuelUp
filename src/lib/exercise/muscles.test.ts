// Muscle Map v1 taxonomy: canonical regions, legacy expansion,
// label normalization, per-exercise overrides, and matching.
import { describe, expect, it } from 'vitest';
import { EXERCISE_DATABASE } from '@/lib/constants/exercise-database';
import {
  BACK_REGION_IDS,
  FRONT_REGION_IDS,
  GROUP_REGION_EXPANSION,
  MUSCLE_REGION_IDS,
  MUSCLE_REGIONS,
  normalizeMuscleLabel,
  regionMatches,
  regionsForExercise,
} from './muscles';

describe('canonical taxonomy', () => {
  it('has exactly the 17 spec regions with stable ids, labels, and views', () => {
    expect(MUSCLE_REGION_IDS).toHaveLength(17);
    expect(new Set(MUSCLE_REGION_IDS).size).toBe(17);
    for (const id of MUSCLE_REGION_IDS) {
      const region = MUSCLE_REGIONS[id];
      expect(region.id).toBe(id);
      expect(region.label.length).toBeGreaterThan(0);
      expect(['front', 'back']).toContain(region.view);
    }
    expect(FRONT_REGION_IDS).toEqual(
      expect.arrayContaining(['chest', 'front_delts', 'side_delts', 'biceps', 'forearms', 'abs', 'obliques', 'quads'])
    );
    expect(FRONT_REGION_IDS).toHaveLength(8);
    expect(BACK_REGION_IDS).toHaveLength(9);
    expect([...FRONT_REGION_IDS, ...BACK_REGION_IDS].sort()).toEqual([...MUSCLE_REGION_IDS].sort());
  });

  it('expands legacy groups per spec, excluding cardio and full_body', () => {
    expect(GROUP_REGION_EXPANSION.chest).toEqual(['chest']);
    expect(GROUP_REGION_EXPANSION.back).toEqual(['lats', 'traps', 'upper_back', 'lower_back']);
    expect(GROUP_REGION_EXPANSION.shoulders).toEqual(['front_delts', 'side_delts', 'rear_delts']);
    expect(GROUP_REGION_EXPANSION.arms).toEqual(['biceps', 'triceps', 'forearms']);
    expect(GROUP_REGION_EXPANSION.legs).toEqual(['quads', 'glutes', 'hamstrings', 'calves']);
    expect(GROUP_REGION_EXPANSION.core).toEqual(['abs', 'obliques']);
    expect(GROUP_REGION_EXPANSION.cardio).toEqual([]);
    expect(GROUP_REGION_EXPANSION.full_body).toEqual([]);
  });
});

describe('normalizeMuscleLabel', () => {
  it('resolves canonical labels and rejects unknowns', () => {
    expect(normalizeMuscleLabel('X', 'Front shoulders')).toEqual(['front_delts']);
    expect(normalizeMuscleLabel('X', 'Lats')).toEqual(['lats']);
    expect(normalizeMuscleLabel('X', 'Upper back')).toEqual(['upper_back']);
    expect(normalizeMuscleLabel('X', 'Quadriceps')).toEqual(['quads']);
    expect(normalizeMuscleLabel('X', 'Rear shoulders')).toEqual(['rear_delts']);
    expect(normalizeMuscleLabel('X', 'Something New')).toEqual([]);
    expect(normalizeMuscleLabel('X', '')).toEqual([]);
  });

  it('resolves ambiguous bare labels per exercise, not globally', () => {
    // Deadlift hinge: back work is the spinal erectors.
    expect(normalizeMuscleLabel('Barbell Deadlift', 'Back')).toEqual(['lower_back']);
    // Plank: supporting actors, kept whole-group.
    expect(normalizeMuscleLabel('Plank', 'Shoulders')).toEqual(['front_delts']);
    expect(normalizeMuscleLabel('Plank', 'Back')).toEqual(['upper_back', 'lower_back']);
    // Elsewhere bare labels stay whole-group (documented over-inclusion).
    expect(normalizeMuscleLabel('Other', 'Back')).toEqual(['lats', 'traps', 'upper_back', 'lower_back']);
    expect(normalizeMuscleLabel('Other', 'Shoulders')).toEqual(['front_delts', 'side_delts', 'rear_delts']);
    expect(normalizeMuscleLabel('Other', 'Core')).toEqual(['abs', 'obliques']);
  });
});

describe('regionsForExercise + regionMatches', () => {
  it('uses explicit Wiki metadata when present', () => {
    const bench = EXERCISE_DATABASE.find((e) => e.name === 'Barbell Bench Press')!;
    const regions = regionsForExercise(bench);
    expect(regions.primary).toEqual(expect.arrayContaining(['chest', 'front_delts', 'triceps']));
    expect(regionMatches(bench, 'chest')).toBe(true);
    expect(regionMatches(bench, 'front_delts')).toBe(true);
    expect(regionMatches(bench, 'quads')).toBe(false);
  });

  it('matches explicit secondary muscles outside the legacy group', () => {
    // Plank is core-group; glutes can only match via explicit secondary.
    const plank = EXERCISE_DATABASE.find((e) => e.name === 'Plank')!;
    const regions = regionsForExercise(plank);
    expect(regions.primary).toEqual(expect.arrayContaining(['abs']));
    expect(regions.secondary).toEqual(expect.arrayContaining(['glutes']));
    expect(regionMatches(plank, 'glutes')).toBe(true);
  });

  it('falls back to group expansion for legacy rows', () => {
    const crossover = EXERCISE_DATABASE.find((e) => e.name === 'Cable Crossover')!;
    expect(regionsForExercise(crossover)).toEqual({ primary: ['chest'], secondary: [] });
    const tbar = EXERCISE_DATABASE.find((e) => e.name === 'T-Bar Row')!;
    expect(regionMatches(tbar, 'lats')).toBe(true);
    expect(regionMatches(tbar, 'quads')).toBe(false);
  });

  it('never matches cardio or empty rows to any region', () => {
    const treadmill = EXERCISE_DATABASE.find((e) => e.name === 'Treadmill Running')!;
    expect(regionsForExercise(treadmill)).toEqual({ primary: [], secondary: [] });
    for (const id of MUSCLE_REGION_IDS) {
      expect(regionMatches(treadmill, id)).toBe(false);
    }
  });

  it('gives every non-cardio database entry at least one primary region', () => {
    for (const entry of EXERCISE_DATABASE) {
      const regions = regionsForExercise(entry);
      if (entry.muscle_group === 'cardio') {
        expect(regions.primary).toEqual([]);
      } else {
        expect(regions.primary.length, entry.name).toBeGreaterThan(0);
      }
    }
  });
});
