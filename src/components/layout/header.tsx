'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps { title: string; showBack?: boolean; rightAction?: React.ReactNode; subtitle?: string; }

export function PageHeader({ title, showBack, rightAction, subtitle }: PageHeaderProps) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 bg-[#0b0b0c]/90 backdrop-blur-xl border-b border-[#1a1a1a]">
      <div className="flex items-center justify-between h-14 px-6">
        <div className="flex items-center gap-3">
          {showBack && (
            <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#161616] transition-colors">
              <ArrowLeft className="w-5 h-5 text-[#666]" />
            </button>
          )}
          <div>
            <h1 className="text-[20px] font-bold text-white">{title}</h1>
            {subtitle && <p className="text-[11px] text-[#444]">{subtitle}</p>}
          </div>
        </div>
        {rightAction && <div>{rightAction}</div>}
      </div>
    </header>
  );
}
