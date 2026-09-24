'use client';
import { useEffect, useState } from 'react';

/** True when FuelUp runs as an installed standalone PWA (any platform). */
export function useIsInstalledPWA(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const check = () => {
      const standaloneMode =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches;
      const iosStandalone =
        typeof navigator !== 'undefined' &&
        (navigator as { standalone?: boolean }).standalone === true;
      setInstalled(standaloneMode || iosStandalone);
    };
    check();
    const media = window.matchMedia?.('(display-mode: standalone)');
    const onChange = () => check();
    media?.addEventListener?.('change', onChange);
    window.addEventListener('appinstalled', onChange);
    return () => {
      media?.removeEventListener?.('change', onChange);
      window.removeEventListener('appinstalled', onChange);
    };
  }, []);

  return installed;
}
