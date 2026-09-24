'use client';
import { useEnergyStore } from '@/stores/energy-store';
import { useProfileStore } from '@/stores/profile-store';

/**
 * One-line provenance under any displayed calorie target:
 * "Starting estimate" vs "Current adaptive target · based on N days".
 * Detailed explanation lives on the Metrics page / Settings.
 */
export function TargetBasisLabel() {
  const profile = useProfileStore((s) => s.profile);
  const energy = useEnergyStore((s) => s.state);
  if (!profile) return null;
  if (profile.target_source === 'adaptive' && energy?.mode === 'adaptive') {
    return (
      <span className="text-[11px] text-[#38bdf8]">
        Current adaptive target · based on {energy.validNutritionDays} days of logged data
      </span>
    );
  }
  if (profile.target_source === 'manual') {
    return <span className="text-[11px] text-[#777]">Edited target · adaptive updates paused</span>;
  }
  return <span className="text-[11px] text-[#555]">Starting estimate</span>;
}
