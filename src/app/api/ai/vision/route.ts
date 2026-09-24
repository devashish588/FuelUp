// POST /api/ai/vision — meal photo + nutrition label analysis (Phase 9).
// Authenticated (Clerk), validated (MIME/size/magic bytes), rate-limited
// on a separate image allowance. Returns proposals ONLY — meal results
// resolve client-side, label results become a user-confirmed FoodItem.
// No database access here; images are request-scoped and never stored.
import { NextResponse } from 'next/server';
import { requireDbUser } from '@/lib/auth/current-user';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';
import { handleVisionRequest } from '@/lib/ai/vision-route-handler';

export async function POST(req: Request) {
  try {
    const user = await requireDbUser();
    const raw = await req.text();
    const { status, body } = await handleVisionRequest({ userId: user.id, rawBody: raw });
    return NextResponse.json(body, { status });
  } catch (error) {
    logger.error('POST /api/ai/vision failed', {});
    const { body, status } = toErrorResponse(error, 'AI vision request');
    return NextResponse.json(body, { status });
  }
}
