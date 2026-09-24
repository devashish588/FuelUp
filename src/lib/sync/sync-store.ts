'use client';
import { create } from 'zustand';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'pending' | 'error';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  setStatus: (status: SyncStatus) => void;
  setPendingCount: (count: number) => void;
  setSynced: (at: string) => void;
  setError: (message: string) => void;
  reset: () => void;
}

/** In-memory only: sync health for the current owner namespace. */
export const useSyncStore = create<SyncState>()((set) => ({
  status: 'synced',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setSynced: (at) => set({ status: 'synced', pendingCount: 0, lastSyncedAt: at, lastError: null }),
  setError: (lastError) => set({ status: 'error', lastError }),
  reset: () => set({ status: 'synced', pendingCount: 0, lastSyncedAt: null, lastError: null }),
}));
