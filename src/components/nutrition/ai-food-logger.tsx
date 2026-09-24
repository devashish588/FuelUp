'use client';
import { useState } from 'react';
import { Sparkles, Camera, ScanLine } from 'lucide-react';
import { useCalorieStore } from '@/stores/calorie-store';
import { isAiOnline, requestFoodParse, type AiClientError } from '@/lib/ai/client';
import { resolveFoodCandidates, type ResolvedFoodItem } from '@/lib/ai/resolve';
import type { MealType } from '@/lib/types';
import { AiReviewPanel } from './ai-review-panel';
import { MealScanPanel } from './meal-scan-panel';
import { LabelScanPanel } from './label-scan-panel';

type AiMode = 'describe' | 'meal' | 'label';

const MODES: { key: AiMode; label: string; icon: typeof Sparkles }[] = [
  { key: 'describe', label: 'Describe', icon: Sparkles },
  { key: 'meal', label: 'Scan Meal', icon: Camera },
  { key: 'label', label: 'Scan Label', icon: ScanLine },
];

export function AiFoodLogger({ date, onLogged }: { date: string; onLogged: () => void }) {
  const foodItems = useCalorieStore((s) => s.foodItems);
  const [mode, setMode] = useState<AiMode>('describe');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [items, setItems] = useState<ResolvedFoodItem[] | null>(null);
  const [meal, setMeal] = useState<MealType>('lunch');
  const [notice, setNotice] = useState<string | null>(null);

  const offline = !isAiOnline();

  const switchMode = (next: AiMode) => {
    setMode(next);
    setItems(null);
    setError(null);
    setNotice(null);
  };

  const parse = async () => {
    const value = text.trim();
    if (!value || parsing) return;
    setError(null);
    setNotice(null);
    setItems(null);
    setParsing(true);
    try {
      const result = await requestFoodParse(value);
      if (result.items.length === 0 || result.clarificationRequired) {
        setError({ message: "Couldn't understand that meal. You can edit it manually.", retryable: true });
        return;
      }
      setMatching(true);
      // Resolution is local + synchronous; the state flip keeps the
      // "Matching foods…" indicator honest on slow devices.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const resolved = resolveFoodCandidates(result.items, foodItems);
      const hint = resolved.find((r) => r.mealHint)?.mealHint;
      setMeal(hint ?? 'lunch');
      setItems(resolved);
      setNotice(`Found ${resolved.length} item${resolved.length === 1 ? '' : 's'} — review before adding.`);
    } catch (e) {
      const err = e as AiClientError;
      setError({ message: err.message ?? 'AI unavailable — use manual logging.', retryable: err.retryable !== false });
    } finally {
      setParsing(false);
      setMatching(false);
    }
  };

  const reset = () => {
    setItems(null);
    setError(null);
    setNotice(null);
    setText('');
  };

  return (
    <div>
      <div className="flex gap-2 mb-4" role="tablist" aria-label="AI input mode">
        {MODES.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={mode === m.key}
            onClick={() => switchMode(m.key)}
            className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5 min-h-[44px] ${
              mode === m.key ? 'gradient-btn' : 'bg-[#1a1a1a] text-[#777] border border-[#222]'
            }`}
          >
            <m.icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'meal' ? (
        <MealScanPanel date={date} onLogged={onLogged} />
      ) : mode === 'label' ? (
        <LabelScanPanel />
      ) : items === null ? (
        <div className="space-y-3">
          <label htmlFor="ai-meal-text" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">
            Describe your meal
          </label>
          <textarea
            id="ai-meal-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='e.g. "2 rotis, 200g chicken curry and a bowl of dal"'
            rows={3}
            maxLength={500}
            disabled={parsing || offline}
            className="dark-input resize-none"
            aria-describedby="ai-hint"
          />
          <p id="ai-hint" className="text-[11px] text-[#555]">
            AI suggests foods — you review and confirm. Nutrition always comes from FuelUp&apos;s food data.
          </p>
          {offline ? (
            <p role="status" className="text-[12px] text-[#f59e0b]">
              You&apos;re offline. Manual food logging is available.
            </p>
          ) : (
            <button onClick={parse} disabled={parsing || text.trim().length === 0} className="w-full gradient-btn py-3 min-h-[48px] flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              {parsing ? 'Understanding your meal…' : 'Parse meal'}
            </button>
          )}
          <div aria-live="polite">
            {matching && <p className="text-[12px] text-[#777]">Matching foods…</p>}
            {error && (
              <div role="alert" className="rounded-xl bg-[#1a1208] border border-[#3a2a10] p-3">
                <p className="text-[12px] text-[#f59e0b]">{error.message}</p>
                <button onClick={parse} className="mt-2 text-[12px] font-bold text-white underline">
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <AiReviewPanel
          items={items}
          onItemsChange={setItems}
          meal={meal}
          onMealChange={setMeal}
          notice={notice}
          date={date}
          onConfirmed={onLogged}
          onReset={reset}
        />
      )}
    </div>
  );
}
