'use client';
import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { isAiOnline, requestVision, type AiClientError } from '@/lib/ai/client';
import { revokeObjectUrl, type CompressedImage } from '@/lib/ai/image-client';
import type { AiLabelCandidate } from '@/lib/ai/vision-schemas';
import { CameraCapture } from './camera-capture';
import { LabelReviewPanel } from './label-review-panel';

type Phase = 'camera' | 'preview' | 'analyzing' | 'review';

export function LabelScanPanel() {
  const [phase, setPhase] = useState<Phase>('camera');
  const [image, setImage] = useState<CompressedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [label, setLabel] = useState<AiLabelCandidate | null>(null);
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
    setLabel(null);
    setError(null);
    setPhase('camera');
  };

  const analyze = async () => {
    if (!image || analyzing || offline) return;
    setError(null);
    setAnalyzing(true);
    setPhase('analyzing');
    try {
      const result = await requestVision('nutrition_label', { mimeType: image.mimeType, dataBase64: image.dataBase64 }, undefined);
      if (!result.label || result.clarificationRequired) {
        setError({ message: "That label couldn't be read. Try a clearer photo or enter values manually.", retryable: true });
        setPhase('preview');
        return;
      }
      setLabel(result.label);
      setPhase('review');
      // Image lifecycle: extraction done → discard immediately, keep the draft.
      discardImage();
    } catch (e) {
      const err = e as AiClientError;
      setError({ message: err.message ?? 'AI unavailable — enter values manually.', retryable: err.retryable !== false });
      setPhase('preview');
    } finally {
      setAnalyzing(false);
    }
  };

  if (phase === 'review' && label) {
    return <LabelReviewPanel label={label} onReset={reset} />;
  }

  if (phase === 'preview' && image && previewUrl) {
    return (
      <div className="space-y-3" aria-live="polite">
        <h3 className="text-[14px] font-bold text-white">Check the label photo</h3>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Captured nutrition label preview" className="w-full max-h-64 object-cover rounded-xl border border-[#222]" />
        {offline ? (
          <p role="status" className="text-[12px] text-[#f59e0b]">
            You&apos;re offline. Save this image? Not available in this version — enter values manually.
          </p>
        ) : (
          <button onClick={analyze} disabled={analyzing} className="w-full gradient-btn py-3 min-h-[48px] flex items-center justify-center gap-2">
            <ScanLine className="w-4 h-4" /> {analyzing ? 'Reading label…' : 'Analyze Label'}
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
          Reading label…
        </p>
      </div>
    );
  }

  return (
    <CameraCapture
      heading="Scan Nutrition Label"
      privacyNote="Photo is used to read the label. The image is temporary — only the food you save is kept, never the photo."
      onCaptured={(img, url) => {
        setImage(img);
        setPreviewUrl(url);
        setError(null);
        setPhase('preview');
      }}
    />
  );
}
