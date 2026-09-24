'use client';
import { RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useSyncStore, type SyncStatus } from '@/lib/sync/sync-store';
import { requestManualSync } from '@/lib/sync/sync-triggers';
import { useSessionStore } from '@/lib/session/session-store';
import { useState } from 'react';

const STATUS_META: Record<SyncStatus, { dot: string; label: string }> = {
  synced: { dot: 'bg-[#10b981]', label: 'Synced' },
  syncing: { dot: 'bg-[#f59e0b] animate-pulse', label: 'Syncing…' },
  offline: { dot: 'bg-[#64748b]', label: 'Offline — saved locally' },
  pending: { dot: 'bg-[#f59e0b]', label: 'changes pending' },
  error: { dot: 'bg-[#ef4444]', label: 'Sync error — retrying' },
};

/** Small sync health card (Settings → Data). Manual sync included. */
export function SyncStatusCard() {
  const { status, pendingCount, lastSyncedAt, lastError } = useSyncStore();
  const mode = useSessionStore((s) => s.mode);
  const [busy, setBusy] = useState(false);

  if (mode !== 'user') return null;

  const meta = STATUS_META[status];
  const subtitle =
    status === 'pending'
      ? `${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} pending`
      : status === 'synced' && lastSyncedAt
        ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
        : status === 'error' && lastError
          ? lastError
          : meta.label;

  const onSync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await requestManualSync();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <span className="text-[14px] font-medium text-white block">
            {status === 'pending' || status === 'synced' ? `Sync · ${status === 'synced' ? 'Synced' : `${pendingCount} pending`}` : `Sync · ${meta.label}`}
          </span>
          <span className="text-[11px] text-[#555] truncate block">{subtitle}</span>
        </div>
        <button
          onClick={onSync}
          disabled={busy || status === 'syncing'}
          className="flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl bg-[#1a1a1a] border border-[#222222] text-[12px] font-medium text-[#AAA] disabled:opacity-50"
          aria-label="Sync now"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          Sync now
        </button>
      </div>
    </Card>
  );
}
