'use client';
import { create } from 'zustand';

// Module-held registration (non-serializable; never in the store itself).
let activeRegistration: ServiceWorkerRegistration | null = null;

export function setActiveRegistration(reg: ServiceWorkerRegistration | null) {
  activeRegistration = reg;
}

interface PwaState {
  /** A newer service worker is waiting; user may reload to apply it. */
  updateWaiting: boolean;
  dismissed: boolean;
  setUpdateWaiting: () => void;
  dismissUpdate: () => void;
  /** Ask the waiting worker to activate (user-initiated only). */
  applyUpdate: () => void;
}

/** In-memory only: PWA lifecycle UI state. Never persisted. */
export const usePwaStore = create<PwaState>()((set) => ({
  updateWaiting: false,
  dismissed: false,
  setUpdateWaiting: () => set({ updateWaiting: true, dismissed: false }),
  dismissUpdate: () => set({ dismissed: true }),
  applyUpdate: () => {
    const waiting = activeRegistration?.waiting;
    if (waiting) {
      try {
        waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  },
}));
