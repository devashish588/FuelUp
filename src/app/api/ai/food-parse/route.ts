// POST /api/ai/food-parse — natural-language food parsing (Phase 8).
// Authenticated (Clerk), validated, rate-limited. Returns structured food
// candidates ONLY — never creates a FoodLog (no database access here).
import { NextResponse } from 'next/server';
import { requireDbUser } from '@/lib/auth/current-user';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';
import { handleFoodParseRequest } from '@/lib/ai/route-handler';

export async function POST(req: Request) {
  try {
    const user = await requireDbUser();
    const raw = await req.text();
    const { status, body } = await handleFoodParseRequest({ userId: user.id, rawBody: raw });
    return NextResponse.json(body, { status });
  } catch (error) {
    logger.error('POST /api/ai/food-parse failed', {});
    const { body, status } = toErrorResponse(error, 'AI request');
    return NextResponse.json(body, { status });
  }
}
