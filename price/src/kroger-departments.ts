/**
 * Which Pexi department a Kroger listing belongs to, from the file's own
 * `category` and `subcategory` columns (2026-11-25).
 *
 * WHY. Every `kroger-names` catalogue row used to take its SOURCE's department,
 * 'food' (catalogue/src/placement.ts DEPARTMENT_OF_SOURCE), so shampoo,
 * detergent and pet toys joined food price pools. The file labels each row
 * with one of 24 categories (counted 2026-11-25 over the 94,000-odd rows with a
 * usable barcode); most separate food from non-food cleanly, a few are mixed
 * and get subcategory overrides below.
 *
 * DEPARTMENTS USED are only the ones Pexi already has (DEPARTMENT_OF_SOURCE):
 *   food       grocery, drinks bought as groceries, vitamins and supplements
 *              (Open Food Facts carries supplements as food)
 *   beauty     hair, skin, makeup, oral care, deodorant
 *   pet        pet FOOD and treats only (the department is Open Pet Food Facts)
 *   general    household, kitchenware, toys, garden, baby gear, medicine, flowers
 *   electronics
 * The 'drinks' department is deposit-return containers (returnit, consignaction),
 * so Kroger beverages stay in food.
 *
 * AN UNMAPPED CATEGORY gets `null` (the row then falls back to its source's
 * department) AND is counted by the reader and printed by every command; it is
 * never silently turned into food by this file. A subcategory the table does
 * not name takes its category's default, which is a stated choice per category.
 */

export interface CategoryRule {
  /** The department of every subcategory not named in `sub`. */
  readonly dept: string;
  /** Subcategory -> department, for the categories that mix food and non-food. */
  readonly sub?: Readonly<Record<string, string>>;
}

/** Every `category` value in kroger_products.csv, with its department. */
export const KROGER_CATEGORY_DEPARTMENT: Readonly<Record<string, CategoryRule>> = {
  Beauty: { dept: 'beauty' },
  'Personal Care': { dept: 'beauty' },
  'Vitamins and Supplements': { dept: 'food' },
  Pet: {
    dept: 'pet',
    // Not pet food: toys, grooming, litter, cages and tanks, bird care (seed and cages mixed).
    sub: {
      'Pet Toys': 'general',
      'Grooming and Wellness': 'general',
      'Bird Care': 'general',
      'Pet Supplies': 'general',
      'Litter and Potty': 'general',
      'Aquarium Needs': 'general',
    },
  },
  'Cleaning and Household': { dept: 'general' },
  'Health and Wellness': {
    dept: 'general',
    sub: {
      'Vitamins and Supplements': 'food',
      'Weight Management and Nutrition': 'food',
      'Energy and Stimulants': 'food',
    },
  },
  Electronics: { dept: 'electronics' },
  Pantry: { dept: 'food' },
  'Natural and Organic': {
    dept: 'food',
    sub: {
      'Beauty and Personal Care': 'beauty',
      'Cleaning and Household': 'general',
      // Mixed (diapers, wipes, food): kept out of food pools rather than guessed into them.
      Baby: 'general',
    },
  },
  Beverages: { dept: 'food' },
  Baby: {
    dept: 'general',
    sub: {
      'Baby & Toddler Food, Snacks & Beverages': 'food',
      'Baby Formula': 'food',
      'Baby Body and Hair Care': 'beauty',
    },
  },
  'Toys and Games': { dept: 'general' },
  'Kitchen and Dining': { dept: 'general' },
  'Garden and Patio': { dept: 'general' },
  Floral: { dept: 'general' },
  Breakfast: { dept: 'food' },
  Frozen: { dept: 'food' },
  Candy: { dept: 'food' },
  'Dairy and Eggs': { dept: 'food' },
  Meat: { dept: 'food' },
  Seafood: { dept: 'food' },
  Deli: { dept: 'food' },
  'Fresh Fruit and Vegetables': { dept: 'food' },
  Bakery: { dept: 'food' },
};

/** The department for a row's category and subcategory, or null when the category is not in the table. */
export function krogerDepartment(category: string, subcategory: string): string | null {
  const rule = Object.hasOwn(KROGER_CATEGORY_DEPARTMENT, category.trim()) ? KROGER_CATEGORY_DEPARTMENT[category.trim()] : undefined;
  if (!rule) return null;
  const s = subcategory.trim();
  return rule.sub && Object.hasOwn(rule.sub, s) ? rule.sub[s]! : rule.dept;
}
