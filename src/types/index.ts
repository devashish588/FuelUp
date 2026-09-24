// =============================================
// FuelUp - Public type surface (target structure)
// Canonical domain types live in @/lib/types. This barrel re-exports
// them plus DTO/view-model helpers so features import from '@/types'.
// Where representations genuinely differ (Domain -> API DTO -> UI view
// model), convert explicitly via @/lib/mappers (no duplicated logic).
// =============================================
export * from '@/lib/types';
export type { Recommendation } from '@/lib/types';
