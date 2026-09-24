import { NextResponse } from 'next/server';
import { requireDbUser } from '@/lib/auth/current-user';
import { syncPushRequestSchema } from '@/lib/validation/sync';
import { applyPushEvents } from '@/lib/sync/server/apply-push';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';

const MAX_BODY_BYTES = 500 * 1024;

export async function POST(req: Request) {
  try {
    const user = await requireDbUser();
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Sync batch too large.', code: 'BAD_REQUEST' }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return NextResponse.json({ error: 'Invalid sync payload.', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const parsed = syncPushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid sync payload. Please update the app.', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const results = await applyPushEvents(user.id, parsed.data.events);
    return NextResponse.json({ results });
  } catch (error) {
    logger.error('POST /api/sync/push failed', {});
    const { body, status } = toErrorResponse(error, 'sync');
    return NextResponse.json(body, { status });
  }
}
