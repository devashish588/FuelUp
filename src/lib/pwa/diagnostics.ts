// =============================================
// FuelUp - Device diagnostics helpers (pure, client-safe)
// Platform/capability detection for the Settings diagnostics card and the
// mobile QA checklist. Everything is injected (no globals read here) so
// the logic is unit-testable in node. No personal data, no secrets —
// only capability booleans and a coarse platform label.
// =============================================

export type DiagnosticPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

export interface DiagnosticEnv {
  userAgent?: string;
  onLine?: boolean;
  standaloneDisplay?: boolean;
  iosStandalone?: boolean;
  serviceWorkerSupported?: boolean;
  serviceWorkerControlled?: boolean;
  indexedDbAvailable?: boolean;
  cameraApiAvailable?: boolean;
}

export interface DeviceDiagnostics {
  platform: DiagnosticPlatform;
  mobile: boolean;
  online: boolean;
  standalone: boolean;
  serviceWorker: 'controlled' | 'registered' | 'unsupported';
  indexedDb: boolean;
  camera: boolean;
}

export function detectPlatform(userAgent: string | undefined): { platform: DiagnosticPlatform; mobile: boolean } {
  const ua = userAgent ?? '';
  if (/iphone|ipad|ipod/i.test(ua)) return { platform: 'ios', mobile: true };
  if (/android/i.test(ua)) return { platform: 'android', mobile: true };
  if (/mobi|tablet|touch/i.test(ua)) return { platform: 'unknown', mobile: true };
  if (ua === '') return { platform: 'unknown', mobile: false };
  return { platform: 'desktop', mobile: false };
}

/** Pure capability snapshot from an injected environment. */
export function collectDiagnostics(env: DiagnosticEnv = {}): DeviceDiagnostics {
  const { platform, mobile } = detectPlatform(env.userAgent);
  const serviceWorker =
    env.serviceWorkerSupported !== true
      ? 'unsupported'
      : env.serviceWorkerControlled === true
        ? 'controlled'
        : 'registered';
  return {
    platform,
    mobile,
    online: env.onLine !== false,
    standalone: env.standaloneDisplay === true || env.iosStandalone === true,
    serviceWorker,
    indexedDb: env.indexedDbAvailable !== false,
    camera: env.cameraApiAvailable === true,
  };
}

/** Live browser snapshot (thin wrapper — call from components only). */
export function collectLiveDiagnostics(): DeviceDiagnostics {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return collectDiagnostics({});
  }
  return collectDiagnostics({
    userAgent: navigator.userAgent,
    onLine: navigator.onLine,
    standaloneDisplay:
      typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches,
    iosStandalone: (navigator as { standalone?: boolean }).standalone === true,
    serviceWorkerSupported: 'serviceWorker' in navigator,
    serviceWorkerControlled: !!navigator.serviceWorker?.controller,
    indexedDbAvailable: 'indexedDB' in window,
    cameraApiAvailable: typeof navigator.mediaDevices?.getUserMedia === 'function',
  });
}
