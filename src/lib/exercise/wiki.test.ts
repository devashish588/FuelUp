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
  it('marks the 10 enriched entries and only they carry content', () => {
    const enriched = EXERCISE_DATABASE.filter((e) =>
      hasWikiContent({ detailed_instructions: e.detailed_instructions, cues: e.cues })
    );
    expect(enriched.map((e) => e.name).sort()).toEqual(
      [
        'Barbell Bench Press',
        'Barbell Deadlift',
        'Barbell Row',
        'Barbell Squat',
        'Dumbbell Curl',
        'Lunges',
        'Overhead Press',
        'Plank',
        'Pull-ups',
        'Push-ups',
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

  it('degrades a legacy entry to its one-liner with empty extras', () => {
    const legacy = EXERCISE_DATABASE.find((e) => e.name === 'Cable Crossover')!;
    expect(hasWikiContent({ detailed_instructions: legacy.detailed_instructions, cues: legacy.cues })).toBe(false);
    const sections = getDetailSections(legacy as never);
    expect(sections.instructions).toEqual([legacy.instructions]);
    expect(sections.cues).toEqual([]);
    expect(sections.primaryMuscles).toEqual([]);
    expect(sections.secondaryMuscles).toEqual([]);
    expect(sections.equipmentTags).toEqual(['cable']);
  });

  it('handles a blank legacy instructions line without crashing', () => {
    const sections = getDetailSections({ instructions: '', equipment: '' } as never);
    expect(sections.instructions).toEqual([]);
    expect(sections.equipmentTags).toEqual(['bodyweight']);
  });
});
