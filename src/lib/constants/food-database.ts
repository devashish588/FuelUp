import type { FoodItem } from '@/lib/types';

export const FOOD_DATABASE: Omit<FoodItem, 'id' | 'created_at' | 'created_by'>[] = [
  // === PROTEINS ===
  { name: 'Chicken Breast (grilled)', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Chicken Thigh (skinless)', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 209, protein_g: 26, carbs_g: 0, fat_g: 10.9, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Salmon Fillet', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 208, protein_g: 20, carbs_g: 0, fat_g: 13, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Tuna (canned in water)', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 116, protein_g: 26, carbs_g: 0, fat_g: 0.8, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Ground Beef (90% lean)', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 176, protein_g: 20, carbs_g: 0, fat_g: 10, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Turkey Breast', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 135, protein_g: 30, carbs_g: 0, fat_g: 1, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Eggs (whole)', brand: '', serving_size: 50, serving_unit: 'g', calories_per_serving: 72, protein_g: 6.3, carbs_g: 0.4, fat_g: 4.8, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Egg Whites', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 52, protein_g: 11, carbs_g: 0.7, fat_g: 0.2, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Shrimp', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 99, protein_g: 24, carbs_g: 0.2, fat_g: 0.3, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Tofu (firm)', brand: '', serving_size: 100, serving_unit: 'g', calories_per_serving: 76, protein_g: 8, carbs_g: 1.9, fat_g: 4.8, fiber_g: 0.3, barcode: null, is_custom: false },
  { name: 'Greek Yogurt (plain, nonfat)', brand: '', serving_size: 170, serving_unit: 'g', calories_per_serving: 100, protein_g: 17, carbs_g: 6, fat_g: 0.7, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Cottage Cheese (low fat)', brand: '', serving_size: 113, serving_unit: 'g', calories_per_serving: 81, protein_g: 14, carbs_g: 3, fat_g: 1.2, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Whey Protein Powder', brand: '', serving_size: 30, serving_unit: 'g', calories_per_serving: 120, protein_g: 24, carbs_g: 3, fat_g: 1.5, fiber_g: 0, barcode: null, is_custom: false },
  // === GRAINS & CARBS ===
  { name: 'White Rice (cooked)', brand: '', serving_size: 158, serving_unit: 'g', calories_per_serving: 206, protein_g: 4.3, carbs_g: 45, fat_g: 0.4, fiber_g: 0.6, barcode: null, is_custom: false },
  { name: 'Brown Rice (cooked)', brand: '', serving_size: 158, serving_unit: 'g', calories_per_serving: 218, protein_g: 4.5, carbs_g: 46, fat_g: 1.6, fiber_g: 3.5, barcode: null, is_custom: false },
  { name: 'Oatmeal (dry)', brand: '', serving_size: 40, serving_unit: 'g', calories_per_serving: 150, protein_g: 5, carbs_g: 27, fat_g: 2.5, fiber_g: 4, barcode: null, is_custom: false },
  { name: 'Whole Wheat Bread', brand: '', serving_size: 28, serving_unit: 'g', calories_per_serving: 69, protein_g: 3.6, carbs_g: 12, fat_g: 1, fiber_g: 1.9, barcode: null, is_custom: false },
  { name: 'Pasta (cooked)', brand: '', serving_size: 140, serving_unit: 'g', calories_per_serving: 220, protein_g: 8, carbs_g: 43, fat_g: 1.3, fiber_g: 2.5, barcode: null, is_custom: false },
  { name: 'Sweet Potato', brand: '', serving_size: 130, serving_unit: 'g', calories_per_serving: 112, protein_g: 2, carbs_g: 26, fat_g: 0.1, fiber_g: 3.8, barcode: null, is_custom: false },
  { name: 'Potato (baked)', brand: '', serving_size: 173, serving_unit: 'g', calories_per_serving: 161, protein_g: 4.3, carbs_g: 37, fat_g: 0.2, fiber_g: 3.8, barcode: null, is_custom: false },
  { name: 'Quinoa (cooked)', brand: '', serving_size: 185, serving_unit: 'g', calories_per_serving: 222, protein_g: 8, carbs_g: 39, fat_g: 3.6, fiber_g: 5, barcode: null, is_custom: false },
  { name: 'Tortilla (flour)', brand: '', serving_size: 45, serving_unit: 'g', calories_per_serving: 140, protein_g: 3.5, carbs_g: 24, fat_g: 3.5, fiber_g: 1, barcode: null, is_custom: false },
  // === FRUITS ===
  { name: 'Banana', brand: '', serving_size: 118, serving_unit: 'g', calories_per_serving: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, fiber_g: 3.1, barcode: null, is_custom: false },
  { name: 'Apple', brand: '', serving_size: 182, serving_unit: 'g', calories_per_serving: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3, fiber_g: 4.4, barcode: null, is_custom: false },
  { name: 'Blueberries', brand: '', serving_size: 148, serving_unit: 'g', calories_per_serving: 84, protein_g: 1.1, carbs_g: 21, fat_g: 0.5, fiber_g: 3.6, barcode: null, is_custom: false },
  { name: 'Strawberries', brand: '', serving_size: 152, serving_unit: 'g', calories_per_serving: 49, protein_g: 1, carbs_g: 12, fat_g: 0.5, fiber_g: 3, barcode: null, is_custom: false },
  { name: 'Orange', brand: '', serving_size: 131, serving_unit: 'g', calories_per_serving: 62, protein_g: 1.2, carbs_g: 15, fat_g: 0.2, fiber_g: 3.1, barcode: null, is_custom: false },
  // === VEGETABLES ===
  { name: 'Broccoli', brand: '', serving_size: 91, serving_unit: 'g', calories_per_serving: 31, protein_g: 2.6, carbs_g: 6, fat_g: 0.3, fiber_g: 2.4, barcode: null, is_custom: false },
  { name: 'Spinach (raw)', brand: '', serving_size: 30, serving_unit: 'g', calories_per_serving: 7, protein_g: 0.9, carbs_g: 1.1, fat_g: 0.1, fiber_g: 0.7, barcode: null, is_custom: false },
  { name: 'Mixed Salad Greens', brand: '', serving_size: 85, serving_unit: 'g', calories_per_serving: 15, protein_g: 1.3, carbs_g: 2.5, fat_g: 0.2, fiber_g: 1.5, barcode: null, is_custom: false },
  { name: 'Avocado', brand: '', serving_size: 68, serving_unit: 'g', calories_per_serving: 114, protein_g: 1.3, carbs_g: 6, fat_g: 10.5, fiber_g: 4.6, barcode: null, is_custom: false },
  { name: 'Tomato', brand: '', serving_size: 123, serving_unit: 'g', calories_per_serving: 22, protein_g: 1.1, carbs_g: 4.8, fat_g: 0.2, fiber_g: 1.5, barcode: null, is_custom: false },
  // === DAIRY ===
  { name: 'Milk (whole)', brand: '', serving_size: 244, serving_unit: 'ml', calories_per_serving: 149, protein_g: 8, carbs_g: 12, fat_g: 8, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Milk (skim)', brand: '', serving_size: 244, serving_unit: 'ml', calories_per_serving: 83, protein_g: 8.3, carbs_g: 12, fat_g: 0.2, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Cheddar Cheese', brand: '', serving_size: 28, serving_unit: 'g', calories_per_serving: 113, protein_g: 7, carbs_g: 0.4, fat_g: 9.3, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Mozzarella Cheese', brand: '', serving_size: 28, serving_unit: 'g', calories_per_serving: 72, protein_g: 6.8, carbs_g: 0.8, fat_g: 4.5, fiber_g: 0, barcode: null, is_custom: false },
  // === FATS & NUTS ===
  { name: 'Olive Oil', brand: '', serving_size: 14, serving_unit: 'ml', calories_per_serving: 119, protein_g: 0, carbs_g: 0, fat_g: 13.5, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Peanut Butter', brand: '', serving_size: 32, serving_unit: 'g', calories_per_serving: 188, protein_g: 7, carbs_g: 8, fat_g: 16, fiber_g: 1.6, barcode: null, is_custom: false },
  { name: 'Almonds', brand: '', serving_size: 28, serving_unit: 'g', calories_per_serving: 164, protein_g: 6, carbs_g: 6, fat_g: 14, fiber_g: 3.5, barcode: null, is_custom: false },
  { name: 'Walnuts', brand: '', serving_size: 28, serving_unit: 'g', calories_per_serving: 185, protein_g: 4.3, carbs_g: 3.9, fat_g: 18.5, fiber_g: 1.9, barcode: null, is_custom: false },
  { name: 'Butter', brand: '', serving_size: 14, serving_unit: 'g', calories_per_serving: 102, protein_g: 0.1, carbs_g: 0, fat_g: 11.5, fiber_g: 0, barcode: null, is_custom: false },
  // === BEVERAGES ===
  { name: 'Coffee (black)', brand: '', serving_size: 240, serving_unit: 'ml', calories_per_serving: 2, protein_g: 0.3, carbs_g: 0, fat_g: 0, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Orange Juice', brand: '', serving_size: 248, serving_unit: 'ml', calories_per_serving: 112, protein_g: 1.7, carbs_g: 26, fat_g: 0.5, fiber_g: 0.5, barcode: null, is_custom: false },
  { name: 'Protein Shake (chocolate)', brand: '', serving_size: 350, serving_unit: 'ml', calories_per_serving: 160, protein_g: 30, carbs_g: 5, fat_g: 2, fiber_g: 1, barcode: null, is_custom: false },
  // === SNACKS & MISC ===
  { name: 'Protein Bar', brand: '', serving_size: 60, serving_unit: 'g', calories_per_serving: 210, protein_g: 20, carbs_g: 22, fat_g: 7, fiber_g: 3, barcode: null, is_custom: false },
  { name: 'Dark Chocolate (70%)', brand: '', serving_size: 28, serving_unit: 'g', calories_per_serving: 170, protein_g: 2.2, carbs_g: 13, fat_g: 12, fiber_g: 3.1, barcode: null, is_custom: false },
  { name: 'Honey', brand: '', serving_size: 21, serving_unit: 'g', calories_per_serving: 64, protein_g: 0.1, carbs_g: 17, fat_g: 0, fiber_g: 0, barcode: null, is_custom: false },
  { name: 'Trail Mix', brand: '', serving_size: 40, serving_unit: 'g', calories_per_serving: 180, protein_g: 5, carbs_g: 16, fat_g: 11, fiber_g: 2, barcode: null, is_custom: false },
  { name: 'Granola Bar', brand: '', serving_size: 42, serving_unit: 'g', calories_per_serving: 190, protein_g: 3, carbs_g: 29, fat_g: 7, fiber_g: 2, barcode: null, is_custom: false },
  { name: 'Rice Cakes', brand: '', serving_size: 9, serving_unit: 'g', calories_per_serving: 35, protein_g: 0.7, carbs_g: 7.3, fat_g: 0.3, fiber_g: 0.4, barcode: null, is_custom: false },
];
