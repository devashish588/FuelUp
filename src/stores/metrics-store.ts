'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BodyMetric } from '@/lib/types';
import { generateId } from '@/lib/utils';

interface MetricsState {
  metrics: BodyMetric[];
  addMetric: (metric: Omit<BodyMetric, 'id' | 'created_at'>) => void;
  updateMetric: (id: string, updates: Partial<BodyMetric>) => void;
  removeMetric: (id: string) => void;
  getLatestMetric: () => BodyMetric | null;
  getMetricsInRange: (startDate: string, endDate: string) => BodyMetric[];
}

export const useMetricsStore = create<MetricsState>()(
  persist(
    (set, get) => ({
      metrics: [],

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
      },

      updateMetric: (id, updates) =>
        set((s) => ({
          metrics: s.metrics.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        })),

      removeMetric: (id) =>
        set((s) => ({ metrics: s.metrics.filter((m) => m.id !== id) })),

      getLatestMetric: () => {
        const sorted = [...get().metrics].sort((a, b) => b.date.localeCompare(a.date));
        return sorted[0] || null;
      },

      getMetricsInRange: (startDate, endDate) =>
        get().metrics.filter((m) => m.date >= startDate && m.date <= endDate).sort((a, b) => a.date.localeCompare(b.date)),
    }),
    { name: 'fuelup-metrics' }
  )
);
