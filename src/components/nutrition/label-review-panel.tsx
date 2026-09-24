'use client';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useCalorieStore } from '@/stores/calorie-store';
import { buildLabelFoodDraft, type LabelFoodDraft } from '@/lib/ai/label';
import type { AiLabelCandidate } from '@/lib/ai/vision-schemas';
import type { QuantityUnit } from '@/lib/types';

const SERVING_UNITS: QuantityUnit[] = ['g', 'ml', 'serving', 'count'];

export function LabelReviewPanel({
  label,
  onReset,
}: {
  label: AiLabelCandidate;
  onReset: () => void;
}) {
  const addFoodItem = useCalorieStore((s) => s.addFoodItem);
  const initial: LabelFoodDraft = buildLabelFoodDraft(label);
  const [name, setName] = useState(initial.name);
  const [brand, setBrand] = useState(initial.brand);
  const [servingQty, setServingQty] = useState(String(initial.serving_size));
  const [servingUnit, setServingUnit] = useState<QuantityUnit>(initial.serving_unit);
  const [cal, setCal] = useState(initial.calories_per_serving === 0 ? '' : String(initial.calories_per_serving));
  const [pro, setPro] = useState(initial.protein_g === 0 ? '' : String(initial.protein_g));
  const [carb, setCarb] = useState(initial.carbs_g === 0 ? '' : String(initial.carbs_g));
  const [fat, setFat] = useState(initial.fat_g === 0 ? '' : String(initial.fat_g));
  const [fiber, setFiber] = useState(initial.fiber_g === 0 ? '' : String(initial.fiber_g));
  const [sugar, setSugar] = useState(initial.sugar_g === null ? '' : String(initial.sugar_g));
  const [sodium, setSodium] = useState(initial.sodium_mg === null ? '' : String(initial.sodium_mg));
  const [formError, setFormError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const save = () => {
    const basisQty = parseFloat(servingQty);
    const calories = parseFloat(cal);
    if (!name.trim()) {
      setFormError('Give the food a name.');
      return;
    }
    if (!(basisQty > 0)) {
      setFormError('Serving size must be greater than zero.');
      return;
    }
    if (!(calories > 0)) {
      setFormError('Calories must be greater than zero — check the label.');
      return;
    }
    const food = addFoodItem({
      name: name.trim(),
      brand: brand.trim(),
      serving_size: basisQty,
      serving_unit: servingUnit,
      calories_per_serving: calories,
      protein_g: parseFloat(pro) || 0,
      carbs_g: parseFloat(carb) || 0,
      fat_g: parseFloat(fat) || 0,
      fiber_g: parseFloat(fiber) || 0,
      sugar_g: sugar === '' ? null : parseFloat(sugar) || 0,
      sodium_mg: sodium === '' ? null : parseFloat(sodium) || 0,
      count_weight_g: null,
      category: 'other',
      source: brand.trim() ? 'branded' : 'user',
      source_id: null,
      aliases: [],
      food_state: '',
      preparation: '',
      serving_description: '',
      is_estimated: false,
      barcode: null,
      is_custom: true,
      created_by: null,
    });
    setSavedName(food.name);
    setFormError(null);
  };

  if (savedName) {
    return (
      <div className="space-y-3" aria-live="polite">
        <div className="rounded-xl bg-[#0e1a12] border border-[#1d3a26] p-4 flex items-start gap-2">
          <Check className="w-5 h-5 text-[#10b981] shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-bold text-white">Saved “{savedName}” to My Foods.</p>
            <p className="text-[12px] text-[#777] mt-1">
              No meal was logged — find it in Search when you&apos;re ready to log a quantity.
            </p>
          </div>
        </div>
        <button onClick={onReset} className="w-full py-3 min-h-[48px] rounded-xl bg-[#1a1a1a] text-[#AAA] border border-[#222] text-[13px] font-bold">
          Scan another label
        </button>
      </div>
    );
  }

  const input = 'dark-input';
  const lab = 'text-[11px] font-bold text-[#555] uppercase tracking-wider';
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-white">Review Nutrition Label</h3>
        <button onClick={onReset} className="text-[12px] text-[#777] hover:text-white flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Start over
        </button>
      </div>
      <p className="text-[11px] text-[#555] leading-relaxed">
        Review before saving — values come from the label photo and were not independently verified by FuelUp.
      </p>
      {initial.warnings.map((w) => (
        <p key={w} className="text-[11px] text-[#f59e0b] leading-relaxed">
          • {w}
        </p>
      ))}
      <div>
        <label htmlFor="label-name" className={lab}>Food</label>
        <input id="label-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Food name" className={`${input} mt-1`} />
      </div>
      <div>
        <label htmlFor="label-brand" className={lab}>Brand</label>
        <input id="label-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand (optional)" className={`${input} mt-1`} />
      </div>
      <div>
        <span className={lab} id="label-serving-group">Serving size</span>
        <div className="flex gap-2 mt-1" role="group" aria-labelledby="label-serving-group">
          <input id="label-serving-qty" type="number" inputMode="decimal" value={servingQty} onChange={(e) => setServingQty(e.target.value)} placeholder="40" className={`${input} flex-1`} aria-label="Serving quantity" />
          <select value={servingUnit} onChange={(e) => setServingUnit(e.target.value as QuantityUnit)} className={`${input} w-[110px] shrink-0`} aria-label="Serving unit">
            {SERVING_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>
      {(
        [
          ['label-cal', 'Calories', cal, setCal, '180'],
          ['label-pro', 'Protein (g)', pro, setPro, '8'],
          ['label-carb', 'Carbs (g)', carb, setCarb, '22'],
          ['label-fat', 'Fat (g)', fat, setFat, '7'],
          ['label-fiber', 'Fiber (g)', fiber, setFiber, '3'],
          ['label-sugar', 'Sugar (g)', sugar, setSugar, '5'],
          ['label-sodium', 'Sodium (mg)', sodium, setSodium, '140'],
        ] as const
      ).map(([id, labelText, value, setter, placeholder]) => (
        <div key={id}>
          <label htmlFor={id} className={lab}>{labelText}</label>
          <input id={id} type="number" inputMode="decimal" value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder} className={`${input} mt-1`} />
        </div>
      ))}
      {formError && (
        <div role="alert" className="rounded-xl bg-[#1a1208] border border-[#3a2a10] p-3">
          <p className="text-[12px] text-[#f59e0b]">{formError}</p>
        </div>
      )}
      <button onClick={save} className="w-full gradient-btn py-3 min-h-[48px]">
        Save to My Foods
      </button>
      <p className="text-[11px] text-[#555]">Saving creates a food — nothing is logged until you log it from Search.</p>
    </div>
  );
}
