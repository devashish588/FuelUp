'use client';
import { useState, useEffect, useRef } from 'react';
import { Play, Plus, X, Search, Clock, Trash2, Check, Timer, Dumbbell, BarChart3, Calendar, Trophy, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/layout/header';
import { useExerciseStore } from '@/stores/exercise-store';
import { useWorkoutPlannerStore, type DayOfWeek } from '@/stores/workout-planner-store';
import { formatDate, cn } from '@/lib/utils';
import { MUSCLE_GROUPS } from '@/lib/constants';
import type { MuscleGroup } from '@/lib/types';

const DAY_ORDER: DayOfWeek[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_SHORT: Record<DayOfWeek, string> = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' };

export default function ExercisePage() {
  const { workouts, activeWorkout, startWorkout, finishWorkout, cancelWorkout,
    addExerciseToWorkout, addSetToExercise, updateSet, removeSet, removeExerciseFromWorkout,
    exercises } = useExerciseStore();
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<'workout' | DayOfWeek>('workout');
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(90);
  const [tab, setTab] = useState<'workout' | 'plan' | 'prs'>(activeWorkout ? 'workout' : 'plan');

  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (restTimer !== null && restTimer > 0) {
      timerRef.current = setInterval(() => setRestTimer((t) => t !== null ? t - 1 : null), 1000);
      return () => clearInterval(timerRef.current);
    }
    if (restTimer === 0) setRestTimer(null);
  }, [restTimer]);

  const openLibrary = (target: 'workout' | DayOfWeek) => {
    setLibraryTarget(target);
    setShowLibrary(true);
  };

  const handleSelectExercise = (exId: string) => {
    const ex = exercises.find(e => e.id === exId);
    if (!ex) return;
    if (libraryTarget === 'workout') {
      addExerciseToWorkout(exId);
    } else {
      useWorkoutPlannerStore.getState().addExerciseToDay(libraryTarget, ex.name, exId, 3, '8-12');
    }
    setShowLibrary(false);
  };

  return (
    <div>
      <PageHeader title="Workout" rightAction={
        tab === 'workout' && !activeWorkout ? (
          <button onClick={() => { startWorkout('Workout'); setTab('workout'); }} className="flex items-center gap-1.5 gradient-btn px-4 py-2 text-xs">
            <Play className="w-3.5 h-3.5" /> Start
          </button>
        ) : undefined
      } />

      {/* Tab Switcher */}
      <div className="px-4 lg:px-0 pt-3 pb-2">
        <div className="flex gap-1 bg-[rgba(230,213,184,0.03)] rounded-xl p-1 border border-[rgba(230,213,184,0.04)]">
          {[
            { key: 'workout' as const, label: 'Workout', icon: Dumbbell },
            { key: 'plan' as const, label: 'Weekly Plan', icon: Calendar },
            { key: 'prs' as const, label: 'Personal Records', icon: Trophy },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all',
                tab === t.key ? 'bg-[rgba(240,165,0,0.12)] text-[#f59e0b]' : 'text-[#555] hover:text-[#777]')}>
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* WORKOUT TAB */}
      {tab === 'workout' && (
        activeWorkout ? (
          <ActiveWorkoutView workout={activeWorkout}
            onShowLibrary={() => openLibrary('workout')} onFinish={finishWorkout} onCancel={cancelWorkout}
            onAddSet={addSetToExercise} onUpdateSet={updateSet} onRemoveSet={removeSet}
            onRemoveExercise={removeExerciseFromWorkout}
            restTimer={restTimer} onStartRest={() => setRestTimer(restSeconds)}
            restSeconds={restSeconds} onSetRestSeconds={setRestSeconds} />
        ) : <WorkoutHistory workouts={[...workouts].sort((a, b) => b.date.localeCompare(a.date))} onStart={() => { startWorkout('Workout'); }} />
      )}

      {/* WEEKLY PLAN TAB */}
      {tab === 'plan' && <WeeklyPlanView openLibrary={openLibrary} exercises={exercises} />}

      {/* PR TAB */}
      {tab === 'prs' && <PRView exercises={exercises} />}

      {showLibrary && (
        <ExerciseLibrary exercises={exercises} onSelect={handleSelectExercise} onClose={() => setShowLibrary(false)} />
      )}
    </div>
  );
}

/* =================== ACTIVE WORKOUT =================== */
function ActiveWorkoutView({ workout, onShowLibrary, onFinish, onCancel, onAddSet, onUpdateSet, onRemoveSet, onRemoveExercise, restTimer, onStartRest, restSeconds, onSetRestSeconds }: any) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(workout.start_time).getTime();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [workout.start_time]);
  const mins = Math.floor(elapsed / 60), secs = elapsed % 60;

  return (
    <div className="px-4 lg:px-0 py-4 space-y-4">
      <div className="rounded-2xl p-5 text-[#111111] relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}>
        <div className="flex items-center justify-between relative z-10">
          <div>
            <div className="text-3xl font-bold font-mono">{String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}</div>
            <div className="text-xs opacity-70 mt-1">{workout.exercises.length} exercises</div>
          </div>
          {restTimer !== null && (
            <div className="bg-[#111111]/30 backdrop-blur-sm rounded-xl px-5 py-3 text-center text-white">
              <div className="text-2xl font-bold font-mono">{restTimer}s</div>
              <div className="text-[10px] opacity-75">Rest</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#777]">Rest:</span>
        {[30,60,90,120].map(s => (
          <button key={s} onClick={() => onSetRestSeconds(s)}
            className={cn('px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
              restSeconds === s ? 'bg-[rgba(240,165,0,0.15)] text-[#f59e0b] border-[rgba(240,165,0,0.2)]' : 'bg-[rgba(230,213,184,0.03)] text-[#555] border-[rgba(230,213,184,0.04)]')}>
            {s}s
          </button>
        ))}
        <button onClick={onStartRest} className="gradient-btn px-3 py-1.5 text-xs">Go</button>
      </div>

      {workout.exercises.map((we: any) => (
        <div key={we.id} className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-bold text-[#EEE]">{we.exercise?.name || 'Exercise'}</div>
              <div className="text-[10px] text-[#555] capitalize">{we.exercise?.muscle_group}</div>
            </div>
            <button onClick={() => onRemoveExercise(we.id)} className="text-[#444] hover:text-[#ea580c] p-1 transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
          <div className="px-4 pb-3">
            <div className="grid grid-cols-[40px_1fr_1fr_36px] gap-2 text-[9px] text-[#555] font-semibold uppercase mb-2 px-1">
              <span>Set</span><span>Weight</span><span>Reps</span><span></span>
            </div>
            {we.sets.map((set: any, i: number) => (
              <div key={set.id} className="grid grid-cols-[40px_1fr_1fr_36px] gap-2 items-center mb-2">
                <span className="text-xs font-bold text-[#555] text-center bg-[rgba(230,213,184,0.03)] rounded-lg py-1.5">{i + 1}</span>
                <input type="number" value={set.weight_kg || ''} onChange={(e) => onUpdateSet(we.id, set.id, { weight_kg: parseFloat(e.target.value) || 0 })}
                  className="dark-input py-2 text-xs text-center" placeholder="kg" />
                <input type="number" value={set.reps || ''} onChange={(e) => onUpdateSet(we.id, set.id, { reps: parseInt(e.target.value) || 0 })}
                  className="dark-input py-2 text-xs text-center" placeholder="reps" />
                <button onClick={() => onRemoveSet(we.id, set.id)} className="text-[#444] hover:text-[#ea580c] flex justify-center p-1"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => onAddSet(we.id, { set_number: we.sets.length + 1, weight_kg: null, reps: null, duration_seconds: null, distance_km: null, is_warmup: false, is_pr: false, rpe: null })}
              className="w-full py-2 text-xs text-[#f59e0b] font-medium hover:bg-[rgba(240,165,0,0.04)] rounded-lg transition-colors">+ Add Set</button>
          </div>
        </div>
      ))}

      <button onClick={() => onShowLibrary('workout')} className="w-full py-4 border-2 border-dashed border-[rgba(230,213,184,0.06)] rounded-2xl text-sm text-[#555] font-medium hover:border-[rgba(240,165,0,0.3)] hover:text-[#f59e0b] transition-all flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Add Exercise
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onCancel} className="py-3 border border-[rgba(230,213,184,0.06)] rounded-xl text-sm font-medium text-[#777] hover:bg-[rgba(230,213,184,0.04)]">Cancel</button>
        <button onClick={onFinish} className="py-3 gradient-btn text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Finish</button>
      </div>
    </div>
  );
}

/* =================== WORKOUT HISTORY =================== */
function WorkoutHistory({ workouts, onStart }: { workouts: any[]; onStart: () => void }) {
  if (workouts.length === 0) {
    return (
      <div className="px-4 lg:px-0 py-16 text-center">
        <Dumbbell className="w-12 h-12 text-[#444] mx-auto mb-3" />
        <h3 className="text-lg font-bold text-[#AAA] mb-1">No workouts logged</h3>
        <p className="text-sm text-[#555] mb-4">Start a workout to begin tracking!</p>
        <button onClick={onStart} className="gradient-btn px-6 py-3 text-sm">Start Workout</button>
      </div>
    );
  }
  return (
    <div className="px-4 lg:px-0 py-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
      {workouts.map(w => (
        <div key={w.id} className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-[#EEE]">{w.name}</h3>
            <span className="text-[10px] text-[#555] bg-[rgba(230,213,184,0.04)] px-2 py-0.5 rounded-lg">{formatDate(w.date)}</span>
          </div>
          <div className="flex gap-3 text-[10px] text-[#777] mb-2">
            <span>{w.exercises?.length || 0} exercises</span>
            <span>{w.duration_minutes || 0} min</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {w.exercises?.map((we: any) => (
              <span key={we.id} className="bg-[rgba(230,213,184,0.04)] text-[#AAA] text-[10px] px-2 py-0.5 rounded-lg">{we.exercise?.name}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================== WEEKLY PLAN =================== */
function WeeklyPlanView({ openLibrary, exercises }: { openLibrary: (day: DayOfWeek) => void; exercises: any[] }) {
  const { weeklyPlan, removeExerciseFromDay, updateDayLabel } = useWorkoutPlannerStore();
  const [editingDay, setEditingDay] = useState<DayOfWeek | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as DayOfWeek;

  return (
    <div className="px-4 lg:px-0 py-4 space-y-3">
      {DAY_ORDER.map(day => {
        const plan = weeklyPlan.find(p => p.day === day);
        const isToday = day === today;
        return (
          <div key={day} className={cn('glass-card overflow-hidden', isToday && 'border-[rgba(240,165,0,0.15)]')}>
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold',
                  isToday ? 'bg-[rgba(240,165,0,0.15)] text-[#f59e0b]' : 'bg-[rgba(230,213,184,0.04)] text-[#777]')}>
                  {DAY_SHORT[day]}
                </div>
                <div>
                  {editingDay === day ? (
                    <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                      onBlur={() => { updateDayLabel(day, editLabel); setEditingDay(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') { updateDayLabel(day, editLabel); setEditingDay(null); }}}
                      className="bg-transparent border-b border-[#f59e0b] text-sm text-[#EEE] outline-none" autoFocus />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-[#EEE] capitalize">{day}</span>
                      <span className="text-[10px] text-[#555]">· {plan?.label || 'Rest'}</span>
                      <button onClick={() => { setEditingDay(day); setEditLabel(plan?.label || ''); }} className="text-[#444] hover:text-[#f59e0b] p-0.5"><Pencil className="w-3 h-3" /></button>
                    </div>
                  )}
                  <div className="text-[10px] text-[#555]">{plan?.exercises.length || 0} exercises</div>
                </div>
              </div>
              <button onClick={() => openLibrary(day)} className="accent-btn px-2.5 py-1.5 text-[10px] flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {plan && plan.exercises.length > 0 && (
              <div className="px-4 pb-3 space-y-1.5">
                {plan.exercises.map(ex => (
                  <div key={ex.id} className="flex items-center justify-between bg-[rgba(230,213,184,0.02)] rounded-lg px-3 py-2 group">
                    <div>
                      <span className="text-xs font-medium text-[#EEE]">{ex.exercise_name}</span>
                      <span className="text-[10px] text-[#555] ml-2">{ex.sets} × {ex.reps}</span>
                    </div>
                    <button onClick={() => removeExerciseFromDay(day, ex.id)}
                      className="opacity-0 group-hover:opacity-100 text-[#444] hover:text-[#ea580c] p-1 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =================== PERSONAL RECORDS =================== */
function PRView({ exercises }: { exercises: any[] }) {
  const { prs, addPR, removePR } = useWorkoutPlannerStore();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', weight: '', reps: '1' });

  const handleAdd = () => {
    if (!form.name || !form.weight) return;
    addPR(form.name, '', parseFloat(form.weight), parseInt(form.reps) || 1, new Date().toISOString().split('T')[0]);
    setForm({ name: '', weight: '', reps: '1' });
    setShowAdd(false);
  };

  return (
    <div className="px-4 lg:px-0 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#555]">{prs.length} personal records tracked</p>
        <button onClick={() => setShowAdd(true)} className="accent-btn px-3 py-2 text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add PR
        </button>
      </div>

      {prs.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 text-[#444] mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[#AAA] mb-1">No PRs yet</h3>
          <p className="text-sm text-[#555]">Add your heaviest lifts to track progress!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {prs.map(pr => (
            <div key={pr.id} className="glass-card p-4 flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[rgba(240,165,0,0.1)] flex items-center justify-center border border-[rgba(240,165,0,0.15)]">
                  <Trophy className="w-5 h-5 text-[#f59e0b]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#EEE]">{pr.exercise_name}</div>
                  <div className="text-[10px] text-[#555]">{pr.date} · {pr.reps} rep{pr.reps > 1 ? 's' : ''}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-xl font-bold text-[#f59e0b]">{pr.weight_kg}<span className="text-xs font-normal text-[#777]">kg</span></div>
                </div>
                <button onClick={() => removePR(pr.id)} className="opacity-0 group-hover:opacity-100 text-[#444] hover:text-[#ea580c] p-1 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-sm bg-[#111111] border border-[rgba(230,213,184,0.1)] rounded-2xl shadow-2xl p-6 mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#EEE]">New Personal Record</h3>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-full bg-[rgba(230,213,184,0.06)] flex items-center justify-center hover:bg-[rgba(230,213,184,0.1)]">
                <X className="w-4 h-4 text-[#777]" />
              </button>
            </div>
            <div className="space-y-3">
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Exercise name (e.g., Deadlift)" className="dark-input" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="Weight (kg)" className="dark-input" />
                <input type="number" value={form.reps} onChange={e => setForm(f => ({ ...f, reps: e.target.value }))}
                  placeholder="Reps" className="dark-input" />
              </div>
              <button onClick={handleAdd} className="w-full gradient-btn py-3">Save PR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== EXERCISE LIBRARY =================== */
function ExerciseLibrary({ exercises, onSelect, onClose }: { exercises: any[]; onSelect: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState<MuscleGroup | 'all'>('all');
  const filtered = exercises.filter((e: any) => {
    const q = e.name.toLowerCase().includes(query.toLowerCase());
    const g = filterGroup === 'all' || e.muscle_group === filterGroup;
    return q && g;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#111111] border border-[rgba(230,213,184,0.08)] rounded-t-3xl lg:rounded-2xl shadow-2xl slide-up max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[rgba(230,213,184,0.06)]">
          <h3 className="text-lg font-bold text-[#EEE]">Exercise Library</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[rgba(230,213,184,0.06)] flex items-center justify-center hover:bg-[rgba(230,213,184,0.1)]"><X className="w-4 h-4 text-[#777]" /></button>
        </div>
        <div className="p-4 border-b border-[rgba(230,213,184,0.06)]">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search exercises..." autoFocus className="dark-input pl-9" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button onClick={() => setFilterGroup('all')} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors', filterGroup === 'all' ? 'bg-[rgba(240,165,0,0.12)] text-[#f59e0b] border-[rgba(240,165,0,0.2)]' : 'bg-[rgba(230,213,184,0.03)] text-[#555] border-[rgba(230,213,184,0.04)]')}>All</button>
            {MUSCLE_GROUPS.map(g => (
              <button key={g.value} onClick={() => setFilterGroup(g.value)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors', filterGroup === g.value ? 'bg-[rgba(240,165,0,0.12)] text-[#f59e0b] border-[rgba(240,165,0,0.2)]' : 'bg-[rgba(230,213,184,0.03)] text-[#555] border-[rgba(230,213,184,0.04)]')}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {filtered.map((e: any) => (
            <button key={e.id} onClick={() => onSelect(e.id)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[rgba(230,213,184,0.04)] transition-colors text-left">
              <div>
                <div className="text-sm font-medium text-[#EEE]">{e.name}</div>
                <div className="text-[10px] text-[#555] capitalize">{e.muscle_group} · {e.equipment}</div>
              </div>
              <Plus className="w-4 h-4 text-[#f59e0b]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
