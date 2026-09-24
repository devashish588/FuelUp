'use client';
import { useEffect } from 'react';
import { SW_PATH, SW_SCOPE } from '@/config/pwa';
import { setActiveRegistration, usePwaStore } from '@/lib/pwa/pwa-store';
import { setupInstallCapture } from '@/lib/pwa/install';
import { syncNow } from '@/lib/sync/sync-controller';

/**
 * Single service-worker registration point. Browser-only, once per load:
 * registers /sw.js, surfaces waiting updates (never force-applies), reloads
 * only after the user accepts an update, and relays Background Sync events
 * to the existing syncNow() (progressive enhancement — nothing breaks
 * without it). Registration failure never crashes the app.
 */
export function SwRegister() {
  useEffect(() => {
    setupInstallCapture();
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    let cleanupControllerChange: (() => void) | undefined;

    void (async () => {
      try {
        const reg = await navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
        if (cancelled) return;
        setActiveRegistration(reg);

        const checkWaiting = () => {
          if (reg.waiting && !navigator.serviceWorker.controller) {
            // First install: page will be controlled on next load; nothing to show.
            return;
          }
          if (reg.waiting) usePwaStore.getState().setUpdateWaiting();
        };
        checkWaiting();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && reg.waiting) {
              usePwaStore.getState().setUpdateWaiting();
            }
          });
        });

        // Accepted update applied → reload once to the new shell.
        let reloaded = false;
        const onControllerChange = () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        cleanupControllerChange = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        };

        // Background Sync relay (optional): SW has no sync logic of its own.
        messageHandler = (event: MessageEvent) => {
          if (event.data && (event.data as { type?: string }).type === 'FUELUP_SYNC_NOW') {
            void syncNow();
          }
        };
        navigator.serviceWorker.addEventListener('message', messageHandler);
      } catch {
        // Unsupported browser / file:// / private mode: plain web app.
      }
    })();

    return () => {
      cancelled = true;
      setActiveRegistration(null);
      cleanupControllerChange?.();
      cleanupControllerChange = undefined;
      if (messageHandler && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
      }
    };
  }, []);

  return null;
}
