// GET /api/ai/status — per-caller AI availability + usage (Phase 8).
// Returns the caller's own remaining quota only. No global counters, no
// secrets, no other users' data.
// Phase 9: additive vision fields (support flag + image allowance).
import { NextResponse } from 'next/server';
import { requireDbUser } from '@/lib/auth/current-user';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';
import { handleAiStatusRequest } from '@/lib/ai/route-handler';
import { visionStatusExtension } from '@/lib/ai/vision-route-handler';

export async function GET() {
  try {
    const user = await requireDbUser();
    const { status, body } = handleAiStatusRequest({ userId: user.id });
    return NextResponse.json({ ...(body as Record<string, unknown>), ...visionStatusExtension({ userId: user.id }) }, { status });
  } catch (error) {
    logger.error('GET /api/ai/status failed', {});
    const { body, status } = toErrorResponse(error, 'AI status');
    return NextResponse.json(body, { status });
  }
}
