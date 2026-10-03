// Muscle Map artwork guards (node env: source-text assertions, same style
// as brand/fuel-up-logo.test.ts). The artwork must stay original,
// registry-driven, and accessible without baking state into path data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

const PATH = ['src', 'components', 'exercise', 'muscle-map.tsx'] as const;

const IDS = [
  'chest', 'front_delts', 'side_delts', 'biceps', 'forearms', 'abs', 'obliques', 'quads',
  'traps', 'rear_delts', 'lats', 'upper_back', 'lower_back', 'triceps', 'glutes', 'hamstrings', 'calves',
];

describe('Muscle Map artwork', () => {
  it('exports front and back views driven by the canonical registry', () => {
    const code = src(...PATH);
    expect(code).toContain('export function MuscleMapFront');
    expect(code).toContain('export function MuscleMapBack');
    expect(code).toContain('FRONT_REGION_IDS');
    expect(code).toContain('BACK_REGION_IDS');
    expect(code).toContain('MUSCLE_REGIONS');
  });

  it('defines geometry for every canonical region in exactly one view', () => {
    const code = src(...PATH);
    for (const id of IDS) {
      // Path regions use `id: { d: ... }`, ellipse regions use `id: [ ... ]`;
      // `id: null` placeholders must not match either pattern.
      const pathDefs = code.split(`${id}: { d:`).length - 1;
      const ellipseDefs = code.split(`${id}: [`).length - 1;
      expect(pathDefs + ellipseDefs, id).toBe(1);
    }
  });

  it('keeps regions accessible and keyboard-operable', () => {
    const code = src(...PATH);
    expect(code).toContain('role="button"');
    expect(code).toContain('tabIndex={0}');
    expect(code).toContain('aria-pressed={selected}');
    expect(code).toContain('aria-label={');
    expect(code).toContain('data-region={id}');
    expect(code).toContain("'Enter'");
    expect(code).toContain("' '");
    expect(code).toContain('focus-visible:');
  });

  it('drives selection through state, never baked into path data', () => {
    const code = src(...PATH);
    expect(code).toContain('selected === id');
    // Path/geometry definitions carry coordinates only — no fills, no brand.
    const geometry = code.slice(code.indexOf('FRONT_PATHS'), code.indexOf('function BaseFigure'));
    expect(geometry).not.toContain('fill');
    expect(geometry).not.toContain('#f59e0b');
    expect(geometry).not.toContain('#fbbf24');
  });

  it('contains no copied third-party branding, names, or artwork references', () => {
    const code = src(...PATH).toLowerCase();
    for (const banned of ['musclewiki', 'muscle wiki', 'exrx', 'bodybuilding.com', 'wikipedia', 'getty', 'shutterstock']) {
      expect(code, banned).not.toContain(banned);
    }
  });

  it('renders responsive SVGs with named accessible views', () => {
    const code = src(...PATH);
    expect(code).toContain('viewBox="0 0 200 400"');
    expect(code).toContain('aria-label="Front muscle map"');
    expect(code).toContain('aria-label="Back muscle map"');
    expect(code).toContain('h-auto w-full');
  });

  it('gives small regions transparent hit padding', () => {
    const code = src(...PATH);
    expect(code).toContain('strokeWidth="14"');
    expect(code).toContain("pointerEvents: 'all'");
  });
});
