import { NextRequest, NextResponse } from 'next/server';
import { getMetrics, addMetric } from '@/lib/services/metric-service';
import { requireDbUser } from '@/lib/auth/current-user';
import { bodyMetricSchema } from '@/lib/validation';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';

export async function GET() {
  try {
    const user = await requireDbUser();
    const metrics = await getMetrics(user.id);
    return NextResponse.json(metrics);
  } catch (error) {
    const { body, status } = toErrorResponse(error, 'metrics');
    if (status >= 500) logger.error('GET /api/metrics failed', {});
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const parsed = bodyMetricSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body-metric entry. Please check your input.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }
    const metric = await addMetric(user.id, parsed.data);
    return NextResponse.json(metric);
  } catch (error) {
    logger.error('POST /api/metrics failed', {});
    const { body, status } = toErrorResponse(error, 'body metric');
    return NextResponse.json(body, { status });
  }
}
