'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, UtensilsCrossed, Dumbbell, Target, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { path: '/dashboard', label: 'Home', Icon: LayoutDashboard },
  { path: '/calories', label: 'Food', Icon: UtensilsCrossed },
  { path: '/exercise', label: 'Workout', Icon: Dumbbell },
  { path: '/habits', label: 'Habits', Icon: Target },
  { path: '/settings', label: 'Profile', Icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0b0b0c]/95 backdrop-blur-xl border-t border-[#1a1a1a]">
      <div className="max-w-lg mx-auto flex items-center justify-around h-[56px]">
        {NAV.map(({ path, label, Icon }) => {
          const active = pathname === path || pathname.startsWith(path + '/');
          return (
            <Link key={path} href={path}
              className={cn('flex flex-col items-center justify-center gap-0.5 w-14 h-12 transition-all',
                active ? 'text-[#f59e0b]' : 'text-[#444]')}>
              <Icon className={cn('w-5 h-5', active ? 'opacity-100' : 'opacity-50')} strokeWidth={active ? 2 : 1.5} />
              <span className={cn('text-[9px]', active ? 'font-bold' : 'font-medium')}>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
