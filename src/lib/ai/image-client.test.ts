// Phase 9 — client image utility tests (pure parts only; canvas capture
// itself is browser-only and covered by manual device testing).
import { describe, expect, it } from 'vitest';
import {
  AI_CAPTURE_MAX_EDGE_PX,
  computeTargetSize,
  isSupportedImageMime,
  validateCompressedImage,
  validateImageFile,
} from './image-client';
import { AI_MAX_IMAGE_BASE64_CHARS } from './vision-schemas';

describe('computeTargetSize', () => {
  it('leaves small images untouched (never upscales)', () => {
    expect(computeTargetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(computeTargetSize(AI_CAPTURE_MAX_EDGE_PX, 900)).toEqual({ width: AI_CAPTURE_MAX_EDGE_PX, height: 900 });
  });

  it('fits large images inside the max edge preserving aspect', () => {
    expect(computeTargetSize(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(computeTargetSize(3000, 4000)).toEqual({ width: 960, height: 1280 });
  });

  it('rejects nonsense dimensions', () => {
    expect(computeTargetSize(0, 100)).toEqual({ width: 0, height: 0 });
    expect(computeTargetSize(NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe('image validation', () => {
  it('accepts JPEG/PNG/WebP and rejects the rest', () => {
    expect(isSupportedImageMime('image/jpeg')).toBe(true);
    expect(isSupportedImageMime('image/png')).toBe(true);
    expect(isSupportedImageMime('image/webp')).toBe(true);
    expect(isSupportedImageMime('image/gif')).toBe(false);
    expect(isSupportedImageMime('')).toBe(false);
  });

  it('guards empty, oversized, and unsupported files with reasons', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1000 })).toEqual({ ok: true });
    expect(validateImageFile({ type: 'image/gif', size: 1000 }).ok).toBe(false);
    expect(validateImageFile({ type: 'image/jpeg', size: 0 }).ok).toBe(false);
    expect(validateImageFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 }).ok).toBe(false);
  });

  it('guards compressed output size', () => {
    expect(validateCompressedImage('a'.repeat(100))).toEqual({ ok: true });
    expect(validateCompressedImage('').ok).toBe(false);
    expect(validateCompressedImage('a'.repeat(AI_MAX_IMAGE_BASE64_CHARS + 1)).ok).toBe(false);
  });
});

describe('compressImage environment guard', () => {
  it('rejects with a user-safe error where canvas capture is unavailable', async () => {
    // Node/vitest has neither createImageBitmap nor document.
    const { compressImage } = await import('./image-client');
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await expect(compressImage(blob)).rejects.toThrow(/browser/i);
  });
});
