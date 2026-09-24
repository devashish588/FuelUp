import { format, parseISO, startOfDay, isToday, isYesterday, subDays } from 'date-fns';

// Classname utility
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Generate UUID
export function generateId(): string {
  return crypto.randomUUID();
}

// Date formatting
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d, yyyy');
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d');
}

export function toDateString(date: Date = new Date()): string {
  return format(startOfDay(date), 'yyyy-MM-dd');
}

export function getLastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(toDateString(subDays(new Date(), i)));
  }
  return days;
}

// Unit conversions
export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round(lbs / 2.20462 * 10) / 10;
}

export function cmToInches(cm: number): number {
  return Math.round(cm / 2.54 * 10) / 10;
}

export function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54 * 10) / 10;
}

export function cmToFeetInches(cm: number): string {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}'${inches}"`;
}

// BMI calculation (canonical implementation lives in @/lib/calculations/metrics)
export { calculateBMI, getBMICategory } from '@/lib/calculations/metrics';

// Streak + 1RM (canonical implementations live in @/lib/calculations)
export { calculateStreak } from '@/lib/calculations/habits';
export { calculate1RM } from '@/lib/calculations/workout';

// Format weight for display
export function formatWeight(kg: number, unit: 'metric' | 'imperial'): string {
  if (unit === 'imperial') return `${kgToLbs(kg)} lbs`;
  return `${kg} kg`;
}

// Format height for display
export function formatHeight(cm: number, unit: 'metric' | 'imperial'): string {
  if (unit === 'imperial') return cmToFeetInches(cm);
  return `${cm} cm`;
}

// Calculate age from date of birth
export function calculateAge(dob: string): number {
  const today = new Date();
  const birth = parseISO(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Number formatting
export function formatNumber(num: number): string {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

// Percentage
export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
}
