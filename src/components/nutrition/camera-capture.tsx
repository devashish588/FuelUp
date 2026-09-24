'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Upload, RefreshCw, X } from 'lucide-react';
import {
  AI_CAPTURE_JPEG_QUALITY,
  AI_CAPTURE_MAX_EDGE_PX,
  compressImage,
  revokeObjectUrl,
  validateCompressedImage,
  validateImageFile,
  type CompressedImage,
} from '@/lib/ai/image-client';

type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'unsupported' | 'error';

export interface CameraCaptureProps {
  onCaptured: (image: CompressedImage, previewUrl: string) => void;
  heading: string;
  privacyNote: string;
}

/**
 * Mobile-first capture: user-initiated camera (environment facing) with
 * upload-from-device fallback. Frames are never uploaded — only the single
 * captured (or chosen) image leaves the device, compressed, after the user
 * taps Analyze on the next screen.
 */
/**
 * Map getUserMedia failure names to user-safe guidance (pure, tested).
 * Dismissed prompts land here too — the message always offers upload.
 */
export function cameraErrorMessage(name: string | undefined): { status: Extract<CameraStatus, 'denied' | 'unsupported'>; message: string | null } {
  switch (name) {
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { status: 'unsupported', message: null };
    case 'NotReadableError':
      return {
        status: 'denied',
        message: 'The camera is busy in another app or tab. Close it there, or upload a photo instead.',
      };
    case 'SecurityError':
      return {
        status: 'denied',
        message: 'Camera needs a secure (HTTPS) connection. Open FuelUp over HTTPS, or upload a photo instead.',
      };
    default:
      return { status: 'denied', message: null };
  }
}

export function CameraCapture({ onCaptured, heading, privacyNote }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* already stopped */
      }
    });
    streamRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;
    // Hidden tab/app switch with a live stream: release the camera so the
    // indicator turns off and the battery is spared. The user re-opens it
    // explicitly on return (permission persists, no re-prompt).
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopStream();
        if (mountedRef.current) {
          setStatus('idle');
          setBusy(false);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      stopStream();
    };
  }, []);

  const hasCameraApi =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  const startCamera = async () => {
    // Permission is requested ONLY here — explicit user tap, never on load.
    if (!hasCameraApi) {
      setStatus('unsupported');
      return;
    }
    // Race guard: rapid double-taps must not orphan a first stream.
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;
    setError(null);
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      if (!mountedRef.current) {
        // Unmounted while permission was pending: release immediately.
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* already stopped */
          }
        });
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStatus('live');
    } catch (e) {
      stopStream();
      const mapped = cameraErrorMessage((e as Error | undefined)?.name);
      if (mapped.message) setError(mapped.message);
      if (mountedRef.current) setStatus(mapped.status);
    } finally {
      startingRef.current = false;
    }
  };

  const finishBlob = async (blob: Blob, previewUrl: string) => {
    try {
      const compressed = await compressImage(blob);
      stopStream();
      onCaptured(compressed, previewUrl);
    } catch (e) {
      revokeObjectUrl(previewUrl);
      setError(e instanceof Error ? e.message : "That photo couldn't be read. Try another image.");
    } finally {
      setBusy(false);
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const scale = Math.min(1, AI_CAPTURE_MAX_EDGE_PX / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('capture-unavailable');
      // White base: JPEG has no alpha; transparent sources would flatten black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', AI_CAPTURE_JPEG_QUALITY));
      if (!blob) throw new Error('capture-unavailable');
      const url = URL.createObjectURL(blob);
      // Same size guard as the upload path, applied to captured bytes.
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("That photo couldn't be read. Try again."));
        reader.readAsDataURL(blob);
      });
      const dataBase64 = dataUrl.split(',', 2)[1] ?? '';
      const sizeCheck = validateCompressedImage(dataBase64);
      if (!sizeCheck.ok) {
        revokeObjectUrl(url);
        throw new Error(sizeCheck.reason);
      }
      stopStream();
      onCaptured({ mimeType: 'image/jpeg', dataBase64, width: canvas.width, height: canvas.height }, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn't be captured. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    const check = validateImageFile(file);
    if (!check.ok) {
      setError(check.reason);
      setBusy(false);
      return;
    }
    const url = URL.createObjectURL(file);
    await finishBlob(file, url);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-[14px] font-bold text-white">{heading}</h3>
      <p className="text-[11px] text-[#555] leading-relaxed">{privacyNote}</p>

      <div className="rounded-xl overflow-hidden bg-[#101010] border border-[#222] relative">
        {status === 'live' ? (
          <>
            <video ref={videoRef} playsInline muted autoPlay className="w-full h-64 object-cover bg-black" aria-label="Camera preview" />
            <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-[#f59e0b]/60 rounded-xl" aria-hidden="true" />
          </>
        ) : (
          <>
            {/* Keep the ref mounted so startCamera can attach the stream. */}
            <video ref={videoRef} playsInline muted className="hidden" aria-hidden="true" />
            <div className="h-64 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <Camera className="w-8 h-8 text-[#444]" />
              {status === 'starting' && <p className="text-[12px] text-[#777]">Starting camera…</p>}
              {status === 'denied' && (
                <p className="text-[12px] text-[#f59e0b] leading-relaxed">
                  Camera access was denied. Allow camera access in your browser settings, or upload a photo instead.
                </p>
              )}
              {status === 'unsupported' && (
                <p className="text-[12px] text-[#777] leading-relaxed">
                  This browser can&apos;t open the camera here. Upload a photo instead.
                </p>
              )}
              {(status === 'idle' || status === 'error') && (
                <p className="text-[12px] text-[#777]">Point at the plate, then capture.</p>
              )}
            </div>
          </>
        )}
      </div>

      <div aria-live="polite">
        {error && (
          <div role="alert" className="rounded-xl bg-[#1a1208] border border-[#3a2a10] p-3">
            <p className="text-[12px] text-[#f59e0b]">{error}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {status === 'live' ? (
          <>
            <button
              onClick={captureFrame}
              disabled={busy}
              className="gradient-btn py-3 min-h-[48px] flex items-center justify-center gap-2"
              aria-label="Capture photo"
            >
              <Camera className="w-4 h-4" /> {busy ? 'Capturing…' : 'Capture'}
            </button>
            <button
              onClick={() => {
                stopStream();
                setStatus('idle');
              }}
              className="py-3 min-h-[48px] rounded-xl bg-[#1a1a1a] text-[#AAA] border border-[#222] flex items-center justify-center gap-2 text-[13px] font-bold"
            >
              <X className="w-4 h-4" /> Close
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startCamera}
              disabled={busy || status === 'starting'}
              className="gradient-btn py-3 min-h-[48px] flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> Open camera
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="py-3 min-h-[48px] rounded-xl bg-[#1a1a1a] text-[#AAA] border border-[#222] flex items-center justify-center gap-2 text-[13px] font-bold"
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        aria-label="Upload a photo from your device"
        onChange={(e) => {
          void onFileChosen(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <p className="text-[11px] text-[#555] flex items-center gap-1">
        <RefreshCw className="w-3 h-3" /> You can retake or choose another photo before analysis.
      </p>
    </div>
  );
}
