import { NextRequest, NextResponse } from 'next/server';
import { requireDbUser } from '@/lib/auth/current-user';
import { syncPullQuerySchema } from '@/lib/validation/sync';
import { collectPullChanges } from '@/lib/sync/server/collect-pull';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';

export async function GET(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const parsed = syncPullQuerySchema.safeParse({ cursor: req.nextUrl.searchParams.get('cursor') || undefined });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid sync cursor.', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const result = await collectPullChanges(user.id, parsed.data.cursor ?? null);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('GET /api/sync/pull failed', {});
    const { body, status } = toErrorResponse(error, 'sync');
    return NextResponse.json(body, { status });
  }
}
