import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getHabits, createHabit, updateHabit, deleteHabit, getHabitLogs, upsertHabitLog } from '@/lib/services/habit-service';
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
  if (date) {
    const logs = await getHabitLogs(user.id, date);
    return NextResponse.json(logs);
  }

  const habits = await getHabits(user.id);
  return NextResponse.json(habits);
}

export async function POST(req: NextRequest) {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  if (body.type === 'log') {
    const log = await upsertHabitLog(user.id, body.habitId, body.date, body.value, body.completed);
    return NextResponse.json(log);
  }

  const habit = await createHabit(user.id, body);
  return NextResponse.json(habit);
}

export async function PATCH(req: NextRequest) {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const habit = await updateHabit(body.id, user.id, body.data);
  return NextResponse.json(habit);
}

export async function DELETE(req: NextRequest) {
  const user = await getDbUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await deleteHabit(id, user.id);
  return NextResponse.json({ success: true });
}
