// =============================================
// FuelUp - Workout calculations (single source of truth)
// Epley 1RM + volume helpers. Formulas preserved from lib/utils.
// =============================================

export function calculate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps === 0) return 0;
  return Math.round(weight * (1 + reps / 30));
}

export function calculateSetVolume(weightKg: number | null, reps: number | null): number {
  return (weightKg ?? 0) * (reps ?? 0);
}

export function calculateWorkoutVolume(
  exercises: { sets: { weight_kg: number | null; reps: number | null }[] }[]
): number {
  return exercises.reduce(
    (total, ex) => total + ex.sets.reduce((s, set) => s + calculateSetVolume(set.weight_kg, set.reps), 0),
    0
  );
}

export function calculateWorkoutDurationMinutes(startIso: string, endIso: string = new Date().toISOString()): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(Math.round(ms / 60000), 0);
}
