'use client';
import { useState, useMemo } from 'react';
import { Plus, X, Trash2, Target, Check, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PageHeader } from '@/components/layout/header';
import { useHabitStore } from '@/stores/habit-store';
import { cn, formatDateShort } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, getDate, isToday } from 'date-fns';

export default function HabitsPage() {
  const { habits, habitLogs, logHabit, addHabit, removeHabit, updateHabit } = useHabitStore();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '' });
  const [viewMonth, setViewMonth] = useState(new Date());
  const [editingHabit, setEditingHabit] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const activeHabits = habits.filter((h) => h.is_active);

  const prevMonth = () => setViewMonth(subMonths(viewMonth, 1));
  const nextMonth = () => setViewMonth(addMonths(viewMonth, 1));
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const handleAddHabit = () => {
    if (!addForm.name.trim()) return;
    addHabit({ name: addForm.name.trim(), icon: '', color: '#f59e0b', target_value: 1, unit: 'times' });
    setAddForm({ name: '' });
    setShowAdd(false);
  };

  const startEditHabit = (id: string, currentName: string) => {
    setEditingHabit(id);
    setEditName(currentName);
  };

  const saveEditHabit = () => {
    if (editingHabit && editName.trim()) {
      updateHabit(editingHabit, { name: editName.trim() });
    }
    setEditingHabit(null);
  };

  const toggleDay = (habitId: string, dateStr: string) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    const log = habitLogs.find(l => l.habit_id === habitId && l.date === dateStr);
    const currentVal = log?.value || 0;
    logHabit(habitId, dateStr, currentVal >= habit.target_value ? 0 : habit.target_value);
  };

  // Score data: for each day, count completed habits
  const scoreData = useMemo(() => {
    return daysInMonth.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const completed = activeHabits.filter(h => {
        const log = habitLogs.find(l => l.habit_id === h.id && l.date === dateStr);
        return log?.completed;
      }).length;
      return { day: getDate(day), date: dateStr, done: completed };
    });
  }, [daysInMonth, activeHabits, habitLogs]);

  return (
    <div>
      <PageHeader title="Monthly Habit Tracker" subtitle={format(viewMonth, 'MMMM yyyy')} />

      <div className="px-4 lg:px-0 py-4 space-y-5">
        {/* Month Nav + Add */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-[rgba(230,213,184,0.04)] border border-[rgba(230,213,184,0.06)] flex items-center justify-center hover:bg-[rgba(230,213,184,0.08)] transition-colors">
              <ChevronLeft className="w-4 h-4 text-[#777]" />
            </button>
            <h2 className="text-base font-bold text-[#EEE] min-w-[140px] text-center">{format(viewMonth, 'MMMM yyyy')}</h2>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-[rgba(230,213,184,0.04)] border border-[rgba(230,213,184,0.06)] flex items-center justify-center hover:bg-[rgba(230,213,184,0.08)] transition-colors">
              <ChevronRight className="w-4 h-4 text-[#777]" />
            </button>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 accent-btn px-3 py-2 text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Habit
          </button>
        </div>

        {/* === MAIN GRID: Paper-style Habit Tracker === */}
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full border-collapse" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[#111111] text-left px-3 py-3 text-[11px] font-bold text-[#AAA] uppercase tracking-wider border-b border-r border-[rgba(230,213,184,0.08)] min-w-[160px]">
                    Habits / Protocols
                  </th>
                  {daysInMonth.map(day => {
                    const d = getDate(day);
                    const isCurrent = isToday(day);
                    return (
                      <th key={d} className={cn(
                        'px-0 py-2.5 text-center text-[10px] font-bold border-b border-[rgba(230,213,184,0.06)] w-[30px] min-w-[30px]',
                        isCurrent ? 'text-[#f59e0b] bg-[rgba(240,165,0,0.06)]' : 'text-[#555]'
                      )}>
                        {d}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {activeHabits.map((habit, idx) => (
                  <tr key={habit.id} className="group">
                    <td className="sticky left-0 z-10 bg-[#111111] group-hover:bg-[#1a1a1a] px-3 py-2 border-b border-r border-[rgba(230,213,184,0.06)] transition-colors">
                      <div className="flex items-center justify-between gap-1">
                        {editingHabit === habit.id ? (
                          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                            onBlur={saveEditHabit} onKeyDown={(e) => e.key === 'Enter' && saveEditHabit()}
                            className="bg-transparent border-b border-[#f59e0b] text-sm text-[#EEE] outline-none w-full py-0.5" autoFocus />
                        ) : (
                          <span className="text-xs font-semibold text-[#EEE] truncate max-w-[100px]">{idx + 1}. {habit.name}</span>
                        )}
                        <div className="flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
                          <button onClick={() => startEditHabit(habit.id, habit.name)} className="p-0.5 text-[#555] hover:text-[#f59e0b] transition-colors">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => removeHabit(habit.id)} className="p-0.5 text-[#555] hover:text-[#ea580c] transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>
                    {daysInMonth.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const log = habitLogs.find(l => l.habit_id === habit.id && l.date === dateStr);
                      const completed = log?.completed;
                      const isCurrent = isToday(day);
                      return (
                        <td key={dateStr} className={cn(
                          'px-0 py-1 text-center border-b border-[rgba(230,213,184,0.04)]',
                          isCurrent && 'bg-[rgba(240,165,0,0.03)]'
                        )}>
                          <button onClick={() => toggleDay(habit.id, dateStr)}
                            aria-label={`Toggle ${habit.name} for ${formatDateShort(dateStr)}`}
                            aria-pressed={!!completed}
                            className={cn(
                              'w-[28px] h-[28px] mx-auto rounded-[5px] border transition-all duration-150 flex items-center justify-center',
                              completed
                                ? 'bg-[#f59e0b] border-[#f59e0b] text-[#111111]'
                                : 'bg-transparent border-[rgba(230,213,184,0.12)] hover:border-[rgba(240,165,0,0.4)] hover:bg-[rgba(240,165,0,0.05)]'
                            )}
                            title={`${formatDateShort(dateStr)}`}>
                            {completed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {activeHabits.length === 0 && (
                  <tr>
                    <td colSpan={daysInMonth.length + 1} className="py-12 text-center">
                      <Target className="w-8 h-8 text-[#444] mx-auto mb-2" />
                      <p className="text-sm text-[#555]">No habits yet. Click &quot;Add Habit&quot; to start tracking.</p>
                    </td>
                  </tr>
                )}

                {/* Empty rows to fill up to 10 like the paper template */}
                {activeHabits.length > 0 && activeHabits.length < 10 && Array.from({ length: Math.min(10 - activeHabits.length, 3) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="opacity-30">
                    <td className="sticky left-0 z-10 bg-[#111111] px-3 py-2 border-b border-r border-[rgba(230,213,184,0.04)]">
                      <span className="text-xs text-[#444]">{activeHabits.length + i + 1}.</span>
                    </td>
                    {daysInMonth.map((day, di) => (
                      <td key={di} className="px-0 py-1 text-center border-b border-[rgba(230,213,184,0.02)]">
                        <div className="w-[28px] h-[28px] mx-auto rounded-[5px] border border-[rgba(230,213,184,0.04)]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* === SCORE GRAPH: "Done!" count per day as line chart === */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#EEE]">Daily Habits Score Graph</h3>
              <p className="text-[10px] text-[#555] mt-0.5">Habits completed each day over the month</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[#777]">
              <div className="w-3 h-[2px] bg-[#f59e0b] rounded-full" /> Done count
            </div>
          </div>

          {activeHabits.length === 0 ? (
            <p className="text-center text-sm text-[#555] py-8">Add habits to see your score graph</p>
          ) : (
            <div className="h-48 lg:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(230,213,184,0.04)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 9, fill: '#555' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, Math.max(activeHabits.length, 3)]}
                    tick={{ fontSize: 9, fill: '#555' }}
                    axisLine={false}
                    tickLine={false}
                    width={20}
                    allowDecimals={false}
                    ticks={Array.from({ length: activeHabits.length + 1 }, (_, i) => i)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#111111',
                      border: '1px solid rgba(230,213,184,0.12)',
                      borderRadius: '10px',
                      fontSize: '11px',
                      color: '#EEE',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                    }}
                    formatter={(value) => [`${value} / ${activeHabits.length} done`, 'Score']}
                    labelFormatter={(day) => `Day ${day}`}
                    cursor={{ stroke: 'rgba(240,165,0,0.2)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="done"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#f59e0b', stroke: '#111111', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: '#fbbf24', stroke: '#f59e0b', strokeWidth: 2 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary stats */}
          {activeHabits.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[rgba(230,213,184,0.06)]">
              {(() => {
                const totalDone = scoreData.reduce((s, d) => s + d.done, 0);
                const totalPossible = scoreData.reduce((s) => s + activeHabits.length, 0);
                const rate = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
                const perfectDays = scoreData.filter(d => d.done === activeHabits.length && activeHabits.length > 0).length;
                return [
                  { label: 'Completion', value: `${rate}%`, color: '#f59e0b' },
                  { label: 'Perfect Days', value: `${perfectDays}`, color: '#ea580c' },
                  { label: 'Total Done', value: `${totalDone}`, color: '#AAA' },
                ];
              })().map(s => (
                <div key={s.label} className="text-center">
                  <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[10px] text-[#555]">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Habit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-sm bg-[#111111] border border-[rgba(230,213,184,0.1)] rounded-2xl shadow-2xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-[#EEE]">New Habit</h3>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-full bg-[rgba(230,213,184,0.06)] flex items-center justify-center hover:bg-[rgba(230,213,184,0.1)]">
                <X className="w-4 h-4 text-[#777]" />
              </button>
            </div>
            <div className="space-y-3">
              <input type="text" value={addForm.name} onChange={(e) => setAddForm({ name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleAddHabit()}
                placeholder="e.g., Meditation, Cold shower, 10k steps..."
                className="dark-input" autoFocus />
              <button onClick={handleAddHabit} className="w-full gradient-btn py-3">Add Habit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
