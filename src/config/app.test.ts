// APP_VERSION must match package.json — the Settings footer and the
// diagnostics card display it, so drift would mislabel release QA.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './app';

describe('app config', () => {
  it('APP_VERSION matches package.json version', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
});
