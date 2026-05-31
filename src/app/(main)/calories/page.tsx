'use client';
import { useState, useMemo } from 'react';
import { Plus, ChevronLeft, ChevronRight, Search, X, Clock, Sunrise, Sun, Moon, Coffee, Flame, Apple } from 'lucide-react';
import { Card, SectionLabel, StatNumber, ProgressBar, EmptyState } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/header';
import { useCalorieStore } from '@/stores/calorie-store';
import { useProfileStore } from '@/stores/profile-store';
import { toDateString, formatDate, cn } from '@/lib/utils';
import { MEAL_TYPES } from '@/lib/constants';
import { subDays, addDays, parseISO, isToday as isTodayFn } from 'date-fns';
import type { FoodItem, MealType } from '@/lib/types';

const MI: Record<string, React.ElementType> = { breakfast: Sunrise, lunch: Sun, dinner: Moon, snack: Coffee };
const MC: Record<string, string> = { breakfast: '#f59e0b', lunch: '#ea580c', dinner: '#888', snack: '#AAA' };

export default function CaloriesPage() {
  const [date, setDate] = useState(toDateString());
  const [modal, setModal] = useState(false);
  const [meal, setMeal] = useState<MealType>('breakfast');
  const [open, setOpen] = useState<MealType | null>(null);
  const profile = useProfileStore(s => s.profile);
  const { getDailySummary, getLogsByMealType, removeFoodLog } = useCalorieStore();
  const sum = getDailySummary(date);
  const tgt = profile?.daily_calorie_target || 2000;
  const pct = Math.min((sum.calories / tgt) * 100, 100);
  const rem = Math.max(tgt - Math.round(sum.calories), 0);
  const isToday = isTodayFn(parseISO(date));

  const macros = [
    { l: 'Protein', v: Math.round(sum.protein_g), t: profile?.protein_target_g || 150, c: '#f59e0b' },
    { l: 'Carbs', v: Math.round(sum.carbs_g), t: profile?.carbs_target_g || 200, c: '#ea580c' },
    { l: 'Fat', v: Math.round(sum.fat_g), t: profile?.fat_target_g || 65, c: '#888' },
  ];

  return (
    <div>
      <PageHeader title="Nutrition" subtitle={isToday ? 'Today' : formatDate(date)} />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Date nav */}
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setDate(toDateString(subDays(parseISO(date), 1)))} className="w-10 h-10 rounded-xl bg-[#111111] border border-[#1a1a1a] flex items-center justify-center hover:bg-[#1a1a1a]"><ChevronLeft className="w-4 h-4 text-[#777]" /></button>
          <span className="text-[14px] font-bold text-white min-w-[120px] text-center">{isToday ? 'Today' : formatDate(date)}</span>
          <button onClick={() => setDate(toDateString(addDays(parseISO(date), 1)))} className="w-10 h-10 rounded-xl bg-[#111111] border border-[#1a1a1a] flex items-center justify-center hover:bg-[#1a1a1a]"><ChevronRight className="w-4 h-4 text-[#777]" /></button>
        </div>

        {/* Calories hero + macros */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="lg:col-span-2 !p-6 !bg-gradient-to-br !from-[#1E1A12] !to-[#1A1610] !border-[#2A2518]">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4 text-[#f59e0b]" />
              <span className="text-[11px] font-bold text-[#666] uppercase tracking-[0.1em]">Calories</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <StatNumber value={Math.round(sum.calories)} size="xl" color="#fff" />
                <p className="text-[13px] text-[#666] mt-2">of {tgt} · <span className="text-[#f59e0b] font-semibold">{rem} left</span></p>
                <div className="mt-4 max-w-[240px]"><ProgressBar value={sum.calories} max={tgt} height={6} color={pct > 100 ? '#ea580c' : '#f59e0b'} /></div>
              </div>
              <div className="relative w-20 h-20 shrink-0 hidden sm:block">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1a1a1a" strokeWidth="3" />
                  <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray={`${pct}, 100`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center"><span className="text-sm font-extrabold text-[#f59e0b]">{Math.round(pct)}%</span></div>
              </div>
            </div>
          </Card>
          {macros.map(m => (
            <Card key={m.l}>
              <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider">{m.l}</span>
              <div className="mt-2 mb-3"><StatNumber value={m.v} unit={`/ ${m.t}g`} size="lg" color={m.c} /></div>
              <ProgressBar value={m.v} max={m.t} color={m.c} />
            </Card>
          ))}
        </div>

        {/* Meals — card-based */}
        <div>
          <SectionLabel>Meals</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {MEAL_TYPES.map(({ value, label, time }) => {
              const logs = getLogsByMealType(date, value);
              const cal = logs.reduce((s, l) => s + l.calories, 0);
              const isOpen = open === value;
              const Icon = MI[value] || Coffee;
              const color = MC[value] || '#f59e0b';
              return (
                <Card key={value} className="!p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#161616] transition-colors"
                    role="button" tabIndex={0} onClick={() => setOpen(isOpen ? null : value)} onKeyDown={e => e.key === 'Enter' && setOpen(isOpen ? null : value)}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}12`, border: `1px solid ${color}20` }}>
                        <Icon className="w-[18px] h-[18px]" style={{ color }} />
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-white">{label}</div>
                        <div className="text-[11px] text-[#555]">{time}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatNumber value={Math.round(cal)} unit="kcal" size="md" />
                      <button onClick={e => { e.stopPropagation(); setMeal(value); setModal(true); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
                        style={{ background: `${color}15`, color, border: `1px solid ${color}20` }}>
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {isOpen && logs.length > 0 && (
                    <div className="border-t border-[#1a1a1a]">
                      {logs.map(log => (
                        <div key={log.id} className="flex items-center justify-between px-4 py-3 group hover:bg-[#0e0e0f]">
                          <div className="flex items-center gap-3">
                            <Apple className="w-4 h-4 text-[#444]" />
                            <div>
                              <div className="text-[13px] font-medium text-[#EEE]">{log.food_item?.name || 'Food'}</div>
                              <div className="text-[11px] text-[#555]">P:{Math.round(log.protein_g)}g C:{Math.round(log.carbs_g)}g F:{Math.round(log.fat_g)}g</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-[#AAA]">{Math.round(log.calories)}</span>
                            <button onClick={() => removeFoodLog(log.id)} className="w-6 h-6 rounded-lg opacity-0 group-hover:opacity-100 bg-[rgba(228,88,38,0.1)] text-[#ea580c] flex items-center justify-center"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && logs.length === 0 && (
                    <div className="border-t border-[#1a1a1a]">
                      <EmptyState icon={Apple} message="No foods logged" action="+ Add food" onAction={() => { setMeal(value); setModal(true); }} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>
      {modal && <AddModal meal={meal} date={date} onClose={() => setModal(false)} />}
    </div>
  );
}

function AddModal({ meal, date, onClose }: { meal: MealType; date: string; onClose: () => void }) {
  const [tab, setTab] = useState<'search' | 'manual' | 'recent'>('search');
  const [q, setQ] = useState('');
  const [f, setF] = useState({ name: '', cal: '', pro: '', carb: '', fat: '', srv: '1' });
  const { searchFoodItems, addFoodLog, addFoodItem, getRecentFoods } = useCalorieStore();
  const res = useMemo(() => q.length >= 2 ? searchFoodItems(q) : [], [q, searchFoodItems]);
  const rec = useMemo(() => getRecentFoods(), [getRecentFoods]);
  const log = (food: FoodItem, s = 1) => {
    addFoodLog({ user_id: '', food_item_id: food.id, food_item: food, date, meal_type: meal, servings: s,
      calories: food.calories_per_serving * s, protein_g: food.protein_g * s, carbs_g: food.carbs_g * s, fat_g: food.fat_g * s, notes: '' });
    onClose();
  };
  const manual = () => {
    const c = parseFloat(f.cal) || 0; if (!f.name || !c) return;
    const food = addFoodItem({ name: f.name, brand: '', serving_size: 1, serving_unit: 'serving', calories_per_serving: c,
      protein_g: parseFloat(f.pro) || 0, carbs_g: parseFloat(f.carb) || 0, fat_g: parseFloat(f.fat) || 0,
      fiber_g: 0, barcode: null, is_custom: true, created_by: null });
    log(food, parseFloat(f.srv) || 1);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#111111] border border-[#1a1a1a] rounded-t-2xl lg:rounded-2xl shadow-2xl slide-up max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <h3 className="text-[16px] font-bold text-white">Add Food</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-[#222222]"><X className="w-4 h-4 text-[#777]" /></button>
        </div>
        <div className="flex border-b border-[#1a1a1a]">
          {[{ k: 'search' as const, l: 'Search', i: Search }, { k: 'manual' as const, l: 'Manual', i: Plus }, { k: 'recent' as const, l: 'Recent', i: Clock }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} className={cn('flex-1 py-3 text-[12px] font-bold flex items-center justify-center gap-1.5',
              tab === t.k ? 'text-[#f59e0b] border-b-2 border-[#f59e0b]' : 'text-[#555]')}><t.i className="w-3.5 h-3.5" />{t.l}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'search' && (<div><div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search foods..." autoFocus className="dark-input pl-10" /></div>
            {res.map(fd => (<button key={fd.id} onClick={() => log(fd)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] text-left mb-1"><div><div className="text-[14px] font-medium text-[#EEE]">{fd.name}</div><div className="text-[11px] text-[#555]">P:{fd.protein_g}g C:{fd.carbs_g}g F:{fd.fat_g}g</div></div><span className="text-[16px] font-extrabold text-[#f59e0b]">{fd.calories_per_serving}</span></button>))}
            {q.length >= 2 && res.length === 0 && <p className="text-center text-[13px] text-[#555] py-8">No results. Try manual entry.</p>}</div>)}
          {tab === 'manual' && (<div className="space-y-3"><input placeholder="Food name" value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} className="dark-input" />
            <div className="grid grid-cols-2 gap-3"><input type="number" placeholder="Calories" value={f.cal} onChange={e => setF(x => ({ ...x, cal: e.target.value }))} className="dark-input" /><input type="number" placeholder="Servings" value={f.srv} onChange={e => setF(x => ({ ...x, srv: e.target.value }))} className="dark-input" /></div>
            <div className="grid grid-cols-3 gap-3"><input type="number" placeholder="Protein (g)" value={f.pro} onChange={e => setF(x => ({ ...x, pro: e.target.value }))} className="dark-input" /><input type="number" placeholder="Carbs (g)" value={f.carb} onChange={e => setF(x => ({ ...x, carb: e.target.value }))} className="dark-input" /><input type="number" placeholder="Fat (g)" value={f.fat} onChange={e => setF(x => ({ ...x, fat: e.target.value }))} className="dark-input" /></div>
            <button onClick={manual} className="w-full gradient-btn py-3">Add Food</button></div>)}
          {tab === 'recent' && (<div>{rec.length === 0 ? <p className="text-center text-[13px] text-[#555] py-8">No recent foods.</p> : rec.map(fd => (
            <button key={fd.id} onClick={() => log(fd)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] text-left mb-1"><div><div className="text-[14px] font-medium text-[#EEE]">{fd.name}</div><div className="text-[11px] text-[#555]">{fd.calories_per_serving} kcal</div></div><Clock className="w-4 h-4 text-[#444]" /></button>))}</div>)}
        </div>
      </div>
    </div>
  );
}
