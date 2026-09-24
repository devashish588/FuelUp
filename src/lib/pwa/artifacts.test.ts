// Committed PWA artifacts: icons exist at the sizes the manifest claims,
// and the manifest route source references exactly those files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(join(process.cwd(), file));
  // PNG signature + IHDR width/height (big-endian at offsets 16/20).
  expect(bytes[0]).toBe(137);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('pwa artifacts', () => {
  it('ships 192/512/maskable/apple icons as real PNGs', () => {
    expect(pngSize('public/icons/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngSize('public/icons/icon-512.png')).toEqual({ width: 512, height: 512 });
    expect(pngSize('public/icons/maskable-512.png')).toEqual({ width: 512, height: 512 });
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });

  it('has exactly one manifest source (app/manifest.ts)', () => {
    expect(existsSync(join(process.cwd(), 'public', 'manifest.webmanifest'))).toBe(false);
    const manifest = readFileSync(join(process.cwd(), 'src', 'app', 'manifest.ts'), 'utf8');
    for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png']) {
      expect(manifest).toContain(icon);
      expect(existsSync(join(process.cwd(), 'public', icon))).toBe(true);
    }
    expect(manifest).toContain("display: 'standalone'");
    expect(manifest).toContain("start_url: '/'");
  });

  it('keeps cache versioning independent of the IndexedDB schema version', () => {
    const sw = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    const schema = readFileSync(join(process.cwd(), 'src', 'lib', 'db', 'local-schema.ts'), 'utf8');
    expect(sw).not.toContain('LOCAL_DB_VERSION');
    expect(schema).not.toContain('CACHE_VERSION');
  });
});
