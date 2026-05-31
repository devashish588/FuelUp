'use client';
import { useState } from 'react';
import { User, Scale, Target, Settings, Download, Trash2, ChevronRight, Flame, Shield } from 'lucide-react';
import { Card, SectionLabel } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/header';
import { useProfileStore } from '@/stores/profile-store';
import { useCalorieStore } from '@/stores/calorie-store';
import { useMetricsStore } from '@/stores/metrics-store';
import { useExerciseStore } from '@/stores/exercise-store';
import { useHabitStore } from '@/stores/habit-store';
import { ACTIVITY_LABELS, GOAL_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ActivityLevel, GoalType } from '@/lib/types';

export default function SettingsPage() {
  const { profile, setProfile, reset } = useProfileStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [formValue, setFormValue] = useState('');
  if (!profile) return null;

  const startEdit = (f: string, v: string) => { setEditing(f); setFormValue(v); };
  const saveEdit = () => {
    if (!editing) return;
    if (['daily_calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g'].includes(editing)) setProfile({ [editing]: parseInt(formValue) || 0 });
    else setProfile({ [editing]: formValue });
    setEditing(null);
  };

  const handleExport = () => {
    const data = { profile, calories: useCalorieStore.getState().foodLogs, metrics: useMetricsStore.getState().metrics, workouts: useExerciseStore.getState().workouts, habits: useHabitStore.getState().habits, habitLogs: useHabitStore.getState().habitLogs };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `fuelup-export-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    if (confirm('Reset all data? This cannot be undone.')) {
      reset(); useCalorieStore.persist.clearStorage(); useMetricsStore.persist.clearStorage(); useExerciseStore.persist.clearStorage(); useHabitStore.persist.clearStorage();
      window.location.href = '/onboarding';
    }
  };

  const profileRows = [
    { label: 'Name', value: profile.full_name, field: 'full_name', icon: User },
    { label: 'Goal', value: GOAL_LABELS[profile.goal], field: 'goal', icon: Target },
    { label: 'Activity', value: ACTIVITY_LABELS[profile.activity_level], field: 'activity_level', icon: Settings },
  ];
  const nutritionRows = [
    { label: 'Daily Calories', value: `${profile.daily_calorie_target} kcal`, field: 'daily_calorie_target', icon: Flame },
    { label: 'Protein', value: `${profile.protein_target_g}g`, field: 'protein_target_g', icon: Scale },
    { label: 'Carbs', value: `${profile.carbs_target_g}g`, field: 'carbs_target_g', icon: Scale },
    { label: 'Fat', value: `${profile.fat_target_g}g`, field: 'fat_target_g', icon: Scale },
  ];

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
          </div>
        </div>

        <div>
          <SectionLabel>Data</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card onClick={handleExport} interactive>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(240,165,0,0.1)] flex items-center justify-center"><Download className="w-4 h-4 text-[#f59e0b]" /></div>
                <div><span className="text-[14px] font-medium text-white block">Export Data</span><span className="text-[11px] text-[#555]">Download as JSON</span></div>
              </div>
            </Card>
            <Card onClick={handleReset} interactive>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[rgba(228,88,38,0.1)] flex items-center justify-center"><Trash2 className="w-4 h-4 text-[#ea580c]" /></div>
                <div><span className="text-[14px] font-medium text-[#ea580c] block">Reset All Data</span><span className="text-[11px] text-[#555]">Delete everything</span></div>
              </div>
            </Card>
          </div>
        </div>

        <p className="text-[11px] text-[#444] text-center flex items-center justify-center gap-1"><Shield className="w-3 h-3" /> FuelUp v1.0 · Data stays on device</p>
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
                <input type={['daily_calorie_target', 'protein_target_g', 'carbs_target_g', 'fat_target_g'].includes(editing) ? 'number' : 'text'} value={formValue} onChange={e => setFormValue(e.target.value)} className="dark-input" autoFocus />
                <button onClick={saveEdit} className="w-full gradient-btn py-3">Save</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
