'use client';
import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { useCalorieStore } from '@/stores/calorie-store';
import { isAiOnline, requestVision, type AiClientError } from '@/lib/ai/client';
import { revokeObjectUrl, type CompressedImage } from '@/lib/ai/image-client';
import { resolveFoodCandidates, type ResolvedFoodItem } from '@/lib/ai/resolve';
import type { MealType } from '@/lib/types';
import { CameraCapture } from './camera-capture';
import { AiReviewPanel } from './ai-review-panel';

type Phase = 'camera' | 'preview' | 'analyzing' | 'review';

export function MealScanPanel({ date, onLogged }: { date: string; onLogged: () => void }) {
  const foodItems = useCalorieStore((s) => s.foodItems);
  const [phase, setPhase] = useState<Phase>('camera');
  const [image, setImage] = useState<CompressedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [items, setItems] = useState<ResolvedFoodItem[] | null>(null);
  const [meal, setMeal] = useState<MealType>('lunch');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const offline = !isAiOnline();
  const discardImage = () => {
    revokeObjectUrl(previewUrl);
    setPreviewUrl(null);
    setImage(null);
  };
  useEffect(() => () => revokeObjectUrl(previewUrl), [previewUrl]);

  const reset = () => {
    discardImage();
    setItems(null);
    setError(null);
    setNotice(null);
    setText('');
    setPhase('camera');
  };

  const analyze = async () => {
    if (!image || analyzing || offline) return;
    setError(null);
    setNotice(null);
    setAnalyzing(true);
    setPhase('analyzing');
    try {
      const result = await requestVision('meal', { mimeType: image.mimeType, dataBase64: image.dataBase64 }, text.trim() || undefined);
      if (!result.items || result.items.length === 0 || result.clarificationRequired) {
        setError({ message: "Couldn't find food in that photo. Try a clearer shot or enter foods manually.", retryable: true });
        setPhase('preview');
        return;
      }
      const resolved = resolveFoodCandidates(result.items, foodItems);
      const hint = resolved.find((r) => r.mealHint)?.mealHint;
      setMeal(hint ?? 'lunch');
      setItems(resolved);
      setNotice(`Found ${resolved.length} item${resolved.length === 1 ? '' : 's'} — confirm every portion before adding.`);
      setPhase('review');
      // Image lifecycle: analysis done → discard immediately, keep review.
      discardImage();
    } catch (e) {
      const err = e as AiClientError;
      setError({ message: err.message ?? 'AI unavailable — use manual logging.', retryable: err.retryable !== false });
      setPhase('preview');
    } finally {
      setAnalyzing(false);
    }
  };

  if (phase === 'review' && items) {
    return (
      <AiReviewPanel
        items={items}
        onItemsChange={setItems}
        meal={meal}
        onMealChange={setMeal}
        notice={notice}
        date={date}
        onConfirmed={onLogged}
        onReset={reset}
        title="Review scanned meal"
      />
    );
  }

  if (phase === 'preview' && image && previewUrl) {
    return (
      <div className="space-y-3" aria-live="polite">
        <h3 className="text-[14px] font-bold text-white">Check your photo</h3>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Captured meal preview" className="w-full max-h-64 object-cover rounded-xl border border-[#222]" />
        <div>
          <label htmlFor="meal-scan-text" className="text-[11px] font-bold text-[#555] uppercase tracking-wider">
            Clarification (optional)
          </label>
          <input
            id="meal-scan-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='e.g. "This is homemade chicken curry"'
            maxLength={300}
            disabled={analyzing}
            className="dark-input mt-1"
          />
        </div>
        {offline ? (
          <p role="status" className="text-[12px] text-[#f59e0b]">
            You&apos;re offline. Save this image? Not available in this version — manual logging works offline.
          </p>
        ) : (
          <button onClick={analyze} disabled={analyzing} className="w-full gradient-btn py-3 min-h-[48px] flex items-center justify-center gap-2">
            <Camera className="w-4 h-4" /> {analyzing ? 'Analyzing meal…' : 'Analyze Meal'}
          </button>
        )}
        <button
          onClick={reset}
          disabled={analyzing}
          className="w-full py-3 min-h-[48px] rounded-xl bg-[#1a1a1a] text-[#AAA] border border-[#222] text-[13px] font-bold"
        >
          Retake
        </button>
        <div aria-live="polite">
          {error && (
            <div role="alert" className="rounded-xl bg-[#1a1208] border border-[#3a2a10] p-3">
              <p className="text-[12px] text-[#f59e0b]">{error.message}</p>
              {!offline && (
                <button onClick={analyze} className="mt-2 text-[12px] font-bold text-white underline">
                  Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'analyzing') {
    return (
      <div className="space-y-3" aria-live="polite">
        <p role="status" className="text-[13px] text-[#AAA]">
          Analyzing meal… Matching foods…
        </p>
      </div>
    );
  }

  return (
    <CameraCapture
      heading="Scan Meal"
      privacyNote="Photo is used to analyze your meal. The image is temporary — only the foods you confirm are saved, never the photo."
      onCaptured={(img, url) => {
        setImage(img);
        setPreviewUrl(url);
        setError(null);
        setPhase('preview');
      }}
    />
  );
}
