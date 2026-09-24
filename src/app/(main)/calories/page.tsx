'use client';
import { useState, useMemo } from 'react';
import { Plus, ChevronLeft, ChevronRight, Search, X, Clock, Sunrise, Sun, Moon, Coffee, Flame, Apple, Star, Pencil, Copy, ChefHat, Sparkles } from 'lucide-react';
import { Card, SectionLabel, StatNumber, ProgressBar, EmptyState } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/header';
import { RecipeBuilderModal } from '@/components/nutrition/recipe-builder';
import { AiFoodLogger } from '@/components/nutrition/ai-food-logger';
import { TargetBasisLabel } from '@/components/nutrition/target-basis-label';
import { useCalorieStore } from '@/stores/calorie-store';
import { useRecipeStore } from '@/stores/recipe-store';
import { useProfileStore } from '@/stores/profile-store';
import { toDateString, formatDate, cn } from '@/lib/utils';
import { MEAL_TYPES } from '@/lib/constants';
import { LOCAL_OWNER_ID } from '@/config/app';
import { availableUnitsFor, calculateNutritionForQuantity, defaultUnitFor, estimatePrefix, formatQuantity, roundNutrientsForDisplay } from '@/features/nutrition';
import { subDays, addDays, parseISO, isToday as isTodayFn } from 'date-fns';
import type { FoodItem, FoodLog, MealType, QuantityUnit } from '@/lib/types';

const MI: Record<string, React.ElementType> = { breakfast: Sunrise, lunch: Sun, dinner: Moon, snack: Coffee };
const MC: Record<string, string> = { breakfast: '#f59e0b', lunch: '#ea580c', dinner: '#888', snack: '#AAA' };

export default function CaloriesPage() {
  const [date, setDate] = useState(toDateString());
  const [modal, setModal] = useState(false);
  const [meal, setMeal] = useState<MealType>('breakfast');
  const [open, setOpen] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<FoodLog | null>(null);
  const profile = useProfileStore(s => s.profile);
  const { getDailySummary, getLogsByMealType, getMealNutrition, removeFoodLog, duplicateFoodLog } = useCalorieStore();
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

  const openAdd = (m: MealType) => { setEditing(null); setMeal(m); setModal(true); };
  const openEdit = (log: FoodLog) => { setEditing(log); setMeal(log.meal_type); setModal(true); };

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
                {isToday && <div className="mt-1"><TargetBasisLabel /></div>}
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
              const mealTotal = getMealNutrition(date, value);
              const cal = mealTotal.calories;
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
                      <button onClick={e => { e.stopPropagation(); openAdd(value); }}
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
                          <div className="flex items-center gap-3 min-w-0">
                            <Apple className="w-4 h-4 text-[#444] shrink-0" />
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-[#EEE] truncate">
                                {log.is_estimated ? <span title="Estimated nutrition">≈ </span> : null}{log.food_name || log.food_item?.name || 'Food'}
                              </div>
                              <div className="text-[11px] text-[#555]">
                                {describeLogQuantity(log)} · P:{Math.round(log.protein_g)}g C:{Math.round(log.carbs_g)}g F:{Math.round(log.fat_g)}g
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[14px] font-bold text-[#AAA] mr-1">{Math.round(log.calories)}</span>
                            <button onClick={() => openEdit(log)} aria-label="Edit log" className="w-6 h-6 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 bg-[rgba(245,158,11,0.1)] text-[#f59e0b] flex items-center justify-center p-2 -m-2 lg:p-0 lg:m-0"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => duplicateFoodLog(log.id)} aria-label="Log again" className="w-6 h-6 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 bg-[rgba(245,158,11,0.1)] text-[#f59e0b] hidden sm:flex items-center justify-center p-2 -m-2 lg:p-0 lg:m-0"><Copy className="w-3 h-3" /></button>
                            <button onClick={() => removeFoodLog(log.id)} aria-label="Remove log" className="w-6 h-6 rounded-lg opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 bg-[rgba(228,88,38,0.1)] text-[#ea580c] flex items-center justify-center p-2 -m-2 lg:p-0 lg:m-0"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && logs.length === 0 && (
                    <div className="border-t border-[#1a1a1a]">
                      <EmptyState icon={Apple} message="No foods logged" action="+ Add food" onAction={() => openAdd(value)} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>
      {modal && <AddModal meal={meal} date={date} editing={editing} onClose={() => { setModal(false); setEditing(null); }} onMealChange={setMeal} />}
    </div>
  );
}

function describeLogQuantity(log: FoodLog): string {
  if (log.quantity != null && log.quantity_unit) return formatQuantity(log.quantity, log.quantity_unit);
  return `${Math.round(log.servings * 10) / 10} serving`;
}

type Tab = 'search' | 'manual' | 'recent' | 'favorites' | 'recipes' | 'ai';

function AddModal({ meal, date, editing, onClose, onMealChange }: {
  meal: MealType; date: string; editing: FoodLog | null; onClose: () => void; onMealChange: (m: MealType) => void;
}) {
  const {
    searchFoodItems, addFoodLog, addFoodItem, getRecentFoods,
    getFavoriteFoods, isFavorite, toggleFavorite, updateFoodLog, foodItems, foodLogs,
  } = useCalorieStore();
  const { recipes, getIngredients, removeRecipe, duplicateRecipe } = useRecipeStore();
  const [builder, setBuilder] = useState<{ open: boolean; recipeId: string | null }>({ open: false, recipeId: null });
  const [tab, setTab] = useState<Tab>('search');
  const [q, setQ] = useState('');
  // Legacy logs may lack an embedded snapshot — resolve via the catalog.
  const editingFood = editing?.food_item ?? foodItems.find(f => f.id === editing?.food_item_id) ?? null;
  const [picked, setPicked] = useState<FoodItem | null>(editingFood);
  const [qty, setQty] = useState(
    editing?.quantity != null ? String(editing.quantity) : editing ? String(editing.servings) : ''
  );
  const [unit, setUnit] = useState<QuantityUnit>(
    // Legacy logs store servings only — keep the prefilled value coherent.
    editing?.quantity_unit ?? (editing?.quantity != null && editingFood ? defaultUnitFor(editingFood) : 'serving')
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [f, setF] = useState({
    name: '', brand: '', basisQty: '100', basisUnit: 'g' as QuantityUnit,
    cal: '', pro: '', carb: '', fat: '', fiber: '', sugar: '', sodium: '',
    countWeight: '', category: '', state: '', servingDesc: '', estimated: false,
  });
  const res = useMemo(() => q.length >= 2 ? searchFoodItems(q) : [], [q, searchFoodItems]);
  const rec = useMemo(() => getRecentFoods(), [getRecentFoods]);
  const favs = useMemo(() => getFavoriteFoods(), [getFavoriteFoods]);
  // Last-used date per recipe (from logs) for the My Recipes list.
  const lastUsedByFood = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of foodLogs) {
      const prev = map.get(l.food_item_id);
      if (!prev || l.date > prev) map.set(l.food_item_id, l.date);
    }
    return map;
  }, [foodLogs]);
  const recipeItems = useMemo(
    () => foodItems.filter((f) => f.source === 'recipe'),
    [foodItems]
  );

  const preview = useMemo(() => {
    if (!picked) return null;
    const parsed = parseFloat(qty);
    if (!Number.isFinite(parsed)) return null;
    const result = calculateNutritionForQuantity(picked, parsed, unit);
    return result.ok ? roundNutrientsForDisplay(result.nutrition) : null;
  }, [picked, qty, unit]);
  const previewError = useMemo(() => {
    if (!picked || qty === '') return null;
    const parsed = parseFloat(qty);
    if (!Number.isFinite(parsed)) return 'Enter a valid quantity.';
    const result = calculateNutritionForQuantity(picked, parsed, unit);
    return result.ok ? null : result.reason;
  }, [picked, qty, unit]);

  const pickFood = (food: FoodItem) => {
    setPicked(food);
    setUnit(defaultUnitFor(food));
    setQty(editing && editing.food_item_id === food.id && editing.quantity != null ? String(editing.quantity) : String(food.serving_size));
    setFormError(null);
    setTab('search');
  };

  const submit = () => {
    if (!picked) return;
    const parsed = parseFloat(qty);
    const result = calculateNutritionForQuantity(picked, parsed || 0, unit);
    if (!result.ok) {
      setFormError(result.reason);
      return;
    }
    const n = result.nutrition;
    if (editing) {
      updateFoodLog(editing.id, {
        food_item_id: picked.id,
        food_item: picked,
        food_name: picked.name,
        is_estimated: picked.is_estimated ?? false,
        meal_type: meal,
        quantity: parsed,
        quantity_unit: unit,
        servings: n.servings,
        calories: n.calories,
        protein_g: n.protein_g,
        carbs_g: n.carbs_g,
        fat_g: n.fat_g,
        fiber_g: n.fiber_g,
        sugar_g: n.sugar_g,
        sodium_mg: n.sodium_mg,
      });
    } else {
      addFoodLog({
        user_id: LOCAL_OWNER_ID,
        food_item_id: picked.id,
        food_item: picked,
        food_name: picked.name,
        is_estimated: picked.is_estimated ?? false,
        date,
        meal_type: meal,
        quantity: parsed,
        quantity_unit: unit,
        servings: n.servings,
        calories: n.calories,
        protein_g: n.protein_g,
        carbs_g: n.carbs_g,
        fat_g: n.fat_g,
        fiber_g: n.fiber_g,
        sugar_g: n.sugar_g,
        sodium_mg: n.sodium_mg,
        notes: '',
      });
    }
    onClose();
  };

  const createManualFood = () => {
    const c = parseFloat(f.cal) || 0;
    if (!f.name.trim() || c <= 0) {
      setFormError('Give the food a name and calories greater than zero.');
      return;
    }
    const basisQty = parseFloat(f.basisQty) || 0;
    if (basisQty <= 0) {
      setFormError('Nutrition basis quantity must be greater than zero.');
      return;
    }
    const food = addFoodItem({
      name: f.name.trim(),
      brand: f.brand.trim(),
      serving_size: basisQty,
      serving_unit: f.basisUnit,
      calories_per_serving: c,
      protein_g: parseFloat(f.pro) || 0,
      carbs_g: parseFloat(f.carb) || 0,
      fat_g: parseFloat(f.fat) || 0,
      fiber_g: parseFloat(f.fiber) || 0,
      sugar_g: f.sugar === '' ? null : parseFloat(f.sugar) || 0,
      sodium_mg: f.sodium === '' ? null : parseFloat(f.sodium) || 0,
      count_weight_g: f.countWeight === '' ? null : parseFloat(f.countWeight) || null,
      category: f.category.trim() || 'other',
      source: 'user',
      source_id: null,
      aliases: [],
      food_state: (f.state || '') as '' | 'raw' | 'cooked' | 'prepared',
      preparation: '',
      serving_description: f.servingDesc.trim(),
      is_estimated: f.estimated,
      barcode: null,
      is_custom: true,
      created_by: null,
    });
    setPicked(food);
    setUnit(defaultUnitFor(food));
    setQty(String(basisQty));
    setFormError(null);
  };

  const renderFoodRow = (fd: FoodItem) => {
    const fav = isFavorite(fd.id);
    return (
      <div key={fd.id} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] text-left mb-1 gap-2">
        <button onClick={() => pickFood(fd)} className="flex-1 min-w-0 text-left">
          <div className="text-[14px] font-medium text-[#EEE] truncate">
            {estimatePrefix(fd.is_estimated)}{fd.name}
          </div>
          <div className="text-[11px] text-[#555]">
            {fd.serving_description || `per ${fd.serving_size} ${fd.serving_unit}`} · P:{fd.protein_g}g C:{fd.carbs_g}g F:{fd.fat_g}g
          </div>
        </button>
        <span className="text-[16px] font-extrabold text-[#f59e0b] shrink-0">{fd.calories_per_serving}</span>
        <button
          onClick={() => toggleFavorite(fd.id)}
          aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
          className="w-9 h-9 -m-1 flex items-center justify-center shrink-0"
        >
          <Star className={cn('w-4 h-4', fav ? 'text-[#f59e0b] fill-[#f59e0b]' : 'text-[#444]')} />
        </button>
      </div>
    );
  };

  const pickedInfo = picked ? (
    <div className="rounded-xl bg-[#161616] border border-[#222] p-3 mb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-white truncate">
            {estimatePrefix(picked.is_estimated)}{picked.name}
          </div>
          <div className="text-[11px] text-[#555]">
            {picked.serving_description || `per ${picked.serving_size} ${picked.serving_unit}`}
            {picked.is_estimated ? ' · estimated' : ''}
          </div>
        </div>
        {!editing && (
          <button onClick={() => setPicked(null)} className="text-[11px] font-semibold text-[#777] hover:text-white shrink-0 px-2 py-2">Change</button>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <input
          type="number"
          inputMode="decimal"
          value={qty}
          onChange={e => setQty(e.target.value)}
          placeholder="Quantity"
          aria-label="Quantity"
          className="dark-input flex-1"
        />
        <select
          value={unit}
          onChange={e => setUnit(e.target.value as QuantityUnit)}
          aria-label="Unit"
          className="dark-input w-[110px] shrink-0"
        >
          {availableUnitsFor(picked).map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Meal</div>
        <div className="grid grid-cols-4 gap-1.5">
          {MEAL_TYPES.map(m => (
            <button
              key={m.value}
              onClick={() => onMealChange(m.value)}
              className={cn('py-2 rounded-lg text-[11px] font-semibold border',
                meal === m.value ? 'gradient-btn border-transparent' : 'bg-[#1a1a1a] text-[#AAA] border-[#222222]')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {preview && (
        <div className="mt-3 text-[12px] text-[#AAA]">
          ≈ <span className="font-bold text-white">{preview.calories} kcal</span>
          {' '}· P {preview.protein_g}g · C {preview.carbs_g}g · F {preview.fat_g}g
          {preview.fiber_g != null && preview.fiber_g > 0 ? ` · Fiber ${preview.fiber_g}g` : ''}
        </div>
      )}
      {(previewError || formError) && (
        <p className="mt-2 text-[12px] text-[#ea580c]">{formError ?? previewError}</p>
      )}
      <button onClick={submit} disabled={!preview} className="w-full gradient-btn py-3 mt-3 disabled:opacity-40">
        {editing ? 'Save changes' : 'Add food'}
      </button>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#111111] border border-[#1a1a1a] rounded-t-2xl lg:rounded-2xl shadow-2xl slide-up max-h-[85vh] flex flex-col max-lg:pb-safe" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <h3 className="text-[16px] font-bold text-white">{editing ? 'Edit food' : 'Add Food'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-[#222222]"><X className="w-4 h-4 text-[#777]" /></button>
        </div>
        <div className="flex border-b border-[#1a1a1a]">
          {[
            { k: 'search' as const, l: 'Search', i: Search },
            { k: 'manual' as const, l: 'Manual', i: Plus },
            { k: 'recent' as const, l: 'Recent', i: Clock },
            { k: 'favorites' as const, l: 'Saved', i: Star },
            { k: 'recipes' as const, l: 'Recipes', i: ChefHat },
            { k: 'ai' as const, l: 'AI', i: Sparkles },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} className={cn('flex-1 py-3 text-[12px] font-bold flex items-center justify-center gap-1.5',
              tab === t.k ? 'text-[#f59e0b] border-b-2 border-[#f59e0b]' : 'text-[#555]')}><t.i className="w-3.5 h-3.5" />{t.l}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {pickedInfo}
          {tab === 'search' && !picked && (<div><div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search foods, e.g. roti, dal, egg…" autoFocus className="dark-input pl-10" /></div>
            {res.map(renderFoodRow)}
            {q.length >= 2 && res.length === 0 && <p className="text-center text-[13px] text-[#555] py-8">No results. Try manual entry.</p>}</div>)}
          {tab === 'manual' && !picked && (<div className="space-y-3">
            <input placeholder="Food name *" value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} className="dark-input" />
            <input placeholder="Brand (optional)" value={f.brand} onChange={e => setF(x => ({ ...x, brand: e.target.value }))} className="dark-input" />
            <div>
              <div className="text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Nutrition per</div>
              <div className="flex gap-2">
                <input type="number" inputMode="decimal" placeholder="100" value={f.basisQty} onChange={e => setF(x => ({ ...x, basisQty: e.target.value }))} className="dark-input flex-1" aria-label="Basis quantity" />
                <select value={f.basisUnit} onChange={e => setF(x => ({ ...x, basisUnit: e.target.value as QuantityUnit }))} className="dark-input w-[110px] shrink-0" aria-label="Basis unit">
                  {(['g', 'ml', 'count', 'serving'] as QuantityUnit[]).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" inputMode="decimal" placeholder="Calories *" value={f.cal} onChange={e => setF(x => ({ ...x, cal: e.target.value }))} className="dark-input" />
              <input type="number" inputMode="decimal" placeholder="Fiber (g)" value={f.fiber} onChange={e => setF(x => ({ ...x, fiber: e.target.value }))} className="dark-input" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input type="number" inputMode="decimal" placeholder="Protein (g)" value={f.pro} onChange={e => setF(x => ({ ...x, pro: e.target.value }))} className="dark-input" />
              <input type="number" inputMode="decimal" placeholder="Carbs (g)" value={f.carb} onChange={e => setF(x => ({ ...x, carb: e.target.value }))} className="dark-input" />
              <input type="number" inputMode="decimal" placeholder="Fat (g)" value={f.fat} onChange={e => setF(x => ({ ...x, fat: e.target.value }))} className="dark-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" inputMode="decimal" placeholder="Sugar (g, optional)" value={f.sugar} onChange={e => setF(x => ({ ...x, sugar: e.target.value }))} className="dark-input" />
              <input type="number" inputMode="decimal" placeholder="Sodium (mg, optional)" value={f.sodium} onChange={e => setF(x => ({ ...x, sodium: e.target.value }))} className="dark-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={f.category} onChange={e => setF(x => ({ ...x, category: e.target.value }))} className="dark-input" aria-label="Category">
                <option value="">Category…</option>
                <option value="staples">Staples</option>
                <option value="protein">Protein</option>
                <option value="legumes">Legumes</option>
                <option value="dairy">Dairy</option>
                <option value="produce">Produce</option>
                <option value="fats">Fats &amp; nuts</option>
                <option value="other">Other</option>
              </select>
              <select value={f.state} onChange={e => setF(x => ({ ...x, state: e.target.value }))} className="dark-input" aria-label="Food state">
                <option value="">State…</option>
                <option value="raw">Raw</option>
                <option value="cooked">Cooked</option>
                <option value="prepared">Prepared</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="1 pc weight in g (for count)" type="number" inputMode="decimal" value={f.countWeight} onChange={e => setF(x => ({ ...x, countWeight: e.target.value }))} className="dark-input" />
              <input placeholder="Serving hint, e.g. 1 bowl" value={f.servingDesc} onChange={e => setF(x => ({ ...x, servingDesc: e.target.value }))} className="dark-input" />
            </div>
            <label className="flex items-center gap-2 text-[12px] text-[#AAA]">
              <input type="checkbox" checked={f.estimated} onChange={e => setF(x => ({ ...x, estimated: e.target.checked }))} className="w-4 h-4 accent-[#f59e0b]" />
              Approximate values (shows ≈)
            </label>
            {formError && <p className="text-[12px] text-[#ea580c]">{formError}</p>}
            <button onClick={createManualFood} className="w-full gradient-btn py-3">Save to My Foods</button>
          </div>)}
          {tab === 'recent' && !picked && (<div>{rec.length === 0 ? <p className="text-center text-[13px] text-[#555] py-8">No recent foods.</p> : rec.map(fd => (
            <button key={fd.id} onClick={() => pickFood(fd)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] text-left mb-1"><div className="min-w-0"><div className="text-[14px] font-medium text-[#EEE] truncate">{estimatePrefix(fd.is_estimated)}{fd.name}</div><div className="text-[11px] text-[#555]">{fd.calories_per_serving} kcal</div></div><Clock className="w-4 h-4 text-[#444] shrink-0" /></button>))}</div>)}
          {tab === 'favorites' && !picked && (<div>{favs.length === 0 ? <p className="text-center text-[13px] text-[#555] py-8">No saved foods yet — tap ☆ on any food.</p> : favs.map(fd => (
            <button key={fd.id} onClick={() => pickFood(fd)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] text-left mb-1"><div className="min-w-0"><div className="text-[14px] font-medium text-[#EEE] truncate">{estimatePrefix(fd.is_estimated)}{fd.name}</div><div className="text-[11px] text-[#555]">{fd.calories_per_serving} kcal</div></div><Star className="w-4 h-4 text-[#f59e0b] fill-[#f59e0b] shrink-0" /></button>))}</div>)}
          {tab === 'recipes' && !picked && (
            <div>
              <button onClick={() => setBuilder({ open: true, recipeId: null })} className="w-full gradient-btn py-3 mb-3 min-h-[48px]">
                + New recipe
              </button>
              {recipes.length === 0 ? (
                <p className="text-center text-[13px] text-[#555] py-8">No recipes yet — save your home-cooked meals to log them in seconds.</p>
              ) : (
                recipes.map(r => {
                  const item = recipeItems.find(f => f.id === r.id);
                  const ingCount = getIngredients(r.id).length;
                  const fav = isFavorite(r.id);
                  const lastUsed = lastUsedByFood.get(r.id);
                  return (
                    <div key={r.id} className="rounded-xl hover:bg-[#1a1a1a] p-3 mb-1 border border-transparent hover:border-[#222]">
                      <button onClick={() => item && pickFood(item)} disabled={!item} className="w-full flex items-center justify-between text-left gap-2 disabled:opacity-60">
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-[#EEE] truncate">
                            {estimatePrefix(r.is_estimated)}{r.name}
                          </div>
                          <div className="text-[11px] text-[#555]">
                            {item ? `${Math.round(item.calories_per_serving)} kcal / 100${item.serving_unit}` : 'calculating…'}
                            {' '}· {ingCount} ingredient{ingCount === 1 ? '' : 's'}
                            {lastUsed ? ` · last used ${lastUsed}` : ''}
                          </div>
                        </div>
                        <ChefHat className="w-4 h-4 text-[#f59e0b] shrink-0" />
                      </button>
                      <div className="flex items-center gap-1 mt-1">
                        <button onClick={() => toggleFavorite(r.id)} aria-label={fav ? `Unsave ${r.name}` : `Save ${r.name}`} className="min-h-[44px] px-2 flex items-center gap-1 text-[11px] font-semibold text-[#777]">
                          <Star className={cn('w-3.5 h-3.5', fav ? 'text-[#f59e0b] fill-[#f59e0b]' : 'text-[#555]')} />
                          {fav ? 'Saved' : 'Save'}
                        </button>
                        <button onClick={() => setBuilder({ open: true, recipeId: r.id })} aria-label={`Edit ${r.name}`} className="min-h-[44px] px-2 flex items-center gap-1 text-[11px] font-semibold text-[#777]">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button onClick={() => duplicateRecipe(r.id, `${r.name} (copy)`)} aria-label={`Duplicate ${r.name}`} className="min-h-[44px] px-2 flex items-center gap-1 text-[11px] font-semibold text-[#777]">
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </button>
                        <button onClick={() => { if (confirm(`Delete "${r.name}"? Logged meals stay intact.`)) removeRecipe(r.id); }} aria-label={`Delete ${r.name}`} className="min-h-[44px] px-2 flex items-center gap-1 text-[11px] font-semibold text-[#ea580c]">
                          <X className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {tab === 'ai' && !picked && (
            <AiFoodLogger date={date} onLogged={onClose} />
          )}
        </div>
      </div>
      {builder.open && (
        <RecipeBuilderModal recipeId={builder.recipeId} onClose={() => setBuilder({ open: false, recipeId: null })} />
      )}
    </div>
  );
}
