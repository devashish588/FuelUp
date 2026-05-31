'use client';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const remaining = Math.max(target - consumed, 0);
  const over = consumed > target;
  const data = [{ name: 'c', value: consumed }, { name: 'r', value: over ? 0 : remaining }];
  return (
    <div className="relative w-44 h-44 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={70} startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
            <Cell fill={over ? '#E45826' : '#F0A500'} />
            <Cell fill="#222" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-white">{consumed}</span>
        <span className="text-[11px] text-[#555]">of {target} kcal</span>
        <span className={`text-[11px] font-semibold mt-0.5 ${over ? 'text-[#E45826]' : 'text-[#F0A500]'}`}>
          {over ? `${consumed - target} over` : `${remaining} left`}
        </span>
      </div>
    </div>
  );
}
