'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Scale } from 'lucide-react';
import { EmptyState } from '@/components/ui/card';
import { formatDateShort } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export function WeightTrend({ data, trend }: {
  data: { date: string; weight: number }[];
  /** Optional smoothed overlay (Phase 7: 7-day rolling median from the engine). */
  trend?: { date: string; value: number }[];
}) {
  const router = useRouter();
  if (data.length === 0) {
    return <EmptyState icon={Scale} emoji="⚖️" message="Track your progress. Log your first weigh-in to see trends." action="Log Weight" onAction={() => router.push('/metrics')} />;
  }
  const trendByDate = new Map((trend ?? []).map((t) => [t.date, t.value]));
  const merged = data.map((d) => ({ ...d, trend: trendByDate.get(d.date) ?? null }));
  const showTrend = (trend ?? []).length > 0;
  return (
    <div>
      {showTrend && (
        <div className="flex items-center gap-4 mb-1 text-[10px] text-[#555]">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px] bg-[#f59e0b] rounded" /> Actual</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px] bg-[#38bdf8] rounded" /> Trend</span>
        </div>
      )}
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="weightLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
          <XAxis dataKey="date" tickFormatter={d => formatDateShort(d)} tick={{ fontSize: 10, fill: '#444' }} axisLine={false} tickLine={false} />
          <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
          <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: '12px', fontSize: '12px', color: '#eee', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            labelFormatter={d => formatDateShort(d as string)} formatter={(v, name) => [`${v} kg`, name === 'trend' ? 'Trend' : 'Weight']} />
          <Line type="monotone" dataKey="weight" stroke="url(#weightLine)" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b', stroke: '#0b0b0c', strokeWidth: 2 }} activeDot={{ r: 5, fill: '#f59e0b', stroke: '#0b0b0c', strokeWidth: 2 }} />
          {showTrend && (
            <Line type="monotone" dataKey="trend" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}
