'use client';

import { Dumbbell } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center relative overflow-hidden">

      {/* ═══ DYNAMIC BACKGROUND ═══ */}

      {/* Large ambient gradient orbs - slowly drifting */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Floating particles */}
      <div className="auth-particle auth-particle-1" />
      <div className="auth-particle auth-particle-2" />
      <div className="auth-particle auth-particle-3" />
      <div className="auth-particle auth-particle-4" />
      <div className="auth-particle auth-particle-5" />
      <div className="auth-particle auth-particle-6" />

      {/* Top light sweep */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(245,158,11,0.2)] to-transparent" />

      {/* ═══ CONTENT ═══ */}
      <div className="auth-card-entrance relative z-10 w-full max-w-md mx-auto px-6 py-12 flex flex-col items-center">

        {/* Logo */}
        <div className="flex items-center gap-3.5 mb-10">
          <div
            className="w-13 h-13 rounded-xl bg-gradient-to-br from-[#f59e0b] to-[#ff7b00] flex items-center justify-center pulse-glow"
            style={{ boxShadow: '0 4px 24px rgba(245,158,11,0.35)' }}
          >
            <Dumbbell className="w-7 h-7 text-[#0d0d0d]" />
          </div>
          <div>
            <span className="text-[24px] font-extrabold tracking-tight">
              <span className="text-white">Fuel</span>
              <span className="text-[#fbbf24]">Up</span>
            </span>
            <span className="text-[10px] text-[#71717a] block -mt-0.5 tracking-[0.18em] uppercase font-medium">
              Track · Improve · Transform
            </span>
          </div>
        </div>

        {/* Clerk component */}
        {children}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 mt-8">
          <svg className="w-3.5 h-3.5 text-[#52525b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-[12px] text-[#52525b] font-medium">
            Your data stays secure · End-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
