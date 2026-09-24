'use client';
import { useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useCalorieStore } from '@/stores/calorie-store';
import { previewRecipeDraft, useRecipeStore, type RecipeDraft } from '@/stores/recipe-store';
import { availableUnitsFor, defaultUnitFor } from '@/lib/calculations/quantity';
import { roundNutrientsForDisplay } from '@/lib/calculations/nutrition';
import type { FoodItem, QuantityUnit, RecipeYieldUnit } from '@/lib/types';

interface BuilderIngredientRow {
  key: string;
  food_id: string;
  quantity: string;
  quantity_unit: QuantityUnit;
  notes: string;
}

export function RecipeBuilderModal({ recipeId, onClose }: { recipeId: string | null; onClose: () => void }) {
  const { foodItems, searchFoodItems } = useCalorieStore();
  const { recipes, getIngredients, saveRecipe } = useRecipeStore();

  const existing = recipeId ? recipes.find((r) => r.id === recipeId) : undefined;
  const existingRows = recipeId ? getIngredients(recipeId) : [];

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [preparation, setPreparation] = useState(existing?.preparation ?? '');
  const [yieldQty, setYieldQty] = useState(existing ? String(existing.yield_quantity) : '');
  const [yieldUnit, setYieldUnit] = useState<RecipeYieldUnit>(existing?.yield_unit ?? 'g');
  const [servingQty, setServingQty] = useState(existing?.serving_quantity != null ? String(existing.serving_quantity) : '');
  const [servingDesc, setServingDesc] = useState(existing?.serving_description ?? '');
  const [rows, setRows] = useState<BuilderIngredientRow[]>(
    existingRows.map((r, i) => ({
      key: `${r.id}-${i}`,
      food_id: r.food_id,
      quantity: String(r.quantity),
      quantity_unit: r.quantity_unit,
      notes: r.notes,
    }))
  );
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(foodItems.map((f) => [f.id, f])), [foodItems]);
  const results = useMemo(() => (search.trim().length >= 2 ? searchFoodItems(search.trim()) : []), [search, searchFoodItems]);

  const draft: RecipeDraft = useMemo(
    () => ({
      name,
      description,
      category,
      preparation,
      yield_quantity: parseFloat(yieldQty) || 0,
      yield_unit: yieldUnit,
      serving_quantity: servingQty.trim() === '' ? null : parseFloat(servingQty) || null,
      serving_description: servingDesc,
      ingredients: rows.map((r) => ({
        food_id: r.food_id,
        quantity: parseFloat(r.quantity) || 0,
        quantity_unit: r.quantity_unit,
        notes: r.notes,
      })),
    }),
    [name, description, category, preparation, yieldQty, yieldUnit, servingQty, servingDesc, rows]
  );

  const preview = useMemo(() => previewRecipeDraft(draft, foodItems), [draft, foodItems]);
  const per100 = preview.per100 ? roundNutrientsForDisplay({ ...preview.per100 }) : null;

  const addIngredient = (food: FoodItem) => {
    setRows((s) => [...s, {
      key: `${food.id}-${Date.now()}-${s.length}`,
      food_id: food.id,
      quantity: String(food.serving_size),
      quantity_unit: defaultUnitFor(food),
      notes: '',
    }]);
    setSearch('');
  };

  const updateRow = (key: string, patch: Partial<BuilderIngredientRow>) =>
    setRows((s) => s.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) => setRows((s) => s.filter((r) => r.key !== key));

  const save = () => {
    const result = saveRecipe(recipeId, draft);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#111111] border border-[#1a1a1a] rounded-t-2xl lg:rounded-2xl shadow-2xl slide-up max-h-[85vh] flex flex-col max-lg:pb-safe" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <h3 className="text-[16px] font-bold text-white">{existing ? 'Edit recipe' : 'New recipe'}</h3>
          <button onClick={onClose} aria-label="Close recipe builder" className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center hover:bg-[#222222]"><X className="w-4 h-4 text-[#777]" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label htmlFor="recipe-name" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">Name</label>
            <input id="recipe-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chicken Curry" autoFocus className="dark-input mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="recipe-category" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">Category</label>
              <select id="recipe-category" value={category} onChange={e => setCategory(e.target.value)} className="dark-input mt-1" aria-label="Recipe category">
                <option value="">None…</option>
                <option value="curry">Curry</option>
                <option value="dal">Dal / legumes</option>
                <option value="rice">Rice / grains</option>
                <option value="breakfast">Breakfast</option>
                <option value="snack">Snack</option>
                <option value="sauce">Sauce</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="recipe-prep" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">Preparation</label>
              <input id="recipe-prep" value={preparation} onChange={e => setPreparation(e.target.value)} placeholder="e.g. curry" className="dark-input mt-1" />
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Ingredients</div>
            {rows.length === 0 && (
              <p className="text-[12px] text-[#555] py-2">No ingredients yet — search below to add.</p>
            )}
            {rows.map((row) => {
              const food = byId.get(row.food_id);
              const units = food ? availableUnitsFor(food) : (['g', 'kg', 'ml', 'L', 'count', 'serving'] as QuantityUnit[]);
              return (
                <div key={row.key} className="rounded-xl bg-[#161616] border border-[#222] p-2.5 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[#EEE] truncate">{food?.name ?? row.food_id}</div>
                      {!food && <div className="text-[11px] text-[#ea580c]">Original food unavailable — pick a replacement or remove.</div>}
                    </div>
                    <button onClick={() => removeRow(row.key)} aria-label={`Remove ${food?.name ?? 'ingredient'}`} className="w-9 h-9 flex items-center justify-center shrink-0 text-[#777] hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={e => updateRow(row.key, { quantity: e.target.value })}
                      aria-label={`Quantity for ${food?.name ?? 'ingredient'}`}
                      placeholder="Qty"
                      className="dark-input flex-1"
                    />
                    <select
                      value={units.includes(row.quantity_unit) ? row.quantity_unit : units[0]}
                      onChange={e => updateRow(row.key, { quantity_unit: e.target.value as QuantityUnit })}
                      aria-label={`Unit for ${food?.name ?? 'ingredient'}`}
                      className="dark-input w-[100px] shrink-0"
                    >
                      {units.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search foods to add…" aria-label="Search foods to add" className="dark-input pl-10" />
            </div>
            {results.slice(0, 6).map(fd => (
              <button key={fd.id} onClick={() => addIngredient(fd)} className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[#1a1a1a] text-left">
                <span className="text-[13px] text-[#EEE] truncate">{fd.name}</span>
                <Plus className="w-4 h-4 text-[#f59e0b] shrink-0" />
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="recipe-yield" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">Cooked yield *</label>
              <div className="flex gap-2 mt-1">
                <input id="recipe-yield" type="number" inputMode="decimal" value={yieldQty} onChange={e => setYieldQty(e.target.value)} placeholder="760" className="dark-input flex-1" />
                <select value={yieldUnit} onChange={e => setYieldUnit(e.target.value as RecipeYieldUnit)} aria-label="Yield unit" className="dark-input w-[80px] shrink-0">
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="recipe-serving" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">Serving (optional)</label>
              <input id="recipe-serving" type="number" inputMode="decimal" value={servingQty} onChange={e => setServingQty(e.target.value)} placeholder="190" className="dark-input mt-1" />
            </div>
          </div>
          <input value={servingDesc} onChange={e => setServingDesc(e.target.value)} placeholder="Serving hint, e.g. 1 bowl ≈ 190 g" aria-label="Serving description" className="dark-input" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes (optional)" aria-label="Recipe notes" className="dark-input" />

          <div className="rounded-xl bg-[#161616] border border-[#222] p-3">
            <div className="text-[11px] font-bold text-[#555] uppercase tracking-wider mb-1">Nutrition preview</div>
            {per100 ? (
              <div className="text-[12px] text-[#AAA]">
                Total ≈ <span className="font-bold text-white">{Math.round(preview.totals.calories)} kcal</span>
                {' '}· per 100{yieldUnit} <span className="font-bold text-white">{per100.calories} kcal</span>
                {' '}· P {per100.protein_g}g · C {per100.carbs_g}g · F {per100.fat_g}g
                {preview.totals.is_estimated ? <span className="text-[#f59e0b]"> · estimated</span> : ''}
              </div>
            ) : (
              <p className="text-[12px] text-[#555]">Enter ingredients and a cooked yield to preview.</p>
            )}
            {preview.totals.unresolved.length > 0 && (
              <p className="mt-1 text-[12px] text-[#ea580c]">
                {preview.totals.unresolved.length} ingredient{preview.totals.unresolved.length === 1 ? '' : 's'} couldn’t be calculated — check quantities.
              </p>
            )}
          </div>

          {error && <p className="text-[12px] text-[#ea580c]">{error}</p>}
        </div>

        <div className="p-4 border-t border-[#1a1a1a] sticky bottom-0 bg-[#111111] max-lg:pb-safe">
          <button onClick={save} className="w-full gradient-btn py-3 min-h-[48px]">
            Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}
