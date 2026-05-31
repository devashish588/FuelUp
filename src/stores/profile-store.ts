'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile } from '@/lib/types';

interface ProfileState {
  profile: Profile | null;
  isOnboarded: boolean;
  setProfile: (profile: Partial<Profile>) => void;
  completeOnboarding: (profile: Profile) => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      isOnboarded: false,
      setProfile: (updates) =>
        set((state) => ({
          profile: state.profile
            ? { ...state.profile, ...updates, updated_at: new Date().toISOString() }
            : null,
        })),
      completeOnboarding: (profile) =>
        set({ profile, isOnboarded: true }),
      reset: () => set({ profile: null, isOnboarded: false }),
    }),
    { name: 'fuelup-profile' }
  )
);
