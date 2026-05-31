import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMetrics, addMetric, getLatestMetric } from '@/lib/services/metric-service';
import { getUserByClerkId } from '@/lib/services/user-service';

async function getDbUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return getUserByClerkId(userId);
}

export async function GET() {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const metrics = await getMetrics(user.id);
  return NextResponse.json(metrics);
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const metric = await addMetric(user.id, body);
  return NextResponse.json(metric);
}
