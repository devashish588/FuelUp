'use client';
import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { APP_VERSION } from '@/config/app';
import { LOCAL_DB_VERSION } from '@/lib/db/local-schema';
import { collectLiveDiagnostics, type DeviceDiagnostics } from '@/lib/pwa/diagnostics';
import { useIsInstalledPWA } from '@/lib/pwa/use-is-installed-pwa';
import { useSyncStore } from '@/lib/sync/sync-store';
import { useSessionStore } from '@/lib/session/session-store';
import { getBackupMeta } from '@/lib/backup/backup';
import { getSyncCursor } from '@/lib/sync/pull-apply';
import { countPendingEvents } from '@/lib/sync/outbox';

/**
 * Settings → App → Diagnostics. Read-only capability snapshot for real-device
 * QA (browser, online, standalone, SW, IndexedDB, sync, camera, versions).
 * No personal data, no secrets, no actions — purely observational.
 */
export function DiagnosticsCard() {
  const installed = useIsInstalledPWA();
  const syncStatus = useSyncStore((s) => s.status);
  const pending = useSyncStore((s) => s.pendingCount);
  const lastSynced = useSyncStore((s) => s.lastSyncedAt);
  const [diag, setDiag] = useState<DeviceDiagnostics>(() => collectLiveDiagnostics());
  const [outboxPending, setOutboxPending] = useState<number | null>(null);
  const [cursorSet, setCursorSet] = useState<boolean | null>(null);
  const [backupMeta] = useState(() => getBackupMeta());

  useEffect(() => {
    const refresh = () => setDiag(collectLiveDiagnostics());
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  // Phase 10.5: local troubleshooting facts (counts and presence only —
  // never row contents, never secrets, never cursor values).
  const ownerId = useSessionStore((s) => s.ownerId);
  useEffect(() => {
    let cancelled = false;
    if (!ownerId) return;
    void (async () => {
      try {
        const [count, cursor] = await Promise.all([
          countPendingEvents(ownerId),
          getSyncCursor(ownerId),
        ]);
        if (!cancelled) {
          setOutboxPending(count);
          setCursorSet(cursor !== null);
        }
      } catch {
        if (!cancelled) {
          setOutboxPending(null);
          setCursorSet(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncStatus, ownerId]);

  const rows: [string, string][] = [
    ['App version', `FuelUp ${APP_VERSION}`],
    ['Platform', `${diag.platform}${diag.mobile ? ' (mobile)' : ''}${installed ? ' · installed' : ''}`],
    ['Network', diag.online ? 'Online' : 'Offline'],
    ['Display mode', diag.standalone ? 'Standalone' : 'Browser tab'],
    ['Service worker', diag.serviceWorker === 'controlled' ? 'Active + controlling' : diag.serviceWorker === 'registered' ? 'Registered' : 'Unsupported'],
    ['IndexedDB', diag.indexedDb ? `Available (v${LOCAL_DB_VERSION})` : 'UNAVAILABLE'],
    ['Camera API', diag.camera ? 'Available' : 'Unavailable'],
    ['Sync', `${syncStatus}${pending > 0 ? ` · ${pending} pending` : ''}${lastSynced ? ` · ${lastSynced}` : ''}`],
    ['Outbox', outboxPending === null ? '—' : outboxPending === 0 ? 'Empty' : `${outboxPending} pending`],
    ['Sync cursor', cursorSet === null ? '—' : cursorSet ? 'Set' : 'Not set'],
    ['Backup', 'Available (local file)'],
    ['Last export', backupMeta.lastExportAt ?? 'Never'],
    ['Last import', backupMeta.lastImportAt ?? 'Never'],
  ];

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-[rgba(240,165,0,0.1)] flex items-center justify-center"><Activity className="w-4 h-4 text-[#f59e0b]" /></div>
        <div><span className="text-[14px] font-medium text-white block">Diagnostics</span><span className="text-[11px] text-[#555]">Device capabilities for QA</span></div>
      </div>
      <dl className="divide-y divide-[#1a1a1a]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-2">
            <dt className="text-[12px] text-[#777]">{label}</dt>
            <dd className="text-[12px] text-[#EEE] font-medium text-right max-w-[60%] truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
