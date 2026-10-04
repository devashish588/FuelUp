// Exercise Wiki MVP: taxonomy mapping, filtering, and legacy-safe sections.
// Pure logic (node env has no DOM); component wiring verified in browser.
import { describe, expect, it } from 'vitest';
import { EXERCISE_DATABASE } from '@/lib/constants/exercise-database';
import {
  filterExercises,
  getDetailSections,
  hasWikiContent,
  resolveEquipmentTags,
} from './wiki';

describe('resolveEquipmentTags', () => {
  it('maps every legacy database equipment value to at least one tag', () => {
    for (const entry of EXERCISE_DATABASE) {
      const tags = resolveEquipmentTags({ equipment: entry.equipment });
      expect(tags.length, entry.equipment).toBeGreaterThan(0);
    }
  });

  it('spot-checks representative legacy mappings', () => {
    expect(resolveEquipmentTags({ equipment: 'Barbell, Bench' })).toEqual(['barbell', 'bench']);
    expect(resolveEquipmentTags({ equipment: 'Barbell, Squat Rack' })).toEqual(['barbell', 'rack']);
    expect(resolveEquipmentTags({ equipment: 'Bodyweight' })).toEqual(['bodyweight']);
    expect(resolveEquipmentTags({ equipment: 'Bodyweight/Plate' })).toEqual(['bodyweight']);
    expect(resolveEquipmentTags({ equipment: 'Cable Machine' })).toEqual(['cable']);
    expect(resolveEquipmentTags({ equipment: 'Pull-up Bar' })).toEqual(['pullup_bar']);
    expect(resolveEquipmentTags({ equipment: 'Dumbbells' })).toEqual(['dumbbell']);
    expect(resolveEquipmentTags({ equipment: 'Leg Press Machine' })).toEqual(['machine']);
  });

  it('prefers explicit equipment_tags and never returns empty', () => {
    expect(resolveEquipmentTags({ equipment: 'Barbell', equipment_tags: ['cable'] })).toEqual(['cable']);
    expect(resolveEquipmentTags({ equipment: '' })).toEqual(['bodyweight']);
    expect(resolveEquipmentTags({ equipment: 'Some Future Rig' })).toEqual(['other']);
  });
});

describe('filterExercises', () => {
  it('returns everything on an empty filter', () => {
    expect(filterExercises(EXERCISE_DATABASE as never, { query: '', muscle: 'all', equipment: 'all' })).toHaveLength(
      EXERCISE_DATABASE.length
    );
  });

  it('matches names case-insensitively', () => {
    const names = filterExercises(EXERCISE_DATABASE as never, { query: 'bEnCh', muscle: 'all', equipment: 'all' }).map(
      (e) => e.name
    );
    expect(names).toContain('Barbell Bench Press');
    expect(names).not.toContain('Barbell Squat');
  });

  it('filters by muscle group', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, { query: '', muscle: 'legs', equipment: 'all' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((e) => e.muscle_group === 'legs')).toBe(true);
  });

  it('filters by normalized equipment (legacy free text included)', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, { query: '', muscle: 'all', equipment: 'bodyweight' });
    const names = rows.map((e) => e.name);
    expect(names).toContain('Push-ups');
    expect(names).toContain('Plank');
    expect(names).not.toContain('Barbell Bench Press');
  });

  it('combines query + muscle + equipment', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, {
      query: 'press',
      muscle: 'chest',
      equipment: 'barbell',
    });
    const names = rows.map((e) => e.name);
    expect(names).toContain('Barbell Bench Press');
    expect(names).toContain('Incline Bench Press');
    expect(names).not.toContain('Dumbbell Bench Press');
  });
});

describe('wiki content + legacy-safe sections', () => {
  it('marks the 49 enriched entries and only they carry content', () => {
    const enriched = EXERCISE_DATABASE.filter((e) =>
      hasWikiContent({ detailed_instructions: e.detailed_instructions, cues: e.cues })
    );
    expect(enriched.map((e) => e.name).sort()).toEqual(
      [
        'Ab Wheel Rollout',
        'Arnold Press',
        'Barbell Bench Press',
        'Barbell Curl',
        'Barbell Deadlift',
        'Barbell Row',
        'Barbell Squat',
        'Bulgarian Split Squat',
        'Cable Crossover',
        'Cable Woodchop',
        'Calf Raises',
        'Chest Dips',
        'Crunches',
        'Dumbbell Curl',
        'Dumbbell Row',
        'Dumbbell Shoulder Press',
        'Dumbbell Bench Press',
        'Dumbbell Flyes',
        'Elliptical',
        'Face Pulls',
        'Front Raises',
        'Front Squat',
        'Hammer Curl',
        'Hanging Leg Raise',
        'Hip Thrust',
        'Incline Bench Press',
        'Jump Rope',
        'Lat Pulldown',
        'Lateral Raises',
        'Leg Curl',
        'Leg Extension',
        'Leg Press',
        'Lunges',
        'Overhead Press',
        'Overhead Tricep Extension',
        'Plank',
        'Preacher Curl',
        'Pull-ups',
        'Push-ups',
        'Romanian Deadlift',
        'Rowing Machine',
        'Russian Twist',
        'Seated Cable Row',
        'Skull Crushers',
        'Stair Climber',
        'Stationary Bike',
        'T-Bar Row',
        'Tricep Pushdown',
        'Treadmill Running',
      ].sort()
    );
  });

  it('builds full sections for an enriched entry', () => {
    const bench = EXERCISE_DATABASE.find((e) => e.name === 'Barbell Bench Press')!;
    const sections = getDetailSections(bench as never);
    expect(sections.instructions).toHaveLength(4);
    expect(sections.cues.length).toBeGreaterThan(0);
    expect(sections.primaryMuscles).toContain('Chest');
    expect(sections.equipmentTags).toEqual(['barbell', 'bench']);
  });

  it('handles a blank legacy instructions line without crashing', () => {
    const sections = getDetailSections({ instructions: '', equipment: '' } as never);
    expect(sections.instructions).toEqual([]);
    expect(sections.equipmentTags).toEqual(['bodyweight']);
  });
});

describe('region filter (Muscle Map v1)', () => {
  const names = (rows: { name: string }[]) => rows.map((e) => e.name);

  it('matches normalized primary muscles', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, {
      query: '', muscle: 'all', equipment: 'all', region: 'chest',
    });
    expect(names(rows)).toContain('Barbell Bench Press');
    expect(names(rows)).toContain('Push-ups');
    expect(names(rows)).not.toContain('Barbell Squat');
  });

  it('matches explicit secondary muscles outside the legacy group', () => {
    // Plank is core-group; glutes only match through explicit secondary metadata.
    const rows = filterExercises(EXERCISE_DATABASE as never, {
      query: '', muscle: 'all', equipment: 'all', region: 'glutes',
    });
    expect(names(rows)).toContain('Plank');
    expect(names(rows)).toContain('Barbell Squat');
  });

  it('falls back to legacy group expansion without Wiki metadata', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, {
      query: '', muscle: 'all', equipment: 'all', region: 'lats',
    });
    expect(names(rows)).toContain('Lat Pulldown');
    expect(names(rows)).toContain('T-Bar Row');
    expect(names(rows)).toContain('Pull-ups');
    expect(names(rows)).not.toContain('Barbell Bench Press');
  });

  it('treats absent or cleared regions as no filter', () => {
    const all = EXERCISE_DATABASE.length;
    expect(filterExercises(EXERCISE_DATABASE as never, { query: '', muscle: 'all', equipment: 'all' })).toHaveLength(all);
    expect(
      filterExercises(EXERCISE_DATABASE as never, { query: '', muscle: 'all', equipment: 'all', region: null })
    ).toHaveLength(all);
  });

  it('combines region with query, muscle, and equipment filters', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, {
      query: 'press', muscle: 'chest', equipment: 'barbell', region: 'chest',
    });
    expect(names(rows)).toContain('Barbell Bench Press');
    expect(names(rows)).not.toContain('Dumbbell Bench Press');
  });

  it('returns empty when nothing satisfies every filter', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, {
      query: '', muscle: 'chest', equipment: 'all', region: 'forearms',
    });
    expect(rows).toHaveLength(0);
  });

  it('excludes cardio exercises from every muscle region', () => {
    const cardioNames = ['Elliptical', 'Jump Rope', 'Rowing Machine', 'Stair Climber', 'Stationary Bike', 'Treadmill Running'];
    for (const region of ['quads', 'lats', 'chest', 'biceps'] as const) {
      const rows = filterExercises(EXERCISE_DATABASE as never, {
        query: '', muscle: 'all', equipment: 'all', region,
      });
      for (const name of cardioNames) {
        expect(names(rows), `${region} vs ${name}`).not.toContain(name);
      }
    }
  });

  it('keeps region counts consistent with the same matcher', () => {
    const rows = filterExercises(EXERCISE_DATABASE as never, {
      query: '', muscle: 'all', equipment: 'all', region: 'quads',
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(names(rows)).toContain('Barbell Squat');
    expect(names(rows)).toContain('Lunges');
  });
});

describe('enriched metadata validity (Batch 1)', () => {
  it('validates every enriched entry against the canonical vocabularies', () => {
    const validTags = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'bench', 'rack', 'bodyweight', 'pullup_bar', 'dip_bars', 'bands', 'cardio_machine', 'jump_rope', 'other'];
    const validMovements = ['push', 'pull', 'hinge', 'squat', 'lunge', 'carry', 'rotation', 'core_stability', 'isolation', 'cardio'];
    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    for (const entry of EXERCISE_DATABASE) {
      const enriched =
        (entry.detailed_instructions?.length ?? 0) > 0 || (entry.cues?.length ?? 0) > 0;
      if (!enriched) continue;
      for (const tag of entry.equipment_tags ?? []) {
        expect(validTags, `${entry.name} tag`).toContain(tag);
      }
      expect(validMovements, entry.name).toContain(entry.movement);
      expect(validDifficulties, entry.name).toContain(entry.difficulty);
      expect((entry.detailed_instructions ?? []).length, entry.name).toBeGreaterThanOrEqual(3);
      expect((entry.cues ?? []).length, entry.name).toBeGreaterThanOrEqual(2);
      // Cardio exercises have empty primary_muscles by design; others must have at least one
      if (entry.muscle_group !== 'cardio') {
        expect((entry.primary_muscles ?? []).length, entry.name).toBeGreaterThan(0);
      }
    }
  });

  it('keeps legacy fields intact on every enriched entry', () => {
    for (const entry of EXERCISE_DATABASE) {
      expect(typeof entry.name, 'name').toBe('string');
      expect(typeof entry.muscle_group, entry.name).toBe('string');
      expect(typeof entry.equipment, entry.name).toBe('string');
      expect(typeof entry.instructions, entry.name).toBe('string');
      expect(typeof entry.is_custom, entry.name).toBe('boolean');
    }
    const pulldown = EXERCISE_DATABASE.find((e) => e.name === 'Lat Pulldown')!;
    expect(pulldown.equipment).toBe('Cable Machine');
    expect(pulldown.instructions).toBe('Pull bar down to chest, squeeze lats.');
    expect(pulldown.muscle_group).toBe('back');
  });
});

describe('enriched metadata validity (Batch 2: Chest + Cardio)', () => {
  it('validates every enriched entry against the canonical vocabularies', () => {
    const validTags = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'bench', 'rack', 'bodyweight', 'pullup_bar', 'dip_bars', 'bands', 'cardio_machine', 'jump_rope', 'other'];
    const validMovements = ['push', 'pull', 'hinge', 'squat', 'lunge', 'carry', 'rotation', 'core_stability', 'isolation', 'cardio'];
    const validDifficulties = ['beginner', 'intermediate', 'advanced'];
    for (const entry of EXERCISE_DATABASE) {
      const enriched =
        (entry.detailed_instructions?.length ?? 0) > 0 || (entry.cues?.length ?? 0) > 0;
      if (!enriched) continue;
      for (const tag of entry.equipment_tags ?? []) {
        expect(validTags, `${entry.name} tag`).toContain(tag);
      }
      expect(validMovements, entry.name).toContain(entry.movement);
      expect(validDifficulties, entry.name).toContain(entry.difficulty);
      expect((entry.detailed_instructions ?? []).length, entry.name).toBeGreaterThanOrEqual(3);
      expect((entry.cues ?? []).length, entry.name).toBeGreaterThanOrEqual(2);
      // Cardio exercises have empty primary_muscles by design; others must have at least one
      if (entry.muscle_group !== 'cardio') {
        expect((entry.primary_muscles ?? []).length, entry.name).toBeGreaterThan(0);
      }
    }
  });

  it('cardio exercises have empty muscles and valid cardio metadata', () => {
    const cardioNames = ['Treadmill Running', 'Stationary Bike', 'Rowing Machine', 'Elliptical', 'Jump Rope', 'Stair Climber'];
    for (const name of cardioNames) {
      const entry = EXERCISE_DATABASE.find((e) => e.name === name)!;
      expect(entry.primary_muscles).toEqual([]);
      expect(entry.secondary_muscles).toEqual([]);
      expect(entry.movement).toBe('cardio');
      expect(entry.difficulty).toBe('beginner');
      // All cardio have cardio_machine except Jump Rope which has jump_rope
      if (name === 'Jump Rope') {
        expect(entry.equipment_tags).toContain('jump_rope');
      } else {
        expect(entry.equipment_tags).toContain('cardio_machine');
      }
    }
  });

  it('keeps legacy fields intact on every enriched entry', () => {
    for (const entry of EXERCISE_DATABASE) {
      expect(typeof entry.name, 'name').toBe('string');
      expect(typeof entry.muscle_group, entry.name).toBe('string');
      expect(typeof entry.equipment, entry.name).toBe('string');
      expect(typeof entry.instructions, entry.name).toBe('string');
      expect(typeof entry.is_custom, entry.name).toBe('boolean');
    }
    const incline = EXERCISE_DATABASE.find((e) => e.name === 'Incline Bench Press')!;
    expect(incline.equipment).toBe('Barbell, Incline Bench');
    expect(incline.instructions).toBe('Incline bench at 30-45°, press barbell from chest.');
    expect(incline.muscle_group).toBe('chest');
    const treadmill = EXERCISE_DATABASE.find((e) => e.name === 'Treadmill Running')!;
    expect(treadmill.equipment).toBe('Treadmill');
    expect(treadmill.instructions).toBe('Run at desired pace and incline.');
    expect(treadmill.muscle_group).toBe('cardio');
  });
});
