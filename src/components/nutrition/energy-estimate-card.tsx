'use client';
import { useState } from 'react';
import { Flame, Info } from 'lucide-react';
import { Card, SectionLabel } from '@/components/ui/card';
import { useEnergyStore } from '@/stores/energy-store';
import { useProfileStore } from '@/stores/profile-store';
import { formatDate } from '@/lib/utils';

/**
 * Phase 7 — additive Energy Estimate card (Metrics page only, never a home
 * redesign). Estimate language throughout: "estimated maintenance",
 * "based on logged data" — never exact metabolism, no medical claims.
 */
export function EnergyEstimateCard() {
  const profile = useProfileStore((s) => s.profile);
  const energy = useEnergyStore((s) => s.state);
  const applyAdaptiveTarget = useEnergyStore((s) => s.applyAdaptiveTarget);
  const [message, setMessage] = useState<string | null>(null);
  if (!profile || !energy) return null;

  const apply = () => {
    const result = applyAdaptiveTarget();
    setMessage(result.ok ? `Target updated to ${result.target} kcal.` : result.reason);
  };

  const chips = (items: { l: string; v: string; c: string }[]) => (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => (
        <span key={p.l} className="bg-[#1a1a1a] px-3 py-1 rounded-lg text-[11px] font-bold" style={{ color: p.c }}>
          {p.l}: {p.v}
        </span>
      ))}
    </div>
  );

  return (
    <Card className="!p-5">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[rgba(56,189,248,0.1)] flex items-center justify-center shrink-0">
          <Flame className="w-5 h-5 text-[#38bdf8]" />
        </div>
        <div className="flex-1 min-w-0">
          <SectionLabel>Energy Estimate</SectionLabel>
          {energy.mode === 'initial' ? (
            <div>
              <p className="text-[13px] text-white font-semibold mt-1">Using your starting estimate</p>
              <p className="text-[12px] text-[#777] leading-relaxed mt-1">
                {energy.explanation.reasons[0]} FuelUp learns your expenditure from real intake + weigh-ins — nothing is
                guessed.
              </p>
              <div className="mt-3">
                {chips([
                  { l: 'Target', v: `${profile.daily_calorie_target} kcal`, c: '#f59e0b' },
                  { l: 'Data quality', v: `${energy.quality.band} (${energy.quality.score})`, c: '#888' },
                  { l: 'Logged days', v: `${energy.validNutritionDays}`, c: '#888' },
                  { l: 'Weigh-ins', v: `${energy.weightObservations}`, c: '#888' },
                ])}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[13px] text-white font-semibold mt-1">
                Estimated maintenance {energy.maintenance!.minimum.toLocaleString()}–
                {energy.maintenance!.maximum.toLocaleString()} kcal
              </p>
              <p className="text-[12px] text-[#777] leading-relaxed mt-1">
                Based on logged data (≈{energy.maintenance!.estimate.toLocaleString()} kcal from{' '}
                {energy.averageIntakeKcal.toLocaleString()} kcal/day average intake and a{' '}
                {energy.trend.rateKgPerDay === 0
                  ? 'stable'
                  : energy.trend.rateKgPerDay < 0
                    ? 'decreasing'
                    : 'increasing'}{' '}
                weight trend). An estimate, not your exact metabolism.
              </p>
              <div className="mt-3">
                {chips([
                  { l: 'Current target', v: `${profile.daily_calorie_target} kcal`, c: '#f59e0b' },
                  { l: 'Confidence', v: energy.confidence.overall, c: '#38bdf8' },
                  { l: 'Nutrition days', v: `${energy.validNutritionDays}`, c: '#888' },
                  { l: 'Weigh-ins', v: `${energy.weightObservations}`, c: '#888' },
                ])}
              </div>
              <p className="text-[11px] text-[#555] mt-2">
                Food tracking: {energy.confidence.foodTracking} · Weight tracking: {energy.confidence.weightTracking} ·
                Data quality: {energy.quality.band} ({energy.quality.score}/100)
              </p>
              {energy.explanation.reasons.length > 0 && (
                <div className="mt-2 rounded-xl bg-[#161616] border border-[#222] p-3">
                  <p className="text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Why did my target change?
                  </p>
                  {energy.explanation.reasons.map((r, i) => (
                    <p key={i} className="text-[12px] text-[#AAA] leading-relaxed">
                      • {r}
                    </p>
                  ))}
                </div>
              )}
              {energy.lastChange && (
                <p className="text-[11px] text-[#555] mt-2">
                  Last change: {energy.lastChange.previous_target.toLocaleString()} →{' '}
                  {energy.lastChange.new_target.toLocaleString()} kcal on {formatDate(energy.lastChange.date)}
                </p>
              )}
              {energy.updateDue && energy.steppedTarget !== null && (
                <button onClick={apply} className="gradient-btn px-4 py-2.5 mt-3 text-[13px]">
                  Update target → {energy.steppedTarget.toLocaleString()} kcal
                </button>
              )}
              {!energy.updateDue && profile.target_source === 'adaptive' && (
                <p className="text-[11px] text-[#555] mt-2">Target is up to date — next review in about a week.</p>
              )}
              {message && <p className="text-[12px] text-[#f59e0b] mt-2">{message}</p>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
