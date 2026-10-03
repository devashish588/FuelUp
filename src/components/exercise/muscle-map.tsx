'use client';
// =============================================
// FuelUp - Muscle Map v1 (original artwork)
// Simplified flat anatomy silhouettes authored for FuelUp: geometric,
// symmetric shapes on a dark figure — no traced or third-party anatomy.
// Driven by the canonical registry in lib/exercise/muscles.ts; region
// selection is state-driven (never baked into path data).
// =============================================
import { useCallback } from 'react';
import { BACK_REGION_IDS, FRONT_REGION_IDS, MUSCLE_REGIONS, type MuscleRegionId, type MuscleView } from '@/lib/exercise/muscles';

interface RegionPaths {
  /** Visible silhouette (one path, possibly both body sides). */
  d: string;
}

/** Original geometric silhouettes, drawn on a 200x400 figure grid. */
const FRONT_PATHS: Record<MuscleRegionId, RegionPaths | null> = {
  chest: { d: 'M64 108 Q82 98 97 106 L94 138 Q78 144 66 136 Z M136 108 Q118 98 103 106 L106 138 Q122 144 134 136 Z' },
  front_delts: null,
  side_delts: null,
  biceps: { d: 'M58 96 h14 v44 h-14 Z M128 96 h14 v44 h-14 Z' },
  forearms: { d: 'M60 146 h12 v52 h-12 Z M128 146 h12 v52 h-12 Z' },
  abs: { d: 'M86 168 h14 v18 h-14 Z M102 168 h14 v18 h-14 Z M86 190 h14 v18 h-14 Z M102 190 h14 v18 h-14 Z M86 212 h14 v18 h-14 Z M102 212 h14 v18 h-14 Z' },
  obliques: { d: 'M70 170 L82 174 L74 226 L62 222 Z M130 170 L118 174 L126 226 L138 222 Z' },
  quads: { d: 'M72 232 Q70 280 76 318 L96 318 Q100 280 98 232 Q85 226 72 232 Z M128 232 Q130 280 124 318 L104 318 Q100 280 102 232 Q115 226 128 232 Z' },
  traps: null,
  rear_delts: null,
  lats: null,
  upper_back: null,
  lower_back: null,
  triceps: null,
  glutes: null,
  hamstrings: null,
  calves: null,
};

const FRONT_ELLIPSES: Partial<Record<MuscleRegionId, { cx: number; cy: number; rx: number; ry: number }[]>> = {
  front_delts: [
    { cx: 68, cy: 78, rx: 13, ry: 12 },
    { cx: 132, cy: 78, rx: 13, ry: 12 },
  ],
  side_delts: [
    { cx: 52, cy: 84, rx: 9, ry: 13 },
    { cx: 148, cy: 84, rx: 9, ry: 13 },
  ],
};

const BACK_PATHS: Record<MuscleRegionId, RegionPaths | null> = {
  chest: null,
  front_delts: null,
  side_delts: null,
  biceps: null,
  forearms: null,
  abs: null,
  obliques: null,
  quads: null,
  traps: { d: 'M78 62 L122 62 L112 92 L88 92 Z' },
  rear_delts: null,
  lats: { d: 'M84 100 Q70 110 68 150 Q67 180 78 196 L88 190 Q80 160 84 120 Z M116 100 Q130 110 132 150 Q133 180 122 196 L112 190 Q120 160 116 120 Z' },
  upper_back: { d: 'M88 100 L112 100 L108 140 L92 140 Z' },
  lower_back: { d: 'M86 150 h10 v40 h-10 Z M104 150 h10 v40 h-10 Z' },
  triceps: { d: 'M58 96 h14 v44 h-14 Z M128 96 h14 v44 h-14 Z' },
  glutes: { d: 'M74 210 Q72 244 84 252 Q94 256 97 244 L96 214 Q85 208 74 210 Z M126 210 Q128 244 116 252 Q106 256 103 244 L104 214 Q115 208 126 210 Z' },
  hamstrings: { d: 'M74 258 Q73 296 78 322 L94 322 Q97 296 96 258 Z M126 258 Q127 296 122 322 L106 322 Q103 296 104 258 Z' },
  calves: { d: 'M78 328 Q77 352 82 368 L92 368 Q95 352 94 328 Z M122 328 Q123 352 118 368 L108 368 Q105 352 106 328 Z' },
};

const BACK_ELLIPSES: Partial<Record<MuscleRegionId, { cx: number; cy: number; rx: number; ry: number }[]>> = {
  rear_delts: [
    { cx: 66, cy: 80, rx: 12, ry: 11 },
    { cx: 134, cy: 80, rx: 12, ry: 11 },
  ],
};

/** Neutral base figure (decorative only, never interactive). */
function BaseFigure({ view }: { view: MuscleView }) {
  return (
    <g aria-hidden="true">
      <circle cx="100" cy="28" r="16" fill="#1c1c1c" stroke="#333" strokeWidth="1.5" />
      <path
        d="M70 60 Q100 52 130 60 L136 200 Q100 214 64 200 Z M58 70 Q50 140 54 210 L70 210 Q68 140 72 72 Z M142 70 Q150 140 146 210 L130 210 Q132 140 128 72 Z M72 232 Q70 300 76 372 L94 372 Q97 300 96 232 Z M128 232 Q130 300 124 372 L106 372 Q103 300 104 232 Z"
        fill="#1c1c1c"
        stroke="#333"
        strokeWidth="1.5"
      />
      {view === 'back' && (
        <path d="M96 60 L104 60 L103 200 L97 200 Z" fill="#242424" />
      )}
    </g>
  );
}

interface RegionShapeProps {
  id: MuscleRegionId;
  selected: boolean;
  onSelect: (id: MuscleRegionId) => void;
}

function RegionShape({ id, selected, onSelect }: RegionShapeProps) {
  const region = MUSCLE_REGIONS[id];
  const front = region.view === 'front';
  const path = (front ? FRONT_PATHS : BACK_PATHS)[id];
  const ellipses = (front ? FRONT_ELLIPSES : BACK_ELLIPSES)[id] ?? [];
  const activate = useCallback(() => onSelect(id), [onSelect, id]);
  const fill = selected ? '#f59e0b' : '#2e2e2e';
  const stroke = selected ? '#fbbf24' : '#454545';
  return (
    <g
      role="button"
      tabIndex={0}
      data-region={id}
      aria-label={`${region.label} muscle`}
      aria-pressed={selected}
      className="cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b]"
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      {path && (
        <>
          <path d={path.d} fill={fill} stroke={stroke} strokeWidth="1.5" />
          {/* Transparent hit padding: small visual regions stay tappable. */}
          <path d={path.d} fill="transparent" stroke="transparent" strokeWidth="14" style={{ pointerEvents: 'all' }} />
        </>
      )}
      {ellipses.map((el, i) => (
        <g key={i}>
          <ellipse cx={el.cx} cy={el.cy} rx={el.rx} ry={el.ry} fill={fill} stroke={stroke} strokeWidth="1.5" />
          <ellipse cx={el.cx} cy={el.cy} rx={el.rx + 7} ry={el.ry + 7} fill="transparent" style={{ pointerEvents: 'all' }} />
        </g>
      ))}
    </g>
  );
}

interface MuscleMapProps {
  selected: MuscleRegionId | null;
  onSelect: (id: MuscleRegionId) => void;
}

/** Anterior (front) anatomy view. */
export function MuscleMapFront({ selected, onSelect }: MuscleMapProps) {
  return (
    <svg viewBox="0 0 200 400" role="group" aria-label="Front muscle map" className="h-auto w-full">
      <BaseFigure view="front" />
      {FRONT_REGION_IDS.map((id) => (
        <RegionShape key={id} id={id} selected={selected === id} onSelect={onSelect} />
      ))}
    </svg>
  );
}

/** Posterior (back) anatomy view. */
export function MuscleMapBack({ selected, onSelect }: MuscleMapProps) {
  return (
    <svg viewBox="0 0 200 400" role="group" aria-label="Back muscle map" className="h-auto w-full">
      <BaseFigure view="back" />
      {BACK_REGION_IDS.map((id) => (
        <RegionShape key={id} id={id} selected={selected === id} onSelect={onSelect} />
      ))}
    </svg>
  );
}
