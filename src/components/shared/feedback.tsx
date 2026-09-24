'use client';
import { cn } from '@/lib/utils';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-[#9ca3af]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.2)] border-t-[#f59e0b]" />
        {message}
      </div>
    </div>
  );
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-[#fca5a5]', className)} role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-[44px] rounded-lg border border-[rgba(239,68,68,0.4)] px-4 text-[#fecaca]"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
