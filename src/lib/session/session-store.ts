'use client';
import { create } from 'zustand';

interface SessionState {
  ownerId: string | null;
  mode: 'user' | 'device' | null;
  fuelUpUserId: string | null;
  clerkUserId: string | null;
  ready: boolean;
  error: string | null;
  setSession: (s: {
    ownerId: string;
    mode: 'user' | 'device';
    fuelUpUserId: string | null;
    clerkUserId: string | null;
  }) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

/** In-memory only (never persisted): who owns the local data right now. */
export const useSessionStore = create<SessionState>()((set) => ({
  ownerId: null,
  mode: null,
  fuelUpUserId: null,
  clerkUserId: null,
  ready: false,
  error: null,
  setSession: (s) => set({ ...s, ready: true, error: null }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ ownerId: null, mode: null, fuelUpUserId: null, clerkUserId: null, ready: false, error: null }),
}));
