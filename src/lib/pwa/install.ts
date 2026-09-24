// =============================================
// FuelUp - Install experience helpers (client)
// beforeinstallprompt is Chromium-only and fires once: capture it in this
// module (setup once from the bootstrap) so Settings can prompt later.
// iOS Safari has no prompt API — show Add-to-Home-Screen instructions.
// Pure platform detection is injectable for unit tests.
// =============================================
'use client';

export type InstallPlatform = 'installed' | 'chromium' | 'ios' | 'other';

interface PlatformInput {
  userAgent: string;
  standaloneDisplayMode: boolean;
  iosStandalone: boolean;
  hasInstallPrompt: boolean;
}

/** Pure decision table (tested in install.test.ts). */
export function getInstallPlatform(input: PlatformInput): InstallPlatform {
  if (input.standaloneDisplayMode || input.iosStandalone) return 'installed';
  const ua = input.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  if (isIos) return 'ios';
  if (input.hasInstallPrompt) return 'chromium';
  const isChromium = /chrome|chromium|edg|brave|samsungbrowser/.test(ua) && !/firefox/.test(ua);
  if (isChromium) return 'chromium';
  return 'other';
}

export function detectLivePlatform(hasInstallPrompt: boolean): InstallPlatform {
  if (typeof window === 'undefined') return 'other';
  return getInstallPlatform({
    userAgent: navigator.userAgent,
    standaloneDisplayMode:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches,
    iosStandalone:
      typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true,
    hasInstallPrompt,
  });
}

// ---- deferred prompt capture (Chromium) ----

let deferredPrompt: Event | null = null;
let captureSetup = false;

export function hasDeferredPrompt(): boolean {
  return deferredPrompt !== null;
}

export function setupInstallCapture(): () => void {
  if (captureSetup || typeof window === 'undefined') return () => undefined;
  captureSetup = true;
  const onPrompt = (event: Event) => {
    // Hold the prompt for the Settings install action; no auto-modal.
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('fuelup:install-available'));
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    captureSetup = false;
  };
}

/** Show the browser install prompt (Chromium, user gesture required). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const prompt = deferredPrompt as (Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> }) | null;
  if (!prompt || typeof prompt.prompt !== 'function') return 'unavailable';
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    deferredPrompt = null;
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'dismissed';
  }
}
