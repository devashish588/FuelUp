// Nutrition domain boundary: food, meals, recipes, nutrition calculations.
// UI -> stores -> calculations/{nutrition,quantity,recipes} -> repositories -> API -> Prisma.
export * from '@/lib/calculations/nutrition';
export * from '@/lib/calculations/quantity';
export * from '@/lib/calculations/recipes';
export * from '@/lib/nutrition/display';
export type {
  DailyNutrition,
  DailySummary,
  FavoriteFood,
  FoodItem,
  FoodLog,
  FoodSource,
  FoodState,
  GoalType,
  MealType,
  QuantityUnit,
  Recipe,
  RecipeIngredient,
  RecipeYieldUnit,
  TargetHistory,
  TargetSource,
} from '@/lib/types';
