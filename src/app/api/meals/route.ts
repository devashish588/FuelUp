import { NextRequest, NextResponse } from 'next/server';
import { getFoodLogs, addFoodLog, removeFoodLog, searchFoodItems, createFoodItem } from '@/lib/services/meal-service';
import { requireDbUser } from '@/lib/auth/current-user';
import { dateString, foodItemSchema, foodLogSchema } from '@/lib/validation';
import { toErrorResponse } from '@/lib/errors/app-error';
import { logger } from '@/lib/logger/logger';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const date = req.nextUrl.searchParams.get('date');
    const search = req.nextUrl.searchParams.get('search');

    if (search) {
      const items = await searchFoodItems(search, user.id);
      return NextResponse.json(items);
    }

    if (date) {
      if (!dateString.safeParse(date).success) {
        return NextResponse.json(
          { error: 'Invalid date. Use YYYY-MM-DD.', code: 'BAD_REQUEST' },
          { status: 400 }
        );
      }
      const logs = await getFoodLogs(user.id, date);
      return NextResponse.json(logs);
    }

    return NextResponse.json({ error: 'date or search param required', code: 'BAD_REQUEST' }, { status: 400 });
  } catch (error) {
    const { body, status } = toErrorResponse(error, 'meals');
    if (status >= 500) logger.error('GET /api/meals failed', {});
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const body = await req.json();

    if (body?.type === 'food_item') {
      const parsed = foodItemSchema.safeParse(body.data ?? {});
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid food item. Please check your input.', code: 'BAD_REQUEST' },
          { status: 400 }
        );
      }
      const d = parsed.data;
      const item = await createFoodItem(user.id, {
        name: d.name,
        brand: d.brand,
        caloriesPerServing: d.calories_per_serving,
        proteinG: d.protein_g,
        carbsG: d.carbs_g,
        fatG: d.fat_g,
        servingUnit: d.serving_unit,
        servingSize: d.serving_size,
        fiberG: d.fiber_g,
        category: d.category,
        source: d.source,
        sourceId: d.source_id,
        aliases: d.aliases,
        countWeightG: d.count_weight_g,
        foodState: d.food_state || null,
        preparation: d.preparation || null,
        servingDescription: d.serving_description || null,
        sugarG: d.sugar_g,
        sodiumMg: d.sodium_mg,
        isEstimated: d.is_estimated,
        barcode: d.barcode,
      });
      return NextResponse.json(item);
    }

    const parsed = foodLogSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid food log entry. Please check your input.', code: 'BAD_REQUEST' },
        { status: 400 }
      );
    }
    const log = await addFoodLog(user.id, {
      foodItemId: parsed.data.foodItemId,
      date: parsed.data.date,
      mealType: parsed.data.mealType,
      servings: parsed.data.servings,
      calories: parsed.data.calories,
      proteinG: parsed.data.proteinG,
      carbsG: parsed.data.carbsG,
      fatG: parsed.data.fatG,
      notes: parsed.data.notes,
      quantity: parsed.data.quantity,
      quantityUnit: parsed.data.quantityUnit,
      fiberG: parsed.data.fiberG,
      sugarG: parsed.data.sugarG,
      sodiumMg: parsed.data.sodiumMg,
      foodName: parsed.data.foodName,
      isEstimated: parsed.data.isEstimated,
    });
    return NextResponse.json(log);
  } catch (error) {
    logger.error('POST /api/meals failed', {});
    const { body, status } = toErrorResponse(error, 'food log');
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireDbUser();
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !z.string().min(1).safeParse(id).success) {
      return NextResponse.json({ error: 'id required', code: 'BAD_REQUEST' }, { status: 400 });
    }
    await removeFoodLog(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('DELETE /api/meals failed', {});
    const { body, status } = toErrorResponse(error, 'food log');
    return NextResponse.json(body, { status });
  }
}
