// =============================================
// FuelUp - AI client wrapper (browser-safe)
// The browser NEVER holds an API key: it POSTs food text (or one compressed
// photo) to FuelUp's own /api/ai/* endpoints. Server error codes map to
// user-safe messages; unknown failures fall back to manual guidance.
// Server-provided error text is preferred when present (it is written
// user-safe server-side); otherwise the code map below applies.
// =============================================
import type { FetchFn } from './types';
import type { AiParsedItem } from './schemas';
import type { AiLabelCandidate, AiMealItem, AiVisionTask } from './vision-schemas';

export interface AiClientError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AiParseClientResult {
  items: AiParsedItem[];
  clarificationRequired: boolean;
}

const MESSAGE_BY_CODE: Record<string, string> = {
  AI_TIMEOUT: 'The AI took too long to respond. Try again or log manually.',
  AI_QUOTA: 'AI usage limit reached. Please try later or log manually.',
  AI_RATE_LIMITED: 'Too many AI requests. Please wait a bit or log manually.',
  AI_CONFIGURATION_ERROR: "AI food logging isn't available right now. Use manual logging.",
  AI_INVALID_OUTPUT: "Couldn't understand that meal. You can edit it manually.",
  AI_REQUEST_TOO_LARGE: 'That description is too long. Try a shorter one.',
  AI_UNAVAILABLE: 'AI unavailable — use manual logging.',
  AI_IMAGE_UNSUPPORTED: "This AI setup doesn't support photos. Use manual entry.",
  BAD_REQUEST: 'Describe your meal in a few words (up to 500 characters).',
};

/** Offline-first guard: AI needs network; manual logging does not. */
export function isAiOnline(nav?: { onLine?: boolean }): boolean {
  if (!nav) {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
  }
  return nav.onLine !== false;
}

export async function requestFoodParse(text: string, fetchFn: FetchFn = fetch): Promise<AiParseClientResult> {
  let res: Response;
  try {
    res = await fetchFn('/api/ai/food-parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw { code: 'AI_UNAVAILABLE', message: MESSAGE_BY_CODE.AI_UNAVAILABLE, retryable: true } as AiClientError;
  }
  if (res.ok) {
    const body = (await res.json()) as { items?: AiParsedItem[]; clarificationRequired?: boolean };
    return { items: Array.isArray(body.items) ? body.items : [], clarificationRequired: body.clarificationRequired === true };
  }
  const { code, message } = await readError(res);
  throw toClientError(code, message);
}

export interface AiVisionClientResult {
  task: AiVisionTask;
  items?: AiMealItem[];
  label?: AiLabelCandidate;
  clarificationRequired: boolean;
}

export interface VisionImagePayload {
  mimeType: string;
  dataBase64: string;
}

function toClientError(code: string, serverMessage?: string): AiClientError {
  const retryable = code === 'AI_TIMEOUT' || code === 'AI_UNAVAILABLE';
  return {
    code,
    message: serverMessage && serverMessage.length > 0 ? serverMessage : (MESSAGE_BY_CODE[code] ?? MESSAGE_BY_CODE.AI_UNAVAILABLE),
    retryable,
  } as AiClientError;
}

async function readError(res: Response): Promise<{ code: string; message?: string }> {
  try {
    const body = (await res.json()) as { code?: string; error?: string };
    return {
      code: typeof body.code === 'string' && body.code ? body.code : 'AI_UNAVAILABLE',
      message: typeof body.error === 'string' && body.error ? body.error : undefined,
    };
  } catch {
    return { code: 'AI_UNAVAILABLE' };
  }
}

/**
 * Send one compressed photo for meal or label analysis. The payload is
 * image + optional user text ONLY — no profile, history, or identifiers.
 */
export async function requestVision(
  task: AiVisionTask,
  image: VisionImagePayload,
  text: string | undefined,
  fetchFn: FetchFn = fetch
): Promise<AiVisionClientResult> {
  let res: Response;
  try {
    res = await fetchFn('/api/ai/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(text ? { task, image, text } : { task, image }),
    });
  } catch {
    throw { code: 'AI_UNAVAILABLE', message: MESSAGE_BY_CODE.AI_UNAVAILABLE, retryable: true } as AiClientError;
  }
  if (res.ok) {
    const body = (await res.json()) as {
      task?: AiVisionTask;
      items?: AiMealItem[];
      label?: AiLabelCandidate;
      clarificationRequired?: boolean;
    };
    return {
      task,
      items: Array.isArray(body.items) ? body.items : undefined,
      label: body.label,
      clarificationRequired: body.clarificationRequired === true,
    };
  }
  const { code, message } = await readError(res);
  throw toClientError(code, message);
}
