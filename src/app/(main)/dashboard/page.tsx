'use client';
import { useRouter } from 'next/navigation';
import { Plus, Flame, Dumbbell, Scale, UtensilsCrossed, Target, Zap, ChevronRight, History, Droplets } from 'lucide-react';
import { Card, SectionLabel, StatNumber, ProgressBar, EmptyState, InsightCard } from '@/components/ui/card';
import { WeightTrend } from '@/components/charts/weight-trend';
import { TargetBasisLabel } from '@/components/nutrition/target-basis-label';
import { useProfileStore } from '@/stores/profile-store';
import { useEnergyStore } from '@/stores/energy-store';
import { useCalorieStore, repeatRequestFromLog } from '@/stores/calorie-store';
import { useMetricsStore } from '@/stores/metrics-store';
import { useHabitStore, findWaterHabit } from '@/stores/habit-store';
import { useExerciseStore } from '@/stores/exercise-store';
import { toDateString, formatDate, cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import { subDays } from 'date-fns';

export default function DashboardPage() {
  const router = useRouter();
  const [fabOpen, setFabOpen] = useState(false);
  const profile = useProfileStore(s => s.profile);
  const getDailySummary = useCalorieStore(s => s.getDailySummary);
  const foodLogs = useCalorieStore(s => s.foodLogs);
  const metrics = useMetricsStore(s => s.metrics);
  const getLatest = useMetricsStore(s => s.getLatestMetric);
  const habits = useHabitStore(s => s.habits);
  const habitLogs = useHabitStore(s => s.habitLogs);
  const getLogForHabit = useHabitStore(s => s.getLogForHabit);
  const workouts = useExerciseStore(s => s.workouts);

  const today = toDateString();

  // Phase 10.5 quick actions (all offline-first: Zustand → repo → outbox).
  // Repeat Last only PREFILLS the food modal — review before Add is mandatory.
  const repeatLastMeal = () => {
    const last = [...foodLogs].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1
    )[0];
    if (last) {
      useCalorieStore.getState().requestRepeat(repeatRequestFromLog(last));
    }
    router.push('/calories');
  };
  const logWaterGlass = () => {
    const water = findWaterHabit(habits);
    if (!water) {
      router.push('/habits');
      return;
    }
    const current = getLogForHabit(water.id, today)?.value ?? 0;
    useHabitStore.getState().logHabit(water.id, today, current + 1);
  };
  const sum = getDailySummary(today);
  const target = profile?.daily_calorie_target || 2000;
  const remaining = Math.max(target - Math.round(sum.calories), 0);
  const pct = Math.min((sum.calories / target) * 100, 100);
  const weightData = [...metrics].sort((a, b) => a.date.localeCompare(b.date)).slice(-14).map(m => ({ date: m.date, weight: m.weight_kg }));
  // Phase 7: smoothed trend overlay (same 7-day rolling median as the engine).
  const energyState = useEnergyStore(s => s.state);
  const trendByDate = new Map((energyState?.trend.points ?? []).map(p => [p.date, p.weight_kg]));
  const trendData = weightData.some(d => trendByDate.has(d.date))
    ? weightData.filter(d => trendByDate.has(d.date)).map(d => ({ date: d.date, value: trendByDate.get(d.date) as number }))
    : undefined;
  const latestWeight = getLatest();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const activeHabits = habits.filter(h => h.is_active);
  const completedHabits = activeHabits.filter(h => getLogForHabit(h.id, today)?.completed).length;
  const todayWorkouts = workouts.filter(w => w.date === today);

  // Streak
  const streak = useMemo(() => {
    let s = 0; const d = new Date();
    for (let i = 0; i < 365; i++) {
      d.setDate(d.getDate() - (i === 0 ? 0 : 1));
      const ds = toDateString(d);
      if (activeHabits.length > 0 && activeHabits.every(h => habitLogs.find(l => l.habit_id === h.id && l.date === ds)?.completed)) s++;
      else if (i > 0) break;
    }
    return s;
  }, [activeHabits, habitLogs]);

  // Weekly stats
  const week = useMemo(() => {
    let cal = 0, wo = 0, days = 0;
    for (let i = 0; i < 7; i++) {
      const d = toDateString(subDays(new Date(), i));
      const s = getDailySummary(d);
      if (s.calories > 0) { cal += s.calories; days++; }
      wo += workouts.filter(w => w.date === d).length;
    }
    return { avg: days > 0 ? Math.round(cal / days) : 0, workouts: wo, days };
  }, [getDailySummary, workouts]);

  // Smart insights
  const insights = useMemo(() => {
    const list: { emoji: string; text: string }[] = [];
    const pp = (sum.protein_g / (profile?.protein_target_g || 150)) * 100;
    if (sum.calories > 0 && remaining > 0 && remaining < 500) list.push({ emoji: '🔥', text: `Only ${remaining} kcal left today — almost there!` });
    else if (sum.calories === 0) list.push({ emoji: '🍽️', text: 'No meals logged yet. Start your day right!' });
    if (pp < 50 && sum.calories > 0) list.push({ emoji: '💪', text: `Protein at ${Math.round(pp)}% — consider a protein-rich meal.` });
    if (pp >= 100) list.push({ emoji: '🎯', text: 'Protein goal smashed! Great macros today.' });
    if (streak >= 3) list.push({ emoji: '🔥', text: `${streak}-day streak going strong! Don't break the chain.` });
    if (completedHabits === activeHabits.length && activeHabits.length > 0) list.push({ emoji: '⭐', text: 'Perfect day — every habit completed!' });
    if (week.workouts >= 3) list.push({ emoji: '🏋️', text: `${week.workouts} workouts this week — solid consistency.` });
    if (list.length === 0) list.push({ emoji: '👋', text: 'Welcome back! Log your first meal to get personalized insights.' });
    return list.slice(0, 2);
  }, [sum, remaining, profile, streak, completedHabits, activeHabits, week]);

  // Recent activity
  const recent = useMemo(() => {
    const items: { emoji: string; text: string; time: string }[] = [];
    foodLogs.filter(l => l.date === today).slice(-3).forEach(l => items.push({ emoji: '🍽️', text: `${l.food_item?.name || 'Food'} — ${Math.round(l.calories)} kcal`, time: 'Today' }));
    todayWorkouts.forEach(w => items.push({ emoji: '💪', text: w.name || 'Workout completed', time: 'Today' }));
    return items.slice(0, 5);
  }, [foodLogs, todayWorkouts, today]);

  const macros = [
    { label: 'Protein', val: Math.round(sum.protein_g), tgt: profile?.protein_target_g || 150, color: '#f59e0b' },
    { label: 'Carbs', val: Math.round(sum.carbs_g), tgt: profile?.carbs_target_g || 200, color: '#ea580c' },
    { label: 'Fat', val: Math.round(sum.fat_g), tgt: profile?.fat_target_g || 65, color: '#777' },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto stagger">
      {/* Row 1: Greeting + Streak */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-white tracking-tight leading-tight">{greeting}, {firstName} 👋</h1>
          <p className="text-[13px] text-[#555] mt-1">{formatDate(today)} · Let&apos;s hit your goals</p>
        </div>
        <div className="flex items-center gap-3">
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.12)] rounded-xl px-3.5 py-2 pulse-glow">
              <Flame className="w-4 h-4 text-[#f59e0b]" />
              <span className="text-[18px] font-extrabold text-[#f59e0b]">{streak}</span>
              <span className="text-[11px] text-[#666] font-medium ml-0.5">days</span>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Smart Insights */}
      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => <InsightCard key={i} emoji={ins.emoji} text={ins.text} />)}
        </div>
      )}

      {/* Row 3: Overview Cards — Calories Hero + Activity + Output */}
      <div className="grid grid-cols-12 gap-4">
        {/* Calories Hero (8 cols) */}
        <Card className="col-span-12 lg:col-span-8 !p-6 card-hero" interactive onClick={() => router.push('/calories')}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg bg-[rgba(245,158,11,0.12)] flex items-center justify-center">
              <Flame className="w-4 h-4 text-[#f59e0b]" />
            </div>
            <span className="text-[11px] font-bold text-[#555] uppercase tracking-[0.12em]">Calories Today</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[48px] lg:text-[56px] font-extrabold text-white leading-none tracking-tight">{Math.round(sum.calories)}</div>
              <p className="text-[14px] text-[#666] mt-2">
                of {target} kcal · <span className="text-[#f59e0b] font-semibold">{remaining} remaining</span>
              </p>
              <div className="mt-1"><TargetBasisLabel /></div>
              <div className="mt-5 max-w-[300px]">
                <ProgressBar value={sum.calories} max={target} height={6} color={pct > 100 ? '#ea580c' : '#f59e0b'} />
              </div>
            </div>
            <div className="relative w-24 h-24 shrink-0 hidden sm:block">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1a1a1a" strokeWidth="3" />
                <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray={`${pct}, 100`} strokeLinecap="round" className="transition-all duration-1000" style={{ filter: 'drop-shadow(0 0 6px rgba(245,158,11,0.3))' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[18px] font-extrabold text-[#f59e0b]">{Math.round(pct)}%</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Side stats (4 cols) — stacked */}
        <div className="col-span-12 lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-4">
          <Card interactive onClick={() => router.push('/exercise')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(234,88,12,0.1)] flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-[#ea580c]" />
              </div>
              <div>
                <div className="text-[24px] font-extrabold text-white">{todayWorkouts.length}</div>
                <div className="text-[11px] text-[#555]">Workouts</div>
              </div>
            </div>
          </Card>
          <Card interactive onClick={() => router.push('/habits')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(245,158,11,0.1)] flex items-center justify-center">
                <Target className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <div className="flex-1">
                <div className="text-[24px] font-extrabold text-white">{completedHabits}<span className="text-[14px] text-[#444]">/{activeHabits.length}</span></div>
                <div className="text-[11px] text-[#555]">Habits done</div>
              </div>
            </div>
            {activeHabits.length > 0 && <div className="mt-3"><ProgressBar value={completedHabits} max={activeHabits.length} height={3} /></div>}
          </Card>
          <Card className="lg:block hidden" interactive onClick={() => router.push('/metrics')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(119,119,119,0.1)] flex items-center justify-center">
                <Scale className="w-5 h-5 text-[#888]" />
              </div>
              <div>
                <div className="text-[24px] font-extrabold text-white">{latestWeight?.weight_kg || '—'}<span className="text-[12px] text-[#555] ml-0.5 font-normal">kg</span></div>
                <div className="text-[11px] text-[#555]">Weight</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Row 4: Macros */}
      <div>
        <SectionLabel>Macros</SectionLabel>
        <div className="grid grid-cols-3 gap-4">
          {macros.map(m => (
            <Card key={m.label}>
              <span className="text-[11px] font-bold text-[#444] uppercase tracking-wider">{m.label}</span>
              <div className="mt-2 mb-3"><StatNumber value={m.val} unit={`/ ${m.tgt}g`} size="lg" color={m.color} /></div>
              <ProgressBar value={m.val} max={m.tgt} color={m.color} />
            </Card>
          ))}
        </div>
      </div>

      {/* Row 5: Habits + Weight Chart */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-7 !p-0">
          <div className="px-4 pt-4 pb-2">
            <SectionLabel action={<button onClick={() => router.push('/habits')} className="text-[11px] text-[#f59e0b] font-semibold flex items-center gap-0.5 hover:opacity-80 transition-opacity">View all <ChevronRight className="w-3 h-3" /></button>}>
              Today&apos;s Habits
            </SectionLabel>
          </div>
          <div className="px-4 pb-4 space-y-3">
            {activeHabits.slice(0, 5).map(h => {
              const log = getLogForHabit(h.id, today);
              const v = log?.value || 0;
              const done = v >= h.target_value;
              return (
                <div key={h.id} className="flex items-center gap-3 group hover:bg-[#161616] rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all',
                    done ? 'bg-[rgba(245,158,11,0.12)]' : 'bg-[#1a1a1a] group-hover:bg-[#222]')}>
                    {done ? <Zap className="w-3.5 h-3.5 text-[#f59e0b]" /> : <Target className="w-3.5 h-3.5 text-[#444]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1.5">
                      <span className={cn('text-[13px] font-medium', done ? 'text-[#f59e0b]' : 'text-[#aaa]')}>{h.name}</span>
                      <span className="text-[11px] text-[#444] font-mono">{v}/{h.target_value}</span>
                    </div>
                    <ProgressBar value={v} max={h.target_value} color={done ? '#f59e0b' : '#333'} height={3} />
                  </div>
                </div>
              );
            })}
            {activeHabits.length === 0 && <EmptyState icon={Target} emoji="🎯" message="Build habits that stick. Start with one daily goal." action="Add Habit" onAction={() => router.push('/habits')} />}
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-5">
          <SectionLabel action={<button onClick={() => router.push('/metrics')} className="text-[11px] text-[#f59e0b] font-semibold flex items-center gap-0.5 hover:opacity-80 transition-opacity">Details <ChevronRight className="w-3 h-3" /></button>}>
            Weight Trend
          </SectionLabel>
          <WeightTrend data={weightData} trend={trendData} />
        </Card>
      </div>

      {/* Row 6: Weekly Summary + Recent Activity */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-5">
          <SectionLabel>This Week</SectionLabel>
          <div className="grid grid-cols-3 gap-3 mt-1">
            {[
              { label: 'Avg Cal', value: week.avg, icon: '🔥' },
              { label: 'Workouts', value: week.workouts, icon: '💪' },
              { label: 'Active', value: `${week.days}/7`, icon: '📅' },
            ].map(s => (
              <div key={s.label} className="text-center bg-[#0e0e0f] border border-[#1a1a1a] rounded-xl py-3 px-2">
                <span className="text-base">{s.icon}</span>
                <div className="text-[20px] font-extrabold text-white mt-1.5">{s.value}</div>
                <div className="text-[10px] text-[#444] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <SectionLabel>Recent Activity</SectionLabel>
          {recent.length > 0 ? (
            <div className="space-y-2.5 mt-1">
              {recent.map((a, i) => (
                <div key={i} className="flex items-center gap-3 hover:bg-[#161616] rounded-lg px-2 py-2 -mx-2 transition-colors group">
                  <div className="w-8 h-8 rounded-lg bg-[#161616] flex items-center justify-center text-sm group-hover:bg-[#1a1a1a]">{a.emoji}</div>
                  <p className="text-[13px] text-[#aaa] flex-1">{a.text}</p>
                  <span className="text-[10px] text-[#333] bg-[#161616] px-2 py-0.5 rounded-md">{a.time}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-4 px-2">
              <div className="w-10 h-10 rounded-xl bg-[#161616] flex items-center justify-center text-lg">📝</div>
              <div>
                <p className="text-[13px] text-[#777]">No activity yet today</p>
                <p className="text-[12px] text-[#444]">Log a meal or workout to see it here</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* FAB */}
      <div className="fixed bottom-24 lg:bottom-8 right-6 z-40">
        {fabOpen && (
          <div className="absolute bottom-16 right-0 flex flex-col gap-2 items-end fade-in">
            {[
              { label: 'Log Food', icon: UtensilsCrossed, onTap: () => router.push('/calories') },
              { label: 'Repeat Last', icon: History, onTap: () => repeatLastMeal() },
              { label: 'Log Water', icon: Droplets, onTap: () => logWaterGlass() },
              { label: 'Start Workout', icon: Dumbbell, onTap: () => router.push('/exercise') },
              { label: 'Log Weight', icon: Scale, onTap: () => router.push('/metrics') },
            ].map(({ label, icon: Icon, onTap }) => (
              <button key={label} onClick={() => { onTap(); setFabOpen(false); }}
                className="flex items-center gap-2.5 bg-[#161616] border border-[#2a2a2a] rounded-xl pl-4 pr-3 py-2.5 hover:bg-[#1a1a1a] hover:border-[#333] transition-all shadow-xl active:scale-95">
                <span className="text-[12px] font-semibold text-[#eee]">{label}</span>
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#f59e0b] to-[#ea580c] flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-[#0b0b0c]" />
                </div>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setFabOpen(!fabOpen)}
          className={cn('w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90',
            fabOpen ? 'bg-[#222] rotate-45' : 'bg-gradient-to-br from-[#f59e0b] to-[#ea580c] hover:shadow-[0_8px_32px_rgba(245,158,11,0.3)]')}
          style={{ boxShadow: fabOpen ? 'none' : '0 4px 24px rgba(245,158,11,0.25)' }}>
          <Plus className={cn('w-6 h-6 transition-transform', fabOpen ? 'text-[#888]' : 'text-[#0b0b0c]')} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
