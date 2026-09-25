'use client';
import { useState } from 'react';
import { User, Scale, Target, Settings, Trash2, ChevronRight, Flame, Shield } from 'lucide-react';
import { Card, SectionLabel } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/header';
import { SyncStatusCard } from '@/components/sync/sync-status-card';
import { BackupPanel } from '@/components/data/backup-panel';
import { InstallCard } from '@/components/pwa/install-card';
import { DiagnosticsCard } from '@/components/pwa/diagnostics-card';
import { APP_VERSION } from '@/config/app';
import { useProfileStore } from '@/stores/profile-store';
import { useCalorieStore } from '@/stores/calorie-store';
import { useMetricsStore } from '@/stores/metrics-store';
import { useExerciseStore } from '@/stores/exercise-store';
import { useHabitStore } from '@/stores/habit-store';
import { ACTIVITY_LABELS, GOAL_LABELS } from '@/lib/constants';
import { resolveTargetRate } from '@/lib/calculations/energy';
import { useEnergyStore } from '@/stores/energy-store';
import { cn, formatDate } from '@/lib/utils';
import { clearOwnerLocalData } from '@/lib/migration/reset';
import { useSessionStore } from '@/lib/session/session-store';
import { useWorkoutPlannerStore, DEFAULT_PLAN } from '@/stores/workout-planner-store';
import { useRecipeStore } from '@/stores/recipe-store';
import type { ActivityLevel, GoalType } from '@/lib/types';

export default function SettingsPage() {
  const { profile, setProfile, reset } = useProfileStore();
  const energy = useEnergyStore(s => s.state);
  const [editing, setEditing] = useState<string | null>(null);
  const [formValue, setFormValue] = useState('');
  if (!profile) return null;

  const startEdit = (f: string, v: string) => { setEditing(f); setFormValue(v); };
  const saveEdit = () => {
    if (!editing) return;
    if (['daily_calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g'].includes(editing)) {
      // Phase 7: hand-edited targets pause adaptive updates (source 'manual').
      setProfile({ [editing]: parseInt(formValue) || 0, target_source: 'manual' });
    } else if (editing === 'target_rate_kg_per_week') {
      const trimmed = formValue.trim();
      const rate = trimmed === '' ? null : Math.min(Math.max(parseFloat(trimmed) || 0, 0), 1.5);
      // Phase 10.5: rate edits are recorded in TargetHistory (old → new).
      const previousRate = profile.target_rate_kg_per_week;
      setProfile({ target_rate_kg_per_week: rate });
      if (previousRate !== rate) {
        useEnergyStore.getState().recordRateChange(previousRate, rate);
      }
    } else setProfile({ [editing]: formValue });
    setEditing(null);
  };

  const handleReset = async () => {
    if (confirm('Reset all data? This cannot be undone.')) {
      // Clear the current owner's IndexedDB namespace + legacy payloads first.
      const ownerId = useSessionStore.getState().ownerId;
      if (ownerId) {
        try {
          await clearOwnerLocalData(ownerId);
        } catch {
          /* reset proceeds with in-memory + legacy clearing below */
        }
      }
      reset();
      // Only profile (onboarding flag) + exercise (active draft) still use
      // zustand/persist; the rest now live in IndexedDB (cleared above).
      useProfileStore.persist.clearStorage();
      useExerciseStore.persist.clearStorage();
      useWorkoutPlannerStore.setState({ weeklyPlan: DEFAULT_PLAN, prs: [], ready: false });
      useCalorieStore.setState({ foodLogs: [], favorites: [], ready: false });
      useRecipeStore.setState({ recipes: [], ingredients: [], ready: false });
      useMetricsStore.setState({ metrics: [], ready: false });
      useEnergyStore.setState({ state: null, history: [], ownerId: null, ready: false, lastError: null });
      useHabitStore.setState({ habits: [], habitLogs: [], ready: false });
      useExerciseStore.setState({ workouts: [], activeWorkout: null, ready: false });
      window.location.href = '/onboarding';
    }
  };

  const profileRows = [
    { label: 'Name', value: profile.full_name, field: 'full_name', icon: User },
    // Unknown enum values (legacy/corrupt rows) fall back to raw text, never blank.
    { label: 'Goal', value: GOAL_LABELS[profile.goal as keyof typeof GOAL_LABELS] ?? String(profile.goal), field: 'goal', icon: Target },
    { label: 'Activity', value: ACTIVITY_LABELS[profile.activity_level as keyof typeof ACTIVITY_LABELS] ?? String(profile.activity_level).replace(/_/g, ' '), field: 'activity_level', icon: Settings },
  ];
  const nutritionRows = [
    { label: 'Daily Calories', value: `${profile.daily_calorie_target} kcal`, field: 'daily_calorie_target', icon: Flame },
    { label: 'Protein', value: `${profile.protein_target_g}g`, field: 'protein_target_g', icon: Scale },
    { label: 'Carbs', value: `${profile.carbs_target_g}g`, field: 'carbs_target_g', icon: Scale },
    { label: 'Fat', value: `${profile.fat_target_g}g`, field: 'fat_target_g', icon: Scale },
    // Phase 7: explicit weekly rate (blank = goal default); editing never
    // forces onboarding changes and never implies medical advice.
    {
      label: 'Target Rate',
      value: profile.target_rate_kg_per_week === null
        ? `${resolveTargetRate(profile.goal, null)} kg/wk (goal default)`
        : `${profile.target_rate_kg_per_week} kg/wk`,
      field: 'target_rate_kg_per_week',
      icon: Target,
    },
  ];
  const basisLabel =
    profile.target_source === 'adaptive' && energy?.mode === 'adaptive'
      ? `Adaptive · based on ${energy.validNutritionDays} days of data`
      : profile.target_source === 'manual'
        ? 'Edited by you · adaptive updates paused'
        : 'Starting estimate';

  const SettingRow = ({ label, value, field, icon: Icon }: { label: string; value: string; field: string; icon: React.ElementType }) => (
    <button onClick={() => startEdit(field, String(profile[field as keyof typeof profile] || ''))}
      className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#161616] transition-colors text-left">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex items-center justify-center"><Icon className="w-4 h-4 text-[#555]" /></div>
        <span className="text-[14px] text-[#AAA]">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[14px] text-[#777] max-w-[140px] truncate">{value}</span>
        <ChevronRight className="w-4 h-4 text-[#444]" />
      </div>
    </button>
  );

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Profile avatar */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f59e0b] to-[#ea580c] flex items-center justify-center text-[24px] font-bold text-[#111111]">
            {profile.full_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-white">{profile.full_name}</h2>
            <p className="text-[12px] text-[#555] capitalize">{profile.goal} · {profile.activity_level.replace(/_/g, ' ')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <SectionLabel>Profile</SectionLabel>
            <Card className="!p-0 divide-y divide-[#1a1a1a] overflow-hidden">
              {profileRows.map(r => <SettingRow key={r.field} {...r} />)}
            </Card>
          </div>
          <div>
            <SectionLabel>Nutrition Targets</SectionLabel>
            <Card className="!p-0 divide-y divide-[#1a1a1a] overflow-hidden">
              {nutritionRows.map(r => <SettingRow key={r.field} {...r} />)}
            </Card>
            {/* Phase 7: target provenance + rule-generated explanation. */}
            <Card className="mt-3">
              <div className="text-[11px] font-bold text-[#555] uppercase tracking-wider">Target Basis</div>
              <p className="text-[13px] text-white font-semibold mt-1">{basisLabel}</p>
              {energy?.explanation.reasons.map((r, i) => (
                <p key={i} className="text-[12px] text-[#777] leading-relaxed mt-1">• {r}</p>
              ))}
              {energy?.lastChange && (
                <p className="text-[11px] text-[#555] mt-1">
                  Last change: {energy.lastChange.previous_target.toLocaleString()} →{' '}
                  {energy.lastChange.new_target.toLocaleString()} kcal on {formatDate(energy.lastChange.date)}
                </p>
              )}
            </Card>
          </div>
        </div>

        <div>
          <SectionLabel>App</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InstallCard />
            <DiagnosticsCard />
          </div>
        </div>

        <div>
          <SectionLabel>Data &amp; Privacy</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SyncStatusCard />
            <BackupPanel />
            <Card onClick={handleReset} interactive>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(228,88,38,0.1)] flex items-center justify-center"><Trash2 className="w-4 h-4 text-[#ea580c]" /></div>
                <div><span className="text-[14px] font-medium text-[#ea580c] block">Reset All Data</span><span className="text-[11px] text-[#555]">Delete everything on this device</span></div>
              </div>
            </Card>
          </div>
          <p className="text-[11px] text-[#555] leading-relaxed mt-2">
            Export a copy of your FuelUp data before resetting. Resetting deletes local data on
            this device only — delete your account separately if you want server data removed.
          </p>
        </div>

        <p className="text-[11px] text-[#444] text-center flex items-center justify-center gap-1"><Shield className="w-3 h-3" /> FuelUp v{APP_VERSION} · Data stays on device</p>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm bg-[#111111] border border-[#1a1a1a] rounded-2xl shadow-2xl p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-white mb-4">Edit {[...profileRows, ...nutritionRows].find(r => r.field === editing)?.label}</h3>
            {editing === 'goal' ? (
              <div className="space-y-2">{(Object.entries(GOAL_LABELS) as [GoalType, string][]).map(([v, l]) => (
                <button key={v} onClick={() => { setProfile({ goal: v }); setEditing(null); }}
                  className={cn('w-full py-3 rounded-xl text-[13px] font-medium', profile.goal === v ? 'gradient-btn' : 'bg-[#1a1a1a] text-[#AAA] border border-[#222222]')}>{l}</button>
              ))}</div>
            ) : editing === 'activity_level' ? (
              <div className="space-y-2">{(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([v, l]) => (
                <button key={v} onClick={() => { setProfile({ activity_level: v }); setEditing(null); }}
                  className={cn('w-full py-2.5 rounded-xl text-[12px] font-medium text-left px-4', profile.activity_level === v ? 'gradient-btn' : 'bg-[#1a1a1a] text-[#AAA] border border-[#222222]')}>{l}</button>
              ))}</div>
            ) : (
              <div className="space-y-3">
                <input type={['daily_calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g', 'target_rate_kg_per_week'].includes(editing) ? 'number' : 'text'} value={formValue} onChange={e => setFormValue(e.target.value)} className="dark-input" autoFocus
                  step={editing === 'target_rate_kg_per_week' ? '0.1' : '1'}
                  placeholder={editing === 'target_rate_kg_per_week' ? 'Blank = goal default' : undefined} />
                {editing === 'target_rate_kg_per_week' && (
                  <p className="text-[11px] text-[#555]">Weekly pace in kg (0–1.5). Blank uses the goal default.</p>
                )}
                <button onClick={saveEdit} className="w-full gradient-btn py-3">Save</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
