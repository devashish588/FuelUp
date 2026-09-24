'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, UtensilsCrossed, Dumbbell, Target, Scale, Settings, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileStore } from '@/stores/profile-store';

const MAIN_NAV = [
  { path: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
];

const TRACKING_NAV = [
  { path: '/calories', label: 'Nutrition', Icon: UtensilsCrossed },
  { path: '/exercise', label: 'Workouts', Icon: Dumbbell },
  { path: '/habits', label: 'Habits', Icon: Target },
  { path: '/metrics', label: 'Body Metrics', Icon: Scale },
];

const ACCOUNT_NAV = [
  { path: '/settings', label: 'Settings', Icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const profile = useProfileStore((s) => s.profile);
  const name = profile?.full_name?.split(' ')[0] || 'User';

  const NavItem = ({ path, label, Icon }: { path: string; label: string; Icon: React.ElementType }) => {
    const active = pathname === path || pathname.startsWith(path + '/');
    return (
      <Link key={path} href={path}
        className={cn(
          'relative flex items-center gap-3 h-[44px] px-3 rounded-[10px] transition-all duration-200 text-[13px] font-medium group',
          active
            ? 'bg-[rgba(245,158,11,0.12)] text-[#f59e0b]'
            : 'text-[#666] hover:text-[#999] hover:bg-[#161616]'
        )}>
        {/* Active indicator bar */}
        {active && (
          <div className="absolute left-0 top-[10px] bottom-[10px] w-[3px] rounded-r-full bg-[#f59e0b]" />
        )}
        <Icon className={cn('w-5 h-5 transition-opacity', active ? 'opacity-100' : 'opacity-50 group-hover:opacity-70')} strokeWidth={active ? 2 : 1.5} />
        <span className={cn(active && 'font-semibold')}>{label}</span>
      </Link>
    );
  };

  return (
    <aside className="hidden lg:flex flex-col w-[260px] h-screen sticky top-0 bg-[#0b0b0c] border-r border-[#1a1a1a]">
      {/* Logo */}
      <div className="px-5 pt-7 pb-7">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF7A00] to-[#FFB800] flex items-center justify-center shadow-lg" style={{ boxShadow: '0 4px 16px rgba(255,122,0,0.25)' }}>
            <Dumbbell className="w-5 h-5 text-[#1A1A1A]" />
          </div>
          <div>
            <span className="text-[16px] font-extrabold tracking-tight"><span className="text-white">Fuel</span><span className="text-[#FFB800]">Up</span></span>
            <span className="text-[9px] text-[#555] block -mt-0.5 tracking-[0.15em] uppercase">Track · Improve · Transform</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto no-scrollbar">
        <div className="text-[10px] font-bold text-[#333] uppercase tracking-[0.15em] px-3 mb-2">Main</div>
        {MAIN_NAV.map(item => <NavItem key={item.path} {...item} />)}

        <div className="h-px bg-[#1a1a1a] my-4" />

        <div className="text-[10px] font-bold text-[#333] uppercase tracking-[0.15em] px-3 mb-2">Tracking</div>
        {TRACKING_NAV.map(item => <NavItem key={item.path} {...item} />)}

        <div className="h-px bg-[#1a1a1a] my-4" />

        <div className="text-[10px] font-bold text-[#333] uppercase tracking-[0.15em] px-3 mb-2">Account</div>
        {ACCOUNT_NAV.map(item => <NavItem key={item.path} {...item} />)}
      </nav>

      {/* Profile */}
      <div className="px-3 pb-5">
        <Link href="/settings" className="flex items-center gap-3 p-3 rounded-[10px] hover:bg-[#161616] transition-all group">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#ea580c] flex items-center justify-center text-xs font-bold text-[#0b0b0c] shadow-md">
            {name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#eee] truncate">{name}</div>
            <div className="text-[11px] text-[#444] capitalize">{profile?.goal || 'recomp'}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#333] group-hover:text-[#555] transition-colors" />
        </Link>
      </div>
    </aside>
  );
}
