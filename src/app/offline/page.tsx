import Link from 'next/link';

// Prerendered at build so the service worker can precache it.
// Shown only when a navigation fails offline — local data flows (Zustand →
// IndexedDB) are untouched; this page just explains and offers a way back.
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#0b0b0c] text-[#f5f5f5] flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#ea580c] flex items-center justify-center text-[28px] font-black text-[#0b0b0c]">
          F
        </div>
        <h1 className="mt-6 text-[22px] font-bold text-white">You&apos;re offline</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[#a0a0a0]">
          Your saved data is still available on this device. Changes you make
          will sync automatically when you&apos;re back online.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href="/dashboard" className="gradient-btn w-full py-3 text-center block">
            Continue to FuelUp
          </Link>
          <Link
            href="/"
            className="w-full py-3 rounded-[10px] text-[13px] font-semibold bg-[#1a1a1a] text-[#AAA] border border-[#222222] text-center block"
          >
            Try again
          </Link>
        </div>
        <p className="mt-6 text-[11px] text-[#444]">FuelUp works offline — your workouts, food logs, habits and metrics are stored on this device.</p>
      </div>
    </div>
  );
}
