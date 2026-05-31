'use client';

interface P { protein: { current: number; target: number }; carbs: { current: number; target: number }; fat: { current: number; target: number }; }

function Bar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const p = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[12px] font-semibold text-[#AAA]">{label}</span>
        <span className="text-[11px] text-[#555]">{Math.round(current)}/{target}g</span>
      </div>
      <div className="h-[4px] bg-[#222] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function MacroBars({ protein, carbs, fat }: P) {
  return (
    <div className="space-y-4">
      <Bar label="Protein" current={protein.current} target={protein.target} color="#F0A500" />
      <Bar label="Carbs" current={carbs.current} target={carbs.target} color="#E45826" />
      <Bar label="Fat" current={fat.current} target={fat.target} color="#999" />
    </div>
  );
}
