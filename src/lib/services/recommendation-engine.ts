import { ACTIVITY_MULTIPLIERS } from '@/lib/constants';
import type { ActivityLevel, Recommendation } from '@/lib/types';

interface UserMetrics {
  weight_kg: number;
  height_cm: number;
  body_fat_percentage: number | null;
  age: number;
  gender: 'male' | 'female' | 'other';
  activity_level: ActivityLevel;
}

export function calculateBMR(metrics: UserMetrics): number {
  const { weight_kg, height_cm, age, gender } = metrics;
  if (gender === 'male') return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;
  return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
}

export function calculateTDEE(metrics: UserMetrics): number {
  return Math.round(calculateBMR(metrics) * ACTIVITY_MULTIPLIERS[metrics.activity_level]);
}

export function calculateBMI(weight_kg: number, height_cm: number): number {
  const height_m = height_cm / 100;
  return parseFloat((weight_kg / (height_m * height_m)).toFixed(1));
}

export function generateRecommendation(metrics: UserMetrics): Recommendation {
  const tdee = calculateTDEE(metrics);
  const bmr = calculateBMR(metrics);
  const bmi = calculateBMI(metrics.weight_kg, metrics.height_cm);
  const bf = metrics.body_fat_percentage;
  let goal: 'cut' | 'bulk' | 'recomp';
  let reason: string;
  let calorieAdjustment: number;

  if (bf !== null) {
    if (metrics.gender === 'male') {
      if (bf > 20) { goal = 'cut'; reason = `Body fat (${bf}%) above optimal male range (10-18%). Cut to reduce fat while preserving muscle.`; calorieAdjustment = -500; }
      else if (bf < 12) { goal = 'bulk'; reason = `Body fat (${bf}%) is low. Lean bulk to add muscle.`; calorieAdjustment = 300; }
      else { goal = 'recomp'; reason = `Body fat (${bf}%) in good range. Recomp to build muscle while maintaining.`; calorieAdjustment = 0; }
    } else {
      if (bf > 28) { goal = 'cut'; reason = `Body fat (${bf}%) above optimal female range (18-25%). Cut to lean out.`; calorieAdjustment = -400; }
      else if (bf < 18) { goal = 'bulk'; reason = `Body fat (${bf}%) is low. Lean bulk for health and growth.`; calorieAdjustment = 250; }
      else { goal = 'recomp'; reason = `Body fat (${bf}%) in healthy range. Recomp to optimize physique.`; calorieAdjustment = 0; }
    }
  } else {
    if (bmi > 27) { goal = 'cut'; reason = `BMI (${bmi}) suggests cutting for health improvement.`; calorieAdjustment = -500; }
    else if (bmi < 20) { goal = 'bulk'; reason = `BMI (${bmi}) suggests lean bulking to gain healthy weight.`; calorieAdjustment = 350; }
    else { goal = 'recomp'; reason = `BMI (${bmi}) in good range. Recomp to improve composition.`; calorieAdjustment = 0; }
  }

  const daily_calories = Math.max(tdee + calorieAdjustment, 1200);
  const protein_g = Math.round(metrics.weight_kg * (goal === 'cut' ? 2.2 : goal === 'bulk' ? 1.8 : 2.0));
  const fat_g = Math.round((daily_calories * 0.25) / 9);
  const carbs_g = Math.max(Math.round((daily_calories - protein_g * 4 - fat_g * 9) / 4), 50);

  return { goal, reason, daily_calories, protein_g, carbs_g, fat_g, tdee, bmr: Math.round(bmr), bmi };
}
