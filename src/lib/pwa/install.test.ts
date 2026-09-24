// Install platform decision table: pure logic, no browser needed.
import { describe, expect, it } from 'vitest';
import { getInstallPlatform, promptInstall } from './install';

const CHROME_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SAFARI_IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const FIREFOX_UA = 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0';
const DESKTOP_SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('getInstallPlatform', () => {
  it('reports installed in standalone display mode', () => {
    expect(getInstallPlatform({ userAgent: CHROME_UA, standaloneDisplayMode: true, iosStandalone: false, hasInstallPrompt: false })).toBe('installed');
  });

  it('reports installed via iOS navigator.standalone', () => {
    expect(getInstallPlatform({ userAgent: SAFARI_IOS_UA, standaloneDisplayMode: false, iosStandalone: true, hasInstallPrompt: false })).toBe('installed');
  });

  it('guides iOS Safari to Add to Home Screen (no prompt API)', () => {
    expect(getInstallPlatform({ userAgent: SAFARI_IOS_UA, standaloneDisplayMode: false, iosStandalone: false, hasInstallPrompt: false })).toBe('ios');
  });

  it('uses the captured prompt on Chromium', () => {
    expect(getInstallPlatform({ userAgent: CHROME_UA, standaloneDisplayMode: false, iosStandalone: false, hasInstallPrompt: true })).toBe('chromium');
  });

  it('detects Chromium by UA even before the prompt fires', () => {
    expect(getInstallPlatform({ userAgent: CHROME_UA, standaloneDisplayMode: false, iosStandalone: false, hasInstallPrompt: false })).toBe('chromium');
  });

  it('falls back to generic guidance elsewhere', () => {
    expect(getInstallPlatform({ userAgent: FIREFOX_UA, standaloneDisplayMode: false, iosStandalone: false, hasInstallPrompt: false })).toBe('other');
    expect(getInstallPlatform({ userAgent: DESKTOP_SAFARI_UA, standaloneDisplayMode: false, iosStandalone: false, hasInstallPrompt: false })).toBe('other');
    expect(getInstallPlatform({ userAgent: '', standaloneDisplayMode: false, iosStandalone: false, hasInstallPrompt: false })).toBe('other');
  });

  it('standalone wins over every other signal', () => {
    expect(getInstallPlatform({ userAgent: SAFARI_IOS_UA, standaloneDisplayMode: true, iosStandalone: true, hasInstallPrompt: true })).toBe('installed');
  });
});

describe('promptInstall', () => {
  it('reports unavailable without a captured prompt (no crash)', async () => {
    await expect(promptInstall()).resolves.toBe('unavailable');
  });
});
