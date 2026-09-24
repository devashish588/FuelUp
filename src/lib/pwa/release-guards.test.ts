// Phase 10 release guards: static checks over app shell sources.
// These fail the build if mobile/PWA hardening regresses:
// viewport must not restrict zoom, reduced-motion + tap rules must exist,
// and the update banner must reach desktop users too.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('mobile release guards', () => {
  it('viewport allows pinch zoom (no maximum-scale restriction)', () => {
    const layout = src('src', 'app', 'layout.tsx');
    expect(layout).toContain('width: "device-width"');
    expect(layout).not.toMatch(/maximumScale|maximum-scale/);
  });

  it('respects prefers-reduced-motion and removes tap highlight', () => {
    const css = src('src', 'app', 'globals.css');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('-webkit-tap-highlight-color: transparent');
  });

  it('shows the PWA update banner on desktop as well as mobile', () => {
    const banner = src('src', 'components', 'pwa', 'pwa-update-banner.tsx');
    expect(banner).not.toContain('lg:hidden');
  });

  it('bottom navigation keeps 44px+ touch targets with safe-area padding', () => {
    const nav = src('src', 'components', 'layout', 'bottom-nav.tsx');
    expect(nav).toContain('h-12');
    expect(nav).toContain('safe-area-inset-bottom');
  });

  it('numeric inputs declare virtual-keyboard modes', () => {
    const calories = src('src', 'app', '(main)', 'calories', 'page.tsx');
    expect(calories.match(/inputMode="decimal"/g)?.length ?? 0).toBeGreaterThan(5);
  });
});
