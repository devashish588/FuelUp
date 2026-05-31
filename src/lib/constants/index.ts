// =============================================
// FuelUp App - Constants
// =============================================

export const APP_NAME = 'FuelUp';

// Chart Colors (Dark Mode Optimized)
export const CHART_COLORS = {
  primary: '#06b6d4',
  protein: '#818cf8',
  carbs: '#fbbf24',
  fat: '#fb7185',
  purple: '#a78bfa',
  remaining: 'rgba(255,255,255,0.06)',
  grid: '#1e293b',
  tooltip: '#1e293b',
} as const;

// App Colors
export const COLORS = {
  primary: '#06b6d4',
  primaryDark: '#0891b2',
  secondary: '#6366f1',
  warning: '#f59e0b',
  danger: '#f43f5e',
  purple: '#8b5cf6',
  slate900: '#f1f5f9',
  slate700: '#94a3b8',
  slate500: '#64748b',
  slate200: 'rgba(255,255,255,0.08)',
  slate100: 'rgba(255,255,255,0.04)',
  white: '#ffffff',
} as const;

// Activity Level Multipliers (Mifflin-St Jeor)
export const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
} as const;

// Activity Level Labels
export const ACTIVITY_LABELS = {
  sedentary: 'Sedentary (office job, little exercise)',
  lightly_active: 'Lightly Active (light exercise 1-3 days/week)',
  moderately_active: 'Moderately Active (exercise 3-5 days/week)',
  very_active: 'Very Active (hard exercise 6-7 days/week)',
  extremely_active: 'Extremely Active (athlete, physical job)',
} as const;

// Goal Labels
export const GOAL_LABELS = {
  cut: 'Cut (Fat Loss)',
  bulk: 'Bulk (Muscle Gain)',
  recomp: 'Recomposition',
} as const;

// Meal Types (icons removed - using Lucide in components)
export const MEAL_TYPES = [
  { value: 'breakfast' as const, label: 'Breakfast', icon: 'sunrise', time: '6:00 AM - 10:00 AM' },
  { value: 'lunch' as const, label: 'Lunch', icon: 'sun', time: '11:00 AM - 2:00 PM' },
  { value: 'dinner' as const, label: 'Dinner', icon: 'moon', time: '5:00 PM - 9:00 PM' },
  { value: 'snack' as const, label: 'Snacks', icon: 'coffee', time: 'Any time' },
] as const;

// Muscle Groups (icons removed - using Lucide in components)
export const MUSCLE_GROUPS = [
  { value: 'chest' as const, label: 'Chest' },
  { value: 'back' as const, label: 'Back' },
  { value: 'shoulders' as const, label: 'Shoulders' },
  { value: 'legs' as const, label: 'Legs' },
  { value: 'arms' as const, label: 'Arms' },
  { value: 'core' as const, label: 'Core' },
  { value: 'cardio' as const, label: 'Cardio' },
  { value: 'full_body' as const, label: 'Full Body' },
] as const;

// Default Habits (icons removed - using Lucide in components)
export const DEFAULT_HABITS = [
  {
    name: 'Steps',
    icon: '',
    color: '#06b6d4',
    target_value: 10000,
    unit: 'steps',
    is_default: true,
  },
  {
    name: 'Water',
    icon: '',
    color: '#6366f1',
    target_value: 8,
    unit: 'glasses',
    is_default: true,
  },
  {
    name: 'Sleep',
    icon: '',
    color: '#8b5cf6',
    target_value: 8,
    unit: 'hours',
    is_default: true,
  },
] as const;

// Navigation Items
export const NAV_ITEMS = [
  { path: '/dashboard', label: 'Home', icon: 'LayoutDashboard' },
  { path: '/calories', label: 'Food', icon: 'UtensilsCrossed' },
  { path: '/exercise', label: 'Workout', icon: 'Dumbbell' },
  { path: '/habits', label: 'Habits', icon: 'Target' },
  { path: '/settings', label: 'Profile', icon: 'User' },
] as const;
