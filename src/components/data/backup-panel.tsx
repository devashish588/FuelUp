'use client';
import { useRef, useState } from 'react';
import { Download, Upload, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useSessionStore } from '@/lib/session/session-store';
import { useProfileStore } from '@/stores/profile-store';
import { useCalorieStore } from '@/stores/calorie-store';
import { useRecipeStore } from '@/stores/recipe-store';
import { useMetricsStore } from '@/stores/metrics-store';
import { useExerciseStore } from '@/stores/exercise-store';
import { useHabitStore } from '@/stores/habit-store';
import { useEnergyStore } from '@/stores/energy-store';
import {
  BACKUP_MAX_BYTES,
  backupFileName,
  buildBackupSnapshot,
  getBackupMeta,
  parseBackupFile,
  previewBackup,
  restoreBackup,
  setBackupMeta,
  type BackupPreview,
} from '@/lib/backup/backup';
import type { BackupEnvelope } from '@/lib/validation/backup';
import { formatDate } from '@/lib/utils';

type Phase =
  | { name: 'idle' }
  | { name: 'reading' }
  | { name: 'preview'; envelope: BackupEnvelope; summary: BackupPreview }
  | { name: 'restoring'; stage: string; done: number; total: number }
  | { name: 'done'; imported: number; skipped: number }
  | { name: 'error'; message: string };

/**
 * Settings → Data & Privacy → backup. Export downloads a versioned JSON
 * file locally (never uploaded anywhere); import validates → previews →
 * confirms → replaces local data transactionally. Images/AI state are not
 * part of backups; secrets never are.
 */
export function BackupPanel() {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(() => getBackupMeta().lastExportAt);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const ownerId = useSessionStore.getState().ownerId;

  const download = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (busy || !ownerId) return;
    setBusy(true);
    try {
      const envelope = await buildBackupSnapshot(ownerId);
      download(backupFileName(envelope.exportedAt), JSON.stringify(envelope));
      const at = new Date().toISOString();
      setBackupMeta({ lastExportAt: at });
      setLastExport(at);
    } finally {
      setBusy(false);
    }
  };

  const reloadStores = async () => {
    const id = useSessionStore.getState().ownerId;
    if (!id) return;
    await Promise.all([
      useProfileStore.getState().load(id),
      useCalorieStore.getState().load(id),
      useRecipeStore.getState().load(id),
      useMetricsStore.getState().load(id),
      useExerciseStore.getState().load(id),
      useHabitStore.getState().load(id),
      useEnergyStore.getState().load(id),
    ]);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setPhase({ name: 'reading' });
    try {
      if (file.size > BACKUP_MAX_BYTES) {
        setPhase({ name: 'error', message: 'That backup file is too large (over 10 MB).' });
        return;
      }
      const text = await file.text();
      const parsed = parseBackupFile(text);
      if (!parsed.ok) {
        setPhase({ name: 'error', message: parsed.error });
        return;
      }
      setPhase({ name: 'preview', envelope: parsed.envelope, summary: previewBackup(parsed.envelope) });
    } catch {
      setPhase({ name: 'error', message: 'That file could not be read.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (envelope: BackupEnvelope) => {
    if (busy || !ownerId) return;
    setBusy(true);
    setPhase({ name: 'restoring', stage: 'Validating', done: 0, total: 1 });
    try {
      const { counts, skipped } = await restoreBackup(ownerId, envelope, undefined, (stage, done, total) =>
        setPhase({ name: 'restoring', stage, done, total })
      );
      await reloadStores();
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      setBackupMeta({ lastImportAt: new Date().toISOString(), lastImportCounts: counts });
      setPhase({ name: 'done', imported: total, skipped });
    } catch (error) {
      // Transactional restore: validation runs first and the write is one
      // Dexie transaction, so failure leaves current data intact.
      setPhase({
        name: 'error',
        message: error instanceof Error ? error.message : 'Restore failed. Your current data is unchanged.',
      });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setPhase({ name: 'idle' });

  return (
    <Card>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-[rgba(240,165,0,0.1)] flex items-center justify-center">
          <ShieldCheck className="w-4 h-4 text-[#f59e0b]" />
        </div>
        <div>
          <span className="text-[14px] font-medium text-white block">Backup &amp; Restore</span>
          <span className="text-[11px] text-[#555]">
            {lastExport ? `Last export ${formatDate(lastExport)}` : 'Versioned local backup'}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-[#555] leading-relaxed mb-3">
        Export a copy of your FuelUp data before resetting. Your backup stays on your device —
        it is never uploaded. Restore replaces local data; pending unsynced changes are discarded.
      </p>

      {phase.name === 'idle' || phase.name === 'reading' || phase.name === 'error' ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleExport} disabled={busy} className="py-3 min-h-[48px] rounded-xl bg-[#1a1a1a] text-[#AAA] border border-[#222] flex items-center justify-center gap-2 text-[13px] font-bold disabled:opacity-50">
            <Download className="w-4 h-4" /> {phase.name === 'reading' ? 'Reading…' : 'Export'}
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="py-3 min-h-[48px] rounded-xl bg-[#1a1a1a] text-[#AAA] border border-[#222] flex items-center justify-center gap-2 text-[13px] font-bold disabled:opacity-50">
            <Upload className="w-4 h-4" /> Import
          </button>
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Choose a FuelUp backup file"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div aria-live="polite">
        {phase.name === 'error' && (
          <div role="alert" className="rounded-xl bg-[#1a1208] border border-[#3a2a10] p-3 mt-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#ea580c] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12px] text-[#f59e0b]">{phase.message}</p>
              <button onClick={reset} className="mt-2 text-[12px] font-bold text-white underline">Back</button>
            </div>
          </div>
        )}

        {phase.name === 'preview' && (
          <div className="rounded-xl bg-[#161616] border border-[#222] p-3 mt-3">
            <p className="text-[13px] font-bold text-white">FuelUp Backup</p>
            <p className="text-[11px] text-[#555] mt-0.5">
              Exported {formatDate(phase.summary.exportedAt)} · version {phase.summary.version}
            </p>
            <p className="text-[11px] text-[#555]">Contains:</p>
            <ul className="mt-1 space-y-0.5">
              {phase.summary.counts.map((c) => (
                <li key={c.label} className="text-[12px] text-[#AAA]">
                  {c.count.toLocaleString()} {c.label}
                </li>
              ))}
              {phase.summary.counts.length === 0 && (
                <li className="text-[12px] text-[#AAA]">Empty backup (no rows).</li>
              )}
            </ul>
            <p className="text-[11px] text-[#ea580c] mt-2">
              Restore replaces all local data for this device. This cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={reset} disabled={busy} className="py-3 min-h-[48px] rounded-xl bg-[#1a1a1a] text-[#AAA] border border-[#222] text-[13px] font-bold disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => handleRestore(phase.envelope)} disabled={busy} className="gradient-btn py-3 min-h-[48px] text-[13px]">
                Restore
              </button>
            </div>
          </div>
        )}

        {phase.name === 'restoring' && (
          <div className="rounded-xl bg-[#161616] border border-[#222] p-3 mt-3">
            <p className="text-[13px] font-bold text-white">Restoring FuelUp…</p>
            <p role="status" className="text-[12px] text-[#777] mt-1">
              {phase.stage} ({phase.done}/{phase.total})
            </p>
            <div className="h-1.5 rounded-full bg-[#222] mt-2 overflow-hidden" aria-hidden>
              <div
                className="h-full bg-gradient-to-r from-[#f59e0b] to-[#ea580c] transition-all"
                style={{ width: `${phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {phase.name === 'done' && (
          <div className="rounded-xl bg-[#0e1a12] border border-[#1d3a26] p-3 mt-3">
            <p className="text-[13px] font-bold text-white">Restore complete.</p>
            <p className="text-[12px] text-[#777] mt-1">{phase.imported.toLocaleString()} records restored. Your dashboard, history, and analytics are rebuilt from this data.</p>
            {phase.skipped > 0 && (
              <p className="text-[12px] text-[#f59e0b] mt-1">{phase.skipped} records skipped — their ids already belong to another local user.</p>
            )}
            <button onClick={reset} className="mt-2 text-[12px] font-bold text-white underline">Done</button>
          </div>
        )}
      </div>
    </Card>
  );
}
