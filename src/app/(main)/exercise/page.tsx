'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Play, Plus, X, Search, Trash2, Check, Dumbbell, Calendar, Trophy, Pencil, BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/layout/header';
import { EmptyState } from '@/components/ui/card';
import {
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  EQUIPMENT_TAGS,
  MOVEMENT_LABELS,
  filterExercises,
  getDetailSections,
  hasWikiContent,
  resolveEquipmentTags,
} from '@/lib/exercise/wiki';
import type { EquipmentTag } from '@/lib/types';
import {
  getProgressionGuidance,
  resolveSuggestionTarget,
  type SuggestedSet,
} from '@/lib/exercise/progression';
import { useExerciseStore } from '@/stores/exercise-store';
import { useWorkoutPlannerStore, type DayOfWeek } from '@/stores/workout-planner-store';
import { formatDate, cn, toDateString } from '@/lib/utils';
import { MUSCLE_GROUPS } from '@/lib/constants';
import type { MuscleGroup, Exercise, Workout, WorkoutExercise, ExerciseSet } from '@/lib/types';

interface ActiveWorkoutProps {
  workout: Workout;
  onShowLibrary: (target: 'workout') => void;
  onFinish: () => void;
  onCancel: () => void;
  onAddSet: (workoutExerciseId: string, set: Omit<ExerciseSet, 'id' | 'workout_exercise_id' | 'created_at'>) => void;
  onUpdateSet: (workoutExerciseId: string, setId: string, updates: Partial<ExerciseSet>) => void;
  onRemoveSet: (workoutExerciseId: string, setId: string) => void;
  onRemoveExercise: (workoutExerciseId: string) => void;
  restTimer: number | null;
  onStartRest: () => void;
  restSeconds: number;
  onSetRestSeconds: (seconds: number) => void;
}

const DAY_ORDER: DayOfWeek[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_SHORT: Record<DayOfWeek, string> = { monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu', friday:'Fri', saturday:'Sat', sunday:'Sun' };

export default function ExercisePage() {
  const { workouts, activeWorkout, startWorkout, finishWorkout, cancelWorkout,
    addExerciseToWorkout, addSetToExercise, updateSet, removeSet, removeExerciseFromWorkout,
    exercises, getExerciseSessions } = useExerciseStore();
  const prs = useWorkoutPlannerStore(s => s.prs);
  const getPRForExercise = useWorkoutPlannerStore(s => s.getPRForExercise);
  // Subscribe to PRs so detail sheets re-render when records change (read via getPRForExercise below).
  void prs;
  const today = toDateString();
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryTarget, setLibraryTarget] = useState<'workout' | DayOfWeek>('workout');
  // Wiki MVP: detail sheet opened from the library (null = closed).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restSeconds, setRestSeconds] = useState(90);
  const [tab, setTab] = useState<'workout' | 'plan' | 'prs'>(activeWorkout ? 'workout' : 'plan');

  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (restTimer !== null && restTimer > 0) {
      timerRef.current = setInterval(() => {
        setRestTimer((t) => (t !== null && t > 1 ? t - 1 : null));
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [restTimer]);

  const openLibrary = (target: 'workout' | DayOfWeek) => {
    setLibraryTarget(target);
    setShowLibrary(true);
  };

  const handleSelectExercise = (exId: string) => {
    const ex = exercises.find(e => e.id === exId);
    if (!ex) return;
    if (libraryTarget === 'workout') {
      if (!activeWorkout) startWorkout('Workout');
      addExerciseToWorkout(exId);
    } else {
      useWorkoutPlannerStore.getState().addExerciseToDay(libraryTarget, ex.name, exId, 3, '8-12');
    }
    setShowLibrary(false);
    setDetailId(null);
  };

  const detailExercise = detailId ? exercises.find(e => e.id === detailId) ?? null : null;
  const detailTargetLabel = libraryTarget === 'workout' ? "today's workout" : DAY_SHORT[libraryTarget];
  const detailAlreadyAdded = libraryTarget === 'workout' && detailExercise
    ? (activeWorkout?.exercises.some(we => we.exercise_id === detailExercise.id) ?? false)
    : false;
  const detailGuidance = detailExercise
    ? getProgressionGuidance(getExerciseSessions(detailExercise.id), today)
    : null;
  const detailHistoryText = (() => {
    const latest = detailGuidance?.latest;
    if (!latest) return null;
    if (latest.loadedTop) return `${formatDate(latest.date)} · ${latest.loadedTop.weight_kg}kg × ${latest.loadedTop.reps}`;
    if (latest.bodyweightTop) return `${formatDate(latest.date)} · ${latest.bodyweightTop.reps} reps`;
    return null;
  })();
  const detailPr = detailExercise ? getPRForExercise(detailExercise.name) : undefined;
  const detailPrText = detailPr ? `${detailPr.weight_kg}kg × ${detailPr.reps} · ${formatDate(detailPr.date)}` : null;

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
      {tab === 'prs' && <PRView />}

      {showLibrary && (
        <ExerciseLibrary exercises={exercises} onDetail={setDetailId} onClose={() => setShowLibrary(false)} />
      )}
      {detailExercise && (
        <ExerciseDetail
          exercise={detailExercise}
          targetLabel={detailTargetLabel}
          alreadyAdded={detailAlreadyAdded}
          historyText={detailHistoryText}
          prText={detailPrText}
          onAdd={() => handleSelectExercise(detailExercise.id)}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

/* =================== ACTIVE WORKOUT =================== */
function ActiveWorkoutView({ workout, onShowLibrary, onFinish, onCancel, onAddSet, onUpdateSet, onRemoveSet, onRemoveExercise, restTimer, onStartRest, restSeconds, onSetRestSeconds }: ActiveWorkoutProps) {
  const [elapsed, setElapsed] = useState(0);
  const allWorkouts = useExerciseStore(s => s.workouts);
  const getExerciseSessions = useExerciseStore(s => s.getExerciseSessions);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const today = toDateString();
  const guidanceById = useMemo(() => {
    const map: Record<string, ReturnType<typeof getProgressionGuidance>> = {};
    for (const we of workout.exercises) {
      map[we.id] = getProgressionGuidance(getExerciseSessions(we.exercise_id), today);
    }
    return map;
    // allWorkouts is intentionally a dep (not read inside): getExerciseSessions
    // is a stable reference, so without it this memo would stay stale after
    // finished workouts reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout.exercises, allWorkouts, getExerciseSessions, today]);
  useEffect(() => {
    const start = new Date(workout.start_time).getTime();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [workout.start_time]);
  const mins = Math.floor(elapsed / 60), secs = elapsed % 60;

  const applySuggestion = (we: WorkoutExercise, sug: SuggestedSet) => {
    const target = resolveSuggestionTarget(we.sets);
    if (target.type === 'update') {
      // Prefill only a genuinely empty set; populated sets are never touched.
      onUpdateSet(we.id, target.setId, { weight_kg: sug.weight_kg, reps: sug.reps });
    } else {
      onAddSet(we.id, {
        set_number: we.sets.length + 1, weight_kg: sug.weight_kg, reps: sug.reps,
        duration_seconds: null, distance_km: null, is_warmup: false, is_pr: false, rpe: null,
      });
    }
  };

  const renderGuidance = (we: WorkoutExercise) => {
    const g = guidanceById[we.id];
    if (!g?.latest) return null;
    const top = g.latest.loadedTop;
    const lastText = top
      ? `${formatDate(g.latest.date)} · ${top.weight_kg}kg × ${top.reps}`
      : g.latest.bodyweightTop
        ? `${formatDate(g.latest.date)} · ${g.latest.bodyweightTop.reps} reps`
        : null;
    if (!lastText) return null;
    const sug = g.suggestion;
    const sugText = sug
      ? (sug.weight_kg === null ? `${sug.reps} reps` : `${sug.weight_kg}kg × ${sug.reps}`)
      : null;
    const name = we.exercise?.name || 'Exercise';
    return (
      <div className="px-4 pt-1">
        <div className="text-[10px] text-[#777]">Last: {lastText}</div>
        {sug && sugText && !dismissed[we.id] && (
          <div className="mt-2 rounded-xl border border-[rgba(240,165,0,0.18)] bg-[rgba(240,165,0,0.06)] p-2.5">
            <p className="text-[11px] leading-relaxed text-[#CCC]">
              <span className="font-semibold text-[#f59e0b]">Suggestion · </span>{g.rationale}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => applySuggestion(we, sug)}
                aria-label={`Use suggested ${sugText} for ${name}`}
                className="flex-1 py-2 rounded-lg gradient-btn text-xs font-semibold">
                Use {sugText}
              </button>
              <button
                onClick={() => setDismissed(d => ({ ...d, [we.id]: true }))}
                aria-label={`Dismiss suggestion for ${name}`}
                className="px-3 py-2 rounded-lg border border-[rgba(230,213,184,0.08)] text-xs font-medium text-[#777] hover:bg-[rgba(230,213,184,0.04)]">
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

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

      {workout.exercises.map((we: WorkoutExercise) => (
        <div key={we.id} className="glass-card overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-bold text-[#EEE]">{we.exercise?.name || 'Exercise'}</div>
              <div className="text-[10px] text-[#555] capitalize">{we.exercise?.muscle_group}</div>
            </div>
            <button onClick={() => onRemoveExercise(we.id)} className="text-[#444] hover:text-[#ea580c] p-1 transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
          {renderGuidance(we)}
          <div className="px-4 pb-3">
            <div className="grid grid-cols-[40px_1fr_1fr_36px] gap-2 text-[9px] text-[#555] font-semibold uppercase mb-2 px-1">
              <span>Set</span><span>Weight</span><span>Reps</span><span></span>
            </div>
            {we.sets.map((set: ExerciseSet, i: number) => (
              <div key={set.id} className="grid grid-cols-[40px_1fr_1fr_36px] gap-2 items-center mb-2">
                <span className="text-xs font-bold text-[#555] text-center bg-[rgba(230,213,184,0.03)] rounded-lg py-1.5">{i + 1}</span>
                <input type="number" inputMode="decimal" min={0} value={set.weight_kg || ''} onChange={(e) => onUpdateSet(we.id, set.id, { weight_kg: Math.max(0, parseFloat(e.target.value) || 0) })}
                  className="dark-input py-2 text-xs text-center" placeholder="kg" aria-label={`Set ${i + 1} weight in kilograms`} />
                <input type="number" inputMode="numeric" min={0} value={set.reps || ''} onChange={(e) => onUpdateSet(we.id, set.id, { reps: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="dark-input py-2 text-xs text-center" placeholder="reps" aria-label={`Set ${i + 1} reps`} />
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
function WorkoutHistory({ workouts, onStart }: { workouts: Workout[]; onStart: () => void }) {
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
            {w.exercises?.map((we: WorkoutExercise) => (
              <span key={we.id} className="bg-[rgba(230,213,184,0.04)] text-[#AAA] text-[10px] px-2 py-0.5 rounded-lg">{we.exercise?.name}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* =================== WEEKLY PLAN =================== */
function WeeklyPlanView({ openLibrary }: { openLibrary: (day: DayOfWeek) => void; exercises: Exercise[] }) {
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
                      aria-label="Remove exercise"
                      className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 text-[#444] hover:text-[#ea580c] p-2 -m-1 lg:p-1 lg:m-0 transition-all">
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
function PRView() {
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
                <button onClick={() => removePR(pr.id)} aria-label="Remove personal record" className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 text-[#444] hover:text-[#ea580c] p-2 -m-1 lg:p-1 lg:m-0 transition-all">
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
                <input type="number" inputMode="decimal" min={0} value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="Weight (kg)" className="dark-input" aria-label="Personal record weight in kilograms" />
                <input type="number" inputMode="numeric" min={0} value={form.reps} onChange={e => setForm(f => ({ ...f, reps: e.target.value }))}
                  placeholder="Reps" className="dark-input" aria-label="Personal record reps" />
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
function ExerciseLibrary({ exercises, onDetail, onClose }: { exercises: Exercise[]; onDetail: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState<MuscleGroup | 'all'>('all');
  const [filterEquip, setFilterEquip] = useState<EquipmentTag | 'all'>('all');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const filtered = filterExercises(exercises, { query, muscle: filterGroup, equipment: filterEquip });
  const clearFilters = () => { setQuery(''); setFilterGroup('all'); setFilterEquip('all'); };
  const chip = (active: boolean) => cn('px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors',
    active ? 'bg-[rgba(240,165,0,0.12)] text-[#f59e0b] border-[rgba(240,165,0,0.2)]' : 'bg-[rgba(230,213,184,0.03)] text-[#555] border-[rgba(230,213,184,0.04)]');

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#111111] border border-[rgba(230,213,184,0.08)] rounded-t-3xl lg:rounded-2xl shadow-2xl slide-up max-h-[85vh] flex flex-col max-lg:pb-safe" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[rgba(230,213,184,0.06)]">
          <h3 className="text-lg font-bold text-[#EEE]">Exercise Library</h3>
          <button onClick={onClose} aria-label="Close exercise library" className="w-8 h-8 rounded-full bg-[rgba(230,213,184,0.06)] flex items-center justify-center hover:bg-[rgba(230,213,184,0.1)]"><X className="w-4 h-4 text-[#777]" /></button>
        </div>
        <div className="p-4 border-b border-[rgba(230,213,184,0.06)]">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#555]" />
            <label htmlFor="wiki-search" className="sr-only">Search exercises</label>
            <input id="wiki-search" type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search exercises..." autoFocus className="dark-input pl-9" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar" role="group" aria-label="Filter by muscle group">
            <button onClick={() => setFilterGroup('all')} aria-pressed={filterGroup === 'all'} className={chip(filterGroup === 'all')}>All</button>
            {MUSCLE_GROUPS.map(g => (
              <button key={g.value} onClick={() => setFilterGroup(g.value)} aria-pressed={filterGroup === g.value} className={chip(filterGroup === g.value)}>
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar mt-1.5" role="group" aria-label="Filter by equipment">
            <button onClick={() => setFilterEquip('all')} aria-pressed={filterEquip === 'all'} className={chip(filterEquip === 'all')}>Any gear</button>
            {EQUIPMENT_TAGS.filter(t => t !== 'other').map(t => (
              <button key={t} onClick={() => setFilterEquip(filterEquip === t ? 'all' : t)} aria-pressed={filterEquip === t} className={chip(filterEquip === t)}>
                {EQUIPMENT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {filtered.length === 0 ? (
            <EmptyState icon={Search} message="No exercises match these filters." action="Clear filters" onAction={clearFilters} />
          ) : filtered.map((e: Exercise) => (
            <button key={e.id} onClick={() => onDetail(e.id)} className="w-full flex items-center justify-between gap-2 p-3 rounded-xl hover:bg-[rgba(230,213,184,0.04)] transition-colors text-left">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#EEE] flex items-center gap-1.5">
                  <span className="truncate">{e.name}</span>
                  {hasWikiContent(e) && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[rgba(240,165,0,0.12)] text-[#f59e0b] text-[9px] font-bold uppercase tracking-wide">
                      <BookOpen className="w-2.5 h-2.5" /> Guide
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[#555] capitalize">{e.muscle_group} · {EQUIPMENT_LABELS[resolveEquipmentTags(e)[0]]}</div>
              </div>
              <Plus className="w-4 h-4 text-[#f59e0b] shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =================== EXERCISE DETAIL (Wiki MVP) =================== */
function ExerciseDetail({ exercise, targetLabel, alreadyAdded, historyText, prText, onAdd, onClose }: {
  exercise: Exercise;
  targetLabel: string;
  alreadyAdded: boolean;
  historyText: string | null;
  prText: string | null;
  onAdd: () => void;
  onClose: () => void;
}) {
  const sections = getDetailSections(exercise);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const metaChip = 'px-2 py-1 rounded-lg bg-[rgba(230,213,184,0.04)] border border-[rgba(230,213,184,0.06)] text-[11px] font-medium text-[#AAA] capitalize';

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="wiki-detail-title"
        className="w-full max-w-lg bg-[#111111] border border-[rgba(230,213,184,0.08)] rounded-t-3xl lg:rounded-2xl shadow-2xl slide-up max-h-[85vh] flex flex-col max-lg:pb-safe" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[rgba(230,213,184,0.06)]">
          <div className="min-w-0">
            <h3 id="wiki-detail-title" className="text-lg font-bold text-[#EEE] leading-snug">{exercise.name}</h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={metaChip}>{exercise.muscle_group.replace('_', ' ')}</span>
              {exercise.movement && <span className={metaChip}>{MOVEMENT_LABELS[exercise.movement]}</span>}
              {exercise.difficulty && <span className={metaChip}>{DIFFICULTY_LABELS[exercise.difficulty]}</span>}
            </div>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close exercise details" className="shrink-0 w-8 h-8 rounded-full bg-[rgba(230,213,184,0.06)] flex items-center justify-center hover:bg-[rgba(230,213,184,0.1)]"><X className="w-4 h-4 text-[#777]" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {(sections.primaryMuscles.length > 0 || sections.secondaryMuscles.length > 0) && (
            <section aria-label="Muscles worked">
              <h4 className="text-[11px] font-bold text-[#777] uppercase tracking-wider mb-2">Muscles worked</h4>
              <div className="flex flex-wrap gap-1.5">
                {sections.primaryMuscles.map(m => (
                  <span key={m} className="px-2.5 py-1 rounded-lg bg-[rgba(240,165,0,0.12)] text-[#f59e0b] border border-[rgba(240,165,0,0.2)] text-xs font-semibold">{m}</span>
                ))}
                {sections.secondaryMuscles.map(m => (
                  <span key={m} className="px-2.5 py-1 rounded-lg bg-[rgba(230,213,184,0.04)] text-[#AAA] border border-[rgba(230,213,184,0.06)] text-xs">{m}</span>
                ))}
              </div>
            </section>
          )}

          <section aria-label="Equipment">
            <h4 className="text-[11px] font-bold text-[#777] uppercase tracking-wider mb-2">Equipment</h4>
            <div className="flex flex-wrap gap-1.5">
              {sections.equipmentTags.map(t => <span key={t} className={metaChip}>{EQUIPMENT_LABELS[t]}</span>)}
            </div>
          </section>

          {(historyText || prText) && (
            <section aria-label="Previous performance">
              <h4 className="text-[11px] font-bold text-[#777] uppercase tracking-wider mb-2">Last session</h4>
              {historyText && <p className="text-[13px] text-[#CCC]">{historyText}</p>}
              {prText && <p className="text-xs text-[#f59e0b] font-semibold mt-1">PR · {prText}</p>}
            </section>
          )}

          {sections.instructions.length > 0 && (
            <section aria-label="How to perform">
              <h4 className="text-[11px] font-bold text-[#777] uppercase tracking-wider mb-2">How to perform</h4>
              <ol className="space-y-2.5">
                {sections.instructions.map((step, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-[#CCC] leading-relaxed">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[rgba(240,165,0,0.12)] text-[#f59e0b] text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {sections.cues.length > 0 && (
            <section aria-label="Coaching cues">
              <h4 className="text-[11px] font-bold text-[#777] uppercase tracking-wider mb-2">Cues</h4>
              <ul className="space-y-2">
                {sections.cues.map((cue, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-[#CCC] leading-relaxed">
                    <Check className="w-4 h-4 text-[#f59e0b] shrink-0 mt-0.5" />
                    <span>{cue}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="p-4 border-t border-[rgba(230,213,184,0.06)] max-lg:pb-safe">
          <button
            onClick={onAdd}
            disabled={alreadyAdded}
            aria-label={alreadyAdded ? `${exercise.name} is already in today's workout` : `Add ${exercise.name} to ${targetLabel}`}
            className={alreadyAdded
              ? 'w-full py-3 rounded-xl text-sm font-semibold bg-[rgba(230,213,184,0.06)] text-[#777]'
              : 'w-full py-3 gradient-btn text-sm flex items-center justify-center gap-2'}>
            {alreadyAdded ? (<><Check className="w-4 h-4" /> Already in workout</>) : (<><Plus className="w-4 h-4" /> Add to {targetLabel}</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
