// Device diagnostics helpers: pure capability detection for the Settings
// diagnostics card. All browser access is injected — fully testable here.
import { describe, expect, it } from 'vitest';
import { collectDiagnostics, detectPlatform } from './diagnostics';

describe('detectPlatform', () => {
  it('identifies iOS, Android, desktop, and unknown agents', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toEqual({ platform: 'ios', mobile: true });
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toEqual({ platform: 'ios', mobile: true });
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toEqual({ platform: 'android', mobile: true });
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toEqual({ platform: 'desktop', mobile: false });
    expect(detectPlatform('')).toEqual({ platform: 'unknown', mobile: false });
    expect(detectPlatform(undefined)).toEqual({ platform: 'unknown', mobile: false });
  });
});

describe('collectDiagnostics', () => {
  it('snapshots capabilities with safe defaults', () => {
    expect(collectDiagnostics({})).toEqual({
      platform: 'unknown',
      mobile: false,
      online: true,
      standalone: false,
      serviceWorker: 'unsupported',
      indexedDb: true,
      camera: false,
    });
  });

  it('reflects an installed iOS PWA with camera and SW control', () => {
    const d = collectDiagnostics({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      onLine: true,
      iosStandalone: true,
      serviceWorkerSupported: true,
      serviceWorkerControlled: true,
      indexedDbAvailable: true,
      cameraApiAvailable: true,
    });
    expect(d).toMatchObject({ platform: 'ios', mobile: true, standalone: true, serviceWorker: 'controlled', camera: true });
  });

  it('distinguishes registered-but-uncontrolled workers and offline state', () => {
    const d = collectDiagnostics({ serviceWorkerSupported: true, serviceWorkerControlled: false, onLine: false });
    expect(d.serviceWorker).toBe('registered');
    expect(d.online).toBe(false);
  });
});
