// =============================================
// FuelUp - Recommendation engine (compat re-export)
// Canonical logic now lives in @/lib/calculations. This module is kept
// so existing imports (onboarding, metrics page) keep working.
// =============================================
export { calculateBMR, calculateTDEE } from '@/lib/calculations/energy';
export { calculateBMI } from '@/lib/calculations/metrics';
export { generateRecommendation } from '@/lib/calculations/nutrition';
