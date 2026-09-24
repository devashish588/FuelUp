'use client';
import { create } from 'zustand';
import type { BodyMetric } from '@/lib/types';
import { generateId } from '@/lib/utils';
import {
  listMetrics,
  removeMetric as removeMetricRow,
  saveMetricForDate,
  updateMetric as updateMetricRow,
} from '@/lib/repositories/metrics-repository';
import { writeThrough } from './write-through';

interface MetricsState {
  metrics: BodyMetric[];
  ownerId: string | null;
  ready: boolean;
  lastError: string | null;
  load: (ownerId: string) => Promise<void>;
  addMetric: (metric: Omit<BodyMetric, 'id' | 'created_at'>) => void;
  updateMetric: (id: string, updates: Partial<BodyMetric>) => void;
  removeMetric: (id: string) => void;
  getLatestMetric: () => BodyMetric | null;
  getMetricsInRange: (startDate: string, endDate: string) => BodyMetric[];
}

export const useMetricsStore = create<MetricsState>()((set, get) => ({
  metrics: [],
  ownerId: null,
  ready: false,
  lastError: null,

  load: async (ownerId) => {
    if (get().ownerId === ownerId && get().ready) return;
    set({ ownerId });
    try {
      const metrics = await listMetrics(ownerId);
      set({ metrics, ready: true, lastError: null });
    } catch (error) {
      set({ ready: true, lastError: error instanceof Error ? error.message : 'Unable to load your metrics.' });
    }
  },

  addMetric: (metric) => {
    const newMetric: BodyMetric = { ...metric, id: generateId(), created_at: new Date().toISOString() };
    set((s) => {
      const existing = s.metrics.findIndex((m) => m.date === metric.date);
      if (existing >= 0) {
        const updated = [...s.metrics];
        updated[existing] = newMetric;
        return { metrics: updated };
      }
      return { metrics: [...s.metrics, newMetric] };
    });
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(saveMetricForDate(ownerId, newMetric), 'body metric', (message) =>
        set({ lastError: message })
      );
    }
  },

  updateMetric: (id, updates) => {
    set((s) => ({
      metrics: s.metrics.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(updateMetricRow(ownerId, id, updates), 'body metric', (message) =>
        set({ lastError: message })
      );
    }
  },

  removeMetric: (id) => {
    set((s) => ({ metrics: s.metrics.filter((m) => m.id !== id) }));
    const ownerId = get().ownerId;
    if (ownerId) {
      writeThrough(removeMetricRow(ownerId, id), 'body metric', (message) =>
        set({ lastError: message })
      );
    }
  },

  getLatestMetric: () => {
    const sorted = [...get().metrics].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0] || null;
  },

  getMetricsInRange: (startDate, endDate) =>
    get()
      .metrics.filter((m) => m.date >= startDate && m.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date)),
}));
