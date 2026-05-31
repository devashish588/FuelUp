'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Sidebar } from '@/components/layout/sidebar';
import { useProfileStore } from '@/stores/profile-store';
import { useHabitStore } from '@/stores/habit-store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isOnboarded = useProfileStore((s) => s.isOnboarded);
  const initDefaultHabits = useHabitStore((s) => s.initDefaultHabits);

  useEffect(() => {
    if (!isOnboarded && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
    initDefaultHabits();
  }, [isOnboarded, pathname, router, initDefaultHabits]);

  if (!isOnboarded) return null;

  return (
    <div className="min-h-screen bg-[#0b0b0c] flex">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <main className="pb-20 lg:pb-6 lg:px-8 xl:px-10">
          <div className="fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
}
