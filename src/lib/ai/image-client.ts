// =============================================
// FuelUp - Client image utilities (browser, Phase 9)
// Camera/file → validated, compressed JPEG data URL parts for /api/ai/vision.
// Privacy lifecycle: images live in memory / blob URLs only and are revoked
// after analysis. Nothing here writes to IndexedDB, outbox, or sync.
// Supported inputs: JPEG, PNG, WebP. Output is ALWAYS JPEG — the one format
// every vision endpoint accepts, so users never think about formats.
// Documented capture budget: max 1280px longest edge, JPEG q0.82 (~≤500 KB).
// =============================================
import { AI_IMAGE_MIMES, AI_MAX_IMAGE_BASE64_CHARS, type AiImageMime } from './vision-schemas';

export const AI_CAPTURE_MAX_EDGE_PX = 1280;
export const AI_CAPTURE_JPEG_QUALITY = 0.82;
/** Pre-compression guard: refuse absurd files before spending memory. */
export const AI_MAX_INPUT_FILE_BYTES = 10 * 1024 * 1024;

export interface CompressedImage {
  mimeType: 'image/jpeg';
  dataBase64: string;
  width: number;
  height: number;
}

/** Pure dimension math (tested): fit inside maxEdge, never upscale. */
export function computeTargetSize(width: number, height: number, maxEdge = AI_CAPTURE_MAX_EDGE_PX): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / edge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isSupportedImageMime(mime: string): mime is AiImageMime {
  return (AI_IMAGE_MIMES as readonly string[]).includes(mime);
}

/** Pre-compression file guard with user-safe reasons. */
export function validateImageFile(file: { type: string; size: number }): { ok: true } | { ok: false; reason: string } {
  if (!isSupportedImageMime(file.type)) {
    return { ok: false, reason: 'That photo format isn’t supported. Try JPEG, PNG, or WebP.' };
  }
  if (file.size <= 0) {
    return { ok: false, reason: 'That photo looks empty. Try another one.' };
  }
  if (file.size > AI_MAX_INPUT_FILE_BYTES) {
    return { ok: false, reason: 'That photo is too large. Try a smaller image.' };
  }
  return { ok: true };
}

/** Compressed output guard (belt-and-braces before upload). */
export function validateCompressedImage(dataBase64: string): { ok: true } | { ok: false; reason: string } {
  if (!dataBase64 || dataBase64.length > AI_MAX_IMAGE_BASE64_CHARS) {
    return { ok: false, reason: 'That photo is too large. Try a smaller image.' };
  }
  return { ok: true };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('read-failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress any supported image to a small JPEG (canvas path — browser only).
 * Throws a user-safe Error when the browser cannot decode the image.
 */
export async function compressImage(
  file: Blob,
  maxEdge = AI_CAPTURE_MAX_EDGE_PX,
  quality = AI_CAPTURE_JPEG_QUALITY
): Promise<CompressedImage> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error("This browser can't process photos. Upload may still work on another device.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That photo couldn't be read. Try another image.");
  }
  try {
    const target = computeTargetSize(bitmap.width, bitmap.height, maxEdge);
    if (target.width === 0 || target.height === 0) throw new Error('empty');
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no-2d');
    // White base: JPEG has no alpha; transparent PNGs would flatten black
    // (and read worse for label OCR).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('encode-failed');
    const dataUrl = await blobToDataUrl(blob);
    const dataBase64 = dataUrl.split(',', 2)[1] ?? '';
    const check = validateCompressedImage(dataBase64);
    if (!check.ok) throw new Error(check.reason);
    return { mimeType: 'image/jpeg', dataBase64, width: target.width, height: target.height };
  } finally {
    bitmap.close();
  }
}

/** Revoke an object URL (image lifecycle hygiene). Safe to call with null. */
export function revokeObjectUrl(url: string | null): void {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already revoked — harmless */
    }
  }
}
