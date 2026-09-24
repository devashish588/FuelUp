'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile } from '@/lib/types';
import { PERSIST_VERSION, STORAGE_KEYS } from '@/config/app';
import { getProfile, saveProfile } from '@/lib/repositories/profile-repository';
import { writeThrough } from './write-through';

interface ProfileState {
  profile: Profile | null;
  isOnboarded: boolean;
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
  setProfile: (profile: Partial<Profile>) => void;
  completeOnboarding: (profile: Profile) => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      isOnboarded: false,
      ownerId: null,
      ready: false,
      lastError: null,

      load: async (ownerId) => {
        set({ ownerId });
        try {
          const profile = await getProfile(ownerId);
          set({ profile, ready: true, lastError: null });
        } catch (error) {
          set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load your profile.' });
        }
      },

      setProfile: (updates) => {
        const current = get().profile;
        if (!current) return;
        const merged: Profile = { ...current, ...updates, updated_at: new Date().toISOString() };
        set({ profile: merged });
        const ownerId = get().ownerId;
        if (ownerId) {
          writeThrough(saveProfile(ownerId, merged), 'profile', (message) => set({ lastError: message }));
        }
      },

      completeOnboarding: (profile) => {
        set({ profile, isOnboarded: true });
        const ownerId = get().ownerId;
        if (ownerId) {
          writeThrough(saveProfile(ownerId, profile), 'profile', (message) => set({ lastError: message }));
        }
      },

      reset: () => set({ profile: null, isOnboarded: false, lastError: null }),
    }),
    {
      name: STORAGE_KEYS.profile,
      version: PERSIST_VERSION,
      // The profile itself lives in IndexedDB; only the onboarding gate flag
      // stays in localStorage so routing remains synchronous.
      partialize: (s) => ({ isOnboarded: s.isOnboarded }),
    }
  )
);
