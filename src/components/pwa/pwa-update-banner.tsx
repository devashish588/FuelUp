'use client';
import { usePwaStore } from '@/lib/pwa/pwa-store';

/**
 * Unobtrusive update prompt: appears only when a newer service worker is
 * waiting. Reload is strictly user-initiated (never during a workout unless
 * the user chooses it); dismissing hides it for this session.
 */
export function PwaUpdateBanner() {
  const { updateWaiting, dismissed, dismissUpdate, applyUpdate } = usePwaStore();

  if (!updateWaiting || dismissed) return null;

  return (
    <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] lg:bottom-6 left-4 right-4 lg:left-auto lg:right-6 lg:w-[380px] z-50 fade-in">
      <div className="max-w-lg mx-auto rounded-2xl bg-[#161616] border border-[#2a2a2a] shadow-2xl px-4 py-3 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-[#f59e0b] shrink-0 animate-pulse" aria-hidden />
        <p className="flex-1 text-[12px] text-[#ccc]">New FuelUp version available</p>
        <button
          onClick={dismissUpdate}
          className="min-h-[44px] px-3 text-[12px] font-medium text-[#777]"
          aria-label="Dismiss update"
        >
          Later
        </button>
        <button
          onClick={applyUpdate}
          className="min-h-[44px] px-4 rounded-xl gradient-btn text-[12px]"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
