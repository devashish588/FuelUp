'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// import { useAuth } from '@clerk/nextjs';
import { useProfileStore } from '@/stores/profile-store';
import { Dumbbell } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  // const { isSignedIn, isLoaded } = useAuth();
  // Temporary mock for debugging - will be signed out by default
  const isSignedIn = false;
  const isLoaded = true;
  const isOnboarded = useProfileStore((s) => s.isOnboarded);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      router.replace(isOnboarded ? '/dashboard' : '/onboarding');
    } else {
      router.replace('/sign-in');
    }
  }, [isSignedIn, isLoaded, isOnboarded, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0b0c]">
      <div className="text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#FFB800] flex items-center justify-center mb-4 shadow-lg animate-pulse" style={{ boxShadow: '0 4px 32px rgba(255,122,0,0.3)' }}>
          <Dumbbell className="w-8 h-8 text-[#1A1A1A]" />
        </div>
        <span className="text-[24px] font-extrabold tracking-tight">
          <span className="text-white">Fuel</span>
          <span className="text-[#FFB800]">Up</span>
        </span>
        <p className="text-[12px] text-[#444] mt-1">Loading...</p>
      </div>
    </div>
  );
}
