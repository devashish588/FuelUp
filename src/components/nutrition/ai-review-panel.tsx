'use client';
import { useMemo, useState } from 'react';
import { Pencil, Check, AlertTriangle, HelpCircle, Search, X } from 'lucide-react';
import { useCalorieStore } from '@/stores/calorie-store';
import {
  applyFoodSelection,
  buildFoodPreview,
  confirmAiReview,
  type ResolvedFoodItem,
} from '@/lib/ai/resolve';
import { availableUnitsFor } from '@/lib/calculations/quantity';
import type { FoodItem, MealType, QuantityUnit } from '@/lib/types';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function StatusIcon({ status }: { status: ResolvedFoodItem['status'] }) {
  if (status === 'resolved') return <Check className="w-4 h-4 text-[#10b981] shrink-0" aria-label="Matched" />;
  if (status === 'ambiguous') return <HelpCircle className="w-4 h-4 text-[#f59e0b] shrink-0" aria-label="Needs choice" />;
  return <AlertTriangle className="w-4 h-4 text-[#ea580c] shrink-0" aria-label="Needs attention" />;
}

/** Visual size hint from vision ("medium serving") — display only, the user confirms grams. */
function portionHintFor(item: ResolvedFoodItem): string | null {
  const hint = (item.candidate as unknown as { visualPortionHint?: unknown }).visualPortionHint;
  return typeof hint === 'string' && hint.trim() ? hint.trim() : null;
}

function FoodPicker({ rowKey, onPick, onCancel }: { rowKey: string; onPick: (food: FoodItem) => void; onCancel: () => void }) {
  const searchFoodItems = useCalorieStore((s) => s.searchFoodItems);
  const [q, setQ] = useState('');
  const results = q.trim().length >= 2 ? searchFoodItems(q.trim()).slice(0, 6) : [];
  return (
    <div className="mt-2 rounded-xl bg-[#101010] border border-[#222] p-2.5">
      <label htmlFor={`ai-pick-${rowKey}`} className="text-[11px] font-bold text-[#555] uppercase tracking-wider">
        Which one?
      </label>
      <div className="relative mt-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" />
        <input
          id={`ai-pick-${rowKey}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods and recipes…"
          aria-label="Search foods and recipes"
          className="dark-input pl-10"
          autoFocus
        />
      </div>
      {results.map((fd) => (
        <button
          key={fd.id}
          onClick={() => onPick(fd)}
          className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#1a1a1a] text-left"
        >
          <span className="text-[13px] text-[#EEE] truncate">
            {fd.name}
            {fd.source === 'recipe' ? <span className="text-[#888]"> · recipe</span> : null}
          </span>
          <Check className="w-4 h-4 text-[#f59e0b] shrink-0" />
        </button>
      ))}
      <button onClick={onCancel} className="w-full py-2 text-[12px] text-[#777] hover:text-white">
        Cancel
      </button>
    </div>
  );
}

export interface AiReviewPanelProps {
  items: ResolvedFoodItem[];
  onItemsChange: (items: ResolvedFoodItem[]) => void;
  meal: MealType;
  onMealChange: (meal: MealType) => void;
  notice: string | null;
  date: string;
  onConfirmed: () => void;
  onReset: () => void;
  title?: string;
}

/**
 * Shared meal review (Phase 8 text flow + Phase 9 vision flow).
 * Nutrition numbers come from the deterministic engine via buildFoodPreview;
 * confirmAiReview is the ONLY path to FoodLog. Nothing persists before confirm.
 */
export function AiReviewPanel({
  items,
  onItemsChange,
  meal,
  onMealChange,
  notice,
  date,
  onConfirmed,
  onReset,
  title = 'Review meal',
}: AiReviewPanelProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const preview = useMemo(() => buildFoodPreview(items, meal), [items, meal]);
  const previewByKey = useMemo(() => new Map(preview.rows.map((r) => [r.key, r])), [preview]);

  const updateRow = (key: string, patch: Partial<Pick<ResolvedFoodItem, 'quantity' | 'unit'>>) =>
    onItemsChange(items.map((r) => (r.key === key ? { ...r, ...patch, quantitySource: 'ai' as const } : r)));

  const pickFood = (key: string, food: FoodItem) => {
    onItemsChange(items.map((r) => (r.key === key ? applyFoodSelection(r, food) : r)));
    setPicking(null);
  };

  const removeRow = (key: string) => onItemsChange(items.filter((r) => r.key !== key));

  const confirm = () => {
    if (!preview.allValid) return;
    const { logged } = confirmAiReview(preview, {
      date,
      meal,
      addLog: useCalorieStore.getState().addFoodLog,
    });
    if (logged > 0) onConfirmed();
  };

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-white">{title}</h3>
        <button onClick={onReset} className="text-[12px] text-[#777] hover:text-white flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Start over
        </button>
      </div>
      {notice && (
        <p role="status" className="text-[12px] text-[#10b981]">
          {notice}
        </p>
      )}
      {items.map((item) => {
        const row = previewByKey.get(item.key);
        const units = item.selectedFood ? availableUnitsFor(item.selectedFood) : (['g'] as QuantityUnit[]);
        const needsPick = !item.selectedFood;
        const portionHint = portionHintFor(item);
        return (
          <div key={item.key} className="rounded-xl bg-[#161616] border border-[#222] p-2.5">
            <div className="flex items-center gap-2">
              <StatusIcon status={item.status} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[#EEE] truncate">
                  {item.selectedFood ? item.selectedFood.name : `“${item.candidate.name}”`}
                </div>
                <div className="text-[11px] text-[#555]">
                  {item.status === 'resolved' && item.selectedFood ? 'Matched' : null}
                  {item.status === 'ambiguous' ? 'Which one? Pick below.' : null}
                  {item.status === 'unresolved' ? 'No close match — pick or search.' : null}
                  {item.status === 'unsupported' ? 'No nutrition data yet — pick manually.' : null}
                  {item.preparationHint ? ` · ${item.preparationHint}` : null}
                  {portionHint ? ` · AI saw: ${portionHint} — confirm below` : null}
                  {item.quantitySource === 'suggested' && item.enteredUnit
                    ? ` · ~${item.candidate.quantity} ${item.enteredUnit} mapped to serving`
                    : null}
                </div>
              </div>
              {item.selectedFood && (
                <button
                  onClick={() => setPicking(picking === item.key ? null : item.key)}
                  aria-label={`Change food for ${item.selectedFood.name}`}
                  className="w-9 h-9 flex items-center justify-center shrink-0 text-[#777] hover:text-white"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => removeRow(item.key)}
                aria-label={`Remove ${item.selectedFood?.name ?? item.candidate.name}`}
                className="w-9 h-9 flex items-center justify-center shrink-0 text-[#777] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {(needsPick || picking === item.key) && (
              <FoodPicker
                rowKey={item.key}
                onPick={(food) => pickFood(item.key, food)}
                onCancel={() => setPicking(null)}
              />
            )}
            {!needsPick && picking !== item.key && item.selectedFood && (
              <div className="flex gap-2 mt-2">
                <div className="flex-1">
                  <label htmlFor={`ai-qty-${item.key}`} className="sr-only">
                    Quantity for {item.selectedFood.name}
                  </label>
                  <input
                    id={`ai-qty-${item.key}`}
                    type="number"
                    inputMode="decimal"
                    value={item.quantity ?? ''}
                    onChange={(e) =>
                      updateRow(item.key, { quantity: e.target.value === '' ? null : parseFloat(e.target.value) })
                    }
                    placeholder={item.quantitySource === 'missing' ? 'How much?' : 'Qty'}
                    className="dark-input"
                  />
                </div>
                <div>
                  <label htmlFor={`ai-unit-${item.key}`} className="sr-only">
                    Unit for {item.selectedFood.name}
                  </label>
                  <select
                    id={`ai-unit-${item.key}`}
                    value={item.unit && units.includes(item.unit) ? item.unit : units[0]}
                    onChange={(e) => updateRow(item.key, { unit: e.target.value as QuantityUnit })}
                    className="dark-input w-[100px] shrink-0"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {needsPick && item.matches.length > 0 && (
              <div className="mt-2 space-y-1">
                {item.matches.map((m) => (
                  <button
                    key={m.food.id}
                    onClick={() => pickFood(item.key, m.food)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#1a1a1a] text-left"
                  >
                    <span className="text-[12px] text-[#AAA] truncate">
                      {m.food.name}
                      {m.food.source === 'recipe' ? <span className="text-[#555]"> · your recipe</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {row?.nutrition && (
              <p className="text-[11px] text-[#555] mt-1.5">
                {Math.round(row.nutrition.calories)} kcal · P {row.nutrition.protein_g.toFixed(1)}g · C{' '}
                {row.nutrition.carbs_g.toFixed(1)}g · F {row.nutrition.fat_g.toFixed(1)}g
              </p>
            )}
            {row?.error && <p className="text-[11px] text-[#ea580c] mt-1.5">{row.error}</p>}
          </div>
        );
      })}

      <div>
        <label htmlFor="ai-meal" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">
          Meal
        </label>
        <select id="ai-meal" value={meal} onChange={(e) => onMealChange(e.target.value as MealType)} className="dark-input mt-1">
          {MEALS.map((m) => (
            <option key={m} value={m} className="capitalize">
              {m[0].toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {preview.totals && (
        <div className="rounded-xl bg-[#161616] border border-[#222] p-3">
          <div className="text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Totals (FuelUp calculated)</div>
          <div className="text-[12px] text-[#AAA]">
            <span className="font-bold text-white text-[16px]">{Math.round(preview.totals.calories)} kcal</span>
            {' '}· P {preview.totals.protein_g.toFixed(1)}g · C {preview.totals.carbs_g.toFixed(1)}g · F{' '}
            {preview.totals.fat_g.toFixed(1)}g
          </div>
        </div>
      )}

      <button
        onClick={confirm}
        disabled={!preview.allValid}
        className="w-full gradient-btn py-3 min-h-[48px] disabled:opacity-40"
      >
        Add to Food Log
      </button>
      {!preview.allValid && (
        <p className="text-[11px] text-[#555]">Resolve every item above to enable saving. Nothing is saved until you confirm.</p>
      )}
    </div>
  );
}
