import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getFoodLogs, addFoodLog, removeFoodLog, searchFoodItems, createFoodItem } from '@/lib/services/meal-service';
import { getUserByClerkId } from '@/lib/services/user-service';

async function getDbUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return getUserByClerkId(userId);
}

export async function GET(req: NextRequest) {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const date = req.nextUrl.searchParams.get('date');
  const search = req.nextUrl.searchParams.get('search');

  if (search) {
    const items = await searchFoodItems(search, user.id);
    return NextResponse.json(items);
  }

  if (date) {
    const logs = await getFoodLogs(user.id, date);
    return NextResponse.json(logs);
  }

  return NextResponse.json({ error: 'date or search param required' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  if (body.type === 'food_item') {
    const item = await createFoodItem(user.id, body.data);
    return NextResponse.json(item);
  }

  const log = await addFoodLog(user.id, body);
  return NextResponse.json(log);
}

export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await removeFoodLog(id, user.id);
  return NextResponse.json({ success: true });
}
