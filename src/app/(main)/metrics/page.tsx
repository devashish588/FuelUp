'use client';
import { useState } from 'react';
import { Plus, X, TrendingDown, TrendingUp, Scale, Activity } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, SectionLabel, StatNumber, EmptyState } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/header';
import { useMetricsStore } from '@/stores/metrics-store';
import { useProfileStore } from '@/stores/profile-store';
import { generateRecommendation } from '@/lib/services/recommendation-engine';
import { toDateString, calculateBMI, getBMICategory, formatDate, calculateAge, formatDateShort } from '@/lib/utils';

export default function MetricsPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ weight: '', height: '', body_fat: '', waist: '' });
  const profile = useProfileStore(s => s.profile);
  const { metrics, addMetric, getLatestMetric } = useMetricsStore();
  const latest = getLatestMetric();
  const sorted = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
  const wData = sorted.map(m => ({ date: m.date, weight: m.weight_kg }));
  const bfData = sorted.filter(m => m.body_fat_percentage).map(m => ({ date: m.date, bf: m.body_fat_percentage }));
  const cw = latest?.weight_kg || 70;
  const ch = latest?.height_cm || 170;
  const bmi = calculateBMI(cw, ch);
  const bmiCat = getBMICategory(bmi);
  const rec = profile ? generateRecommendation({ weight_kg: cw, height_cm: ch, body_fat_percentage: latest?.body_fat_percentage || null,
    age: profile.date_of_birth ? calculateAge(profile.date_of_birth) : 25, gender: profile.gender, activity_level: profile.activity_level }) : null;

  const submit = () => {
    const w = parseFloat(form.weight); if (!w) return;
    const h = parseFloat(form.height) || ch;
    addMetric({ user_id: '', date: toDateString(), weight_kg: w, height_cm: h, bmi: calculateBMI(w, h),
      body_fat_percentage: form.body_fat ? parseFloat(form.body_fat) : null, waist_cm: form.waist ? parseFloat(form.waist) : null,
      chest_cm: null, arms_cm: null, thighs_cm: null, notes: '' });
    setForm({ weight: '', height: '', body_fat: '', waist: '' }); setShowForm(false);
  };

  const stats = [
    { label: 'Weight', value: latest ? `${cw}` : '—', unit: 'kg', color: '#f59e0b' },
    { label: 'BMI', value: latest ? `${bmi}` : '—', unit: bmiCat.label, color: '#ea580c' },
    { label: 'Body Fat', value: latest?.body_fat_percentage ? `${latest.body_fat_percentage}` : '—', unit: '%', color: '#888' },
    { label: 'Waist', value: latest?.waist_cm ? `${latest.waist_cm}` : '—', unit: 'cm', color: '#AAA' },
  ];

  return (
    <div>
      <PageHeader title="Body Metrics" rightAction={<button onClick={() => setShowForm(true)} className="gradient-btn px-4 py-2 text-[12px] flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Log</button>} />
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <Card key={s.label}>
              <span className="text-[11px] font-bold text-[#555] uppercase tracking-wider">{s.label}</span>
              <div className="mt-2"><StatNumber value={s.value} unit={s.unit} size="lg" color={s.color} /></div>
            </Card>
          ))}
        </div>

        {/* Recommendation */}
        {rec && (
          <Card className="!p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[rgba(240,165,0,0.1)] flex items-center justify-center shrink-0">
                {rec.goal === 'cut' ? <TrendingDown className="w-5 h-5 text-[#f59e0b]" /> : rec.goal === 'bulk' ? <TrendingUp className="w-5 h-5 text-[#ea580c]" /> : <Activity className="w-5 h-5 text-[#888]" />}
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-white capitalize mb-1">Recommended: {rec.goal}</h3>
                <p className="text-[12px] text-[#777] leading-relaxed mb-3">{rec.reason}</p>
                <div className="flex flex-wrap gap-2">
                  {[{ l: 'Cal', v: `${rec.daily_calories}`, c: '#f59e0b' }, { l: 'P', v: `${rec.protein_g}g`, c: '#f59e0b' }, { l: 'C', v: `${rec.carbs_g}g`, c: '#ea580c' }, { l: 'F', v: `${rec.fat_g}g`, c: '#888' }].map(p => (
                    <span key={p.l} className="bg-[#1a1a1a] px-3 py-1 rounded-lg text-[11px] font-bold" style={{ color: p.c }}>{p.l}: {p.v}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="!p-5">
            <SectionLabel>Weight Progress</SectionLabel>
            {wData.length > 0 ? (
              <div className="h-52 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={wData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#161616" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={d => formatDateShort(d)} tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} />
                    <YAxis domain={['dataMin - 2', 'dataMax + 2']} tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111111', border: '1px solid #1a1a1a', borderRadius: '12px', fontSize: '12px', color: '#EEE' }} formatter={v => [`${v} kg`, 'Weight']} labelFormatter={d => formatDate(d as string)} />
                    <Line type="monotone" dataKey="weight" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b', stroke: '#111111', strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon={Scale} message="No weight data yet" action="Log weight" onAction={() => setShowForm(true)} />}
          </Card>
          <Card className="!p-5">
            <SectionLabel>Body Fat Trend</SectionLabel>
            {bfData.length > 0 ? (
              <div className="h-52 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={bfData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#161616" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={d => formatDateShort(d)} tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111111', border: '1px solid #1a1a1a', borderRadius: '12px', fontSize: '12px', color: '#EEE' }} />
                    <Area type="monotone" dataKey="bf" stroke="#ea580c" fill="#ea580c" fillOpacity={0.06} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyState icon={Scale} message="Log body fat to track" action="Log metrics" onAction={() => setShowForm(true)} />}
          </Card>
        </div>

        {/* History */}
        {sorted.length > 0 && (
          <div>
            <SectionLabel>History</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...sorted].reverse().slice(0, 12).map(m => (
                <Card key={m.id} className="!flex !flex-row !items-center !justify-between">
                  <div><div className="text-[13px] font-medium text-[#EEE]">{formatDate(m.date)}</div><div className="text-[11px] text-[#555]">BMI: {m.bmi || '—'}</div></div>
                  <StatNumber value={m.weight_kg} unit="kg" size="md" color="#f59e0b" />
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/60 backdrop-blur-sm fade-in" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md bg-[#111111] border border-[#1a1a1a] rounded-t-2xl lg:rounded-2xl shadow-2xl slide-up p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[16px] font-bold text-white">Log Metrics</h3>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center"><X className="w-4 h-4 text-[#777]" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[12px] text-[#AAA] font-semibold block mb-1">Weight (kg)*</label><input type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="70" className="dark-input" autoFocus /></div>
                <div><label className="text-[12px] text-[#AAA] font-semibold block mb-1">Height (cm)</label><input type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} placeholder={String(ch)} className="dark-input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[12px] text-[#AAA] font-semibold block mb-1">Body Fat %</label><input type="number" value={form.body_fat} onChange={e => setForm(f => ({ ...f, body_fat: e.target.value }))} placeholder="15" className="dark-input" /></div>
                <div><label className="text-[12px] text-[#AAA] font-semibold block mb-1">Waist (cm)</label><input type="number" value={form.waist} onChange={e => setForm(f => ({ ...f, waist: e.target.value }))} placeholder="80" className="dark-input" /></div>
              </div>
              <button onClick={submit} className="w-full gradient-btn py-3 mt-1">Save Entry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
