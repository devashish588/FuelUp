// Service-worker safety guards: static analysis of public/sw.js.
// The worker must cache shell/assets only — never domain data, auth, or
// storage APIs. These tests fail the build if someone caches /api or
// imports storage/auth into the worker.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function swSource(): string {
  return readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
}

/** Executable code only: comments document intent and name the same APIs. */
function swCode(): string {
  return swSource()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('service worker guards', () => {
  it('versions caches from a single const', () => {
    const src = swSource();
    const declarations = src.match(/const CACHE_VERSION =/g) ?? [];
    expect(declarations).toHaveLength(1);
    expect(src).toContain('fuelup-static-${CACHE_VERSION}');
    expect(src).toContain('fuelup-pages-${CACHE_VERSION}');
  });

  it('never touches storage or auth APIs', () => {
    const src = swCode();
    expect(src).not.toMatch(/indexedDB/i);
    expect(src).not.toMatch(/localStorage/i);
    expect(src).not.toMatch(/sessionStorage/i);
    // No Clerk SDK, secrets, or token handling — only a hostname allowlist
    // so auth traffic stays network-only.
    expect(src).not.toMatch(/^import\s/m);
    expect(src).not.toMatch(/secret|getToken|session_token/i);
    expect(src).toContain("includes('clerk')");
    expect(src).not.toMatch(/eval\(/);
  });

  it('keeps API, flight data, and auth network-only', () => {
    const src = swSource();
    expect(src).toContain('/api/');
    expect(src).toContain('_rsc=');
    expect(src).toContain('/sign-in');
    // The only cache.put targets are the static/pages caches.
    const puts = [...src.matchAll(/cache\.put\(/g)];
    expect(puts.length).toBeGreaterThan(0);
    expect(src).not.toContain('apiCache');
    expect(src).not.toContain('dynamic-cache');
  });

  it('precaches an offline fallback and cleans only fuelup caches', () => {
    const src = swSource();
    expect(src).toContain('/offline');
    expect(src).toContain("startsWith('fuelup-')");
    // Activation must not drop unknown (non-fuelup) caches.
    expect(src).not.toMatch(/caches\.delete\(\s*\)/);
  });

  it('integrates Background Sync without sync logic', () => {
    const src = swCode();
    expect(src).toContain('fuelup-sync');
    expect(src).toContain('FUELUP_SYNC_NOW');
    expect(src).not.toMatch(/\/api\/sync/);
  });

  it('applies updates only on explicit user action', () => {
    const src = swCode();
    expect(src).toContain('SKIP_WAITING');
    // No automatic skipWaiting on install (would interrupt workouts).
    const installBlock = src.slice(src.indexOf("addEventListener('install'"), src.indexOf("addEventListener('activate'"));
    expect(installBlock).not.toContain('skipWaiting');
  });
});
