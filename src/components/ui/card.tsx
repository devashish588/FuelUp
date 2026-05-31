import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function Card({ children, className, onClick, interactive }: CardProps) {
  const isClickable = onClick || interactive;
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn('card p-4', isClickable && 'card-interactive', className)}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[12px] font-bold text-[#444] uppercase tracking-[0.12em]">{children}</h2>
      {action}
    </div>
  );
}

export function StatNumber({ value, unit, size = 'lg', color = '#f5f5f5' }: { value: string | number; unit?: string; size?: 'xl' | 'lg' | 'md'; color?: string }) {
  const sizes = { xl: 'text-[48px] lg:text-[56px]', lg: 'text-[28px]', md: 'text-[20px]' };
  return (
    <div className="flex items-baseline gap-1">
      <span className={cn(sizes[size], 'font-extrabold leading-none tracking-tight')} style={{ color }}>{value}</span>
      {unit && <span className="text-[12px] text-[#444] font-medium">{unit}</span>}
    </div>
  );
}

export function ProgressBar({ value, max, color = '#f59e0b', height = 4 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="bg-[#1a1a1a] rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, message, action, onAction, emoji }: { icon: React.ElementType; message: string; action?: string; onAction?: () => void; emoji?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 fade-in">
      <div className="w-14 h-14 rounded-2xl bg-[#161616] border border-[#1a1a1a] flex items-center justify-center mb-3">
        {emoji ? <span className="text-2xl">{emoji}</span> : <Icon className="w-6 h-6 text-[#333]" />}
      </div>
      <p className="text-[13px] text-[#555] mb-3 text-center max-w-[220px] leading-relaxed">{message}</p>
      {action && onAction && (
        <button onClick={onAction} className="gradient-btn px-5 py-2.5 text-[12px]">{action}</button>
      )}
    </div>
  );
}

export function InsightCard({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex items-center gap-3 bg-[#111] border border-[#1a1a1a] rounded-xl px-4 py-3 hover:border-[#222] transition-colors">
      <span className="text-lg shrink-0">{emoji}</span>
      <p className="text-[13px] text-[#aaa] leading-snug">{text}</p>
    </div>
  );
}
