import { NextRequest, NextResponse } from 'next/server';
import { getHabits, createHabit, updateHabit, deleteHabit, getHabitLogs, upsertHabitLog } from '@/lib/services/habit-service';
import { requireDbUser } from '@/lib/auth/current-user';
import { dateString, habitLogSchema, habitSchema, habitUpdateSchema } from '@/lib/validation';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const date = req.nextUrl.searchParams.get('date');
    if (date) {
      if (!dateString.safeParse(date).success) {
        return NextResponse.json(
          { error: 'Invalid date. Use YYYY-MM-DD.', code: 'BAD_REQUEST' },
          { status: 400 }
        );
      }
      const logs = await getHabitLogs(user.id, date);
      return NextResponse.json(logs);
    }
    const habits = await getHabits(user.id);
    return NextResponse.json(habits);
  } catch (error) {
    const { body, status } = toErrorResponse(error, 'habits');
    if (status >= 500) logger.error('GET /api/habits failed', {});
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const body = await req.json();

    if (body?.type === 'log') {
      const parsed = habitLogSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid habit log. Please check your input.', code: 'BAD_REQUEST' },
          { status: 400 }
        );
      }
      const log = await upsertHabitLog(user.id, parsed.data.habitId, parsed.data.date, parsed.data.value, parsed.data.completed);
      return NextResponse.json(log);
    }

    const parsed = habitSchema.safeParse(body?.data ?? body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid habit. Please check your input.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }
    const habit = await createHabit(user.id, {
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
      targetValue: parsed.data.targetValue,
      unit: parsed.data.unit,
      frequency: parsed.data.frequency,
    });
    return NextResponse.json(habit);
  } catch (error) {
    logger.error('POST /api/habits failed', {});
    const { body, status } = toErrorResponse(error, 'habit');
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const body = await req.json();
    if (!body?.id || !z.string().min(1).safeParse(body.id).success) {
      return NextResponse.json({ error: 'id required', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const parsed = habitUpdateSchema.safeParse(body.data ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid habit update. Please check your input.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }
    const habit = await updateHabit(body.id, user.id, parsed.data);
    return NextResponse.json(habit);
  } catch (error) {
    logger.error('PATCH /api/habits failed', {});
    const { body, status } = toErrorResponse(error, 'habit');
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required', code: 'BAD_REQUEST' }, { status: 400 });
    await deleteHabit(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/habits failed', {});
    const { body, status } = toErrorResponse(error, 'habit');
    return NextResponse.json(body, { status });
  }
}
