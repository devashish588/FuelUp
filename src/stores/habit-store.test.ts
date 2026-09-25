// Phase 10.5 — quick water: existing habit architecture, no new model.
// One-tap increments go through logHabit (IndexedDB → outbox when owned;
// pure in-memory here).
import { beforeEach, describe, expect, it } from 'vitest';
import { findWaterHabit, useHabitStore } from './habit-store';
import type { Habit } from '@/lib/types';

function habit(id: string, name: string, unit: string): Habit {
  const now = new Date().toISOString();
  return {
    id, user_id: '', name, icon: '', color: '#fff', target_value: 8, unit,
    frequency: 'daily', is_default: false, is_active: true, sort_order: 0,
    created_at: now, updated_at: now,
  };
}

beforeEach(() => {
  useHabitStore.setState({ habits: [], habitLogs: [], ownerId: null, ready: true, lastError: null });
});

describe('findWaterHabit', () => {
  it('prefers an explicit Water habit, then glasses-unit habits', () => {
    const water = habit('h-w', 'Water', 'glasses');
    const juice = habit('h-j', 'Juice', 'glasses');
    expect(findWaterHabit([juice, water]?.reverse())).toBe(water);
    expect(findWaterHabit([juice])).toBe(juice);
    expect(findWaterHabit([habit('h-s', 'Steps', 'steps')])).toBeUndefined();
    expect(findWaterHabit([])).toBeUndefined();
  });
});

describe('quick water logging', () => {
  it('increments today’s water value without touching other habits', () => {
    useHabitStore.setState({
      habits: [habit('h-w', 'Water', 'glasses'), habit('h-s', 'Steps', 'steps')],
    });
    const store = useHabitStore.getState();
    store.logHabit('h-w', '2026-09-22', 1);
    store.logHabit('h-w', '2026-09-22', 2);
    const logs = useHabitStore.getState().habitLogs;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ habit_id: 'h-w', date: '2026-09-22', value: 2 });
  });
});
