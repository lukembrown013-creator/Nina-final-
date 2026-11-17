// A small built-in list of everyday foods so search works instantly and offline.
// Values are typical reference figures (rounded) for the serving shown:
// [name, serving, kcal, protein g, carbs g, fat g]
const RAW = [
  // fruit
  ['Banana', '1 medium', 105, 1.3, 27, 0.4], ['Apple', '1 medium', 95, 0.5, 25, 0.3], ['Orange', '1 medium', 62, 1.2, 15, 0.2],
  ['Strawberries', '1 cup', 49, 1, 12, 0.5], ['Blueberries', '1 cup', 84, 1.1, 21, 0.5], ['Raspberries', '1 cup', 64, 1.5, 15, 0.8],
  ['Grapes', '1 cup', 104, 1.1, 27, 0.2], ['Mango', '1 cup pieces', 99, 1.4, 25, 0.6], ['Pineapple', '1 cup chunks', 82, 0.9, 22, 0.2],
  ['Watermelon', '1 cup diced', 46, 0.9, 11.5, 0.2], ['Avocado', '1/2 medium', 160, 2, 8.5, 14.7], ['Dates (Medjool)', '2 dates', 133, 0.9, 36, 0.1],
  // vegetables
  ['Broccoli, cooked', '1 cup', 55, 3.7, 11, 0.6], ['Spinach, raw', '2 cups', 14, 1.7, 2.2, 0.2], ['Carrots', '1 medium', 25, 0.6, 6, 0.1],
  ['Bell pepper', '1 medium', 31, 1, 7, 0.3], ['Cucumber', '1 cup sliced', 16, 0.7, 3.8, 0.1], ['Tomato', '1 medium', 22, 1.1, 4.8, 0.2],
  ['Sweet potato, baked', '1 medium', 103, 2.3, 24, 0.2], ['Potato, baked', '1 medium', 161, 4.3, 37, 0.2], ['Green beans, cooked', '1 cup', 44, 2.4, 10, 0.4],
  ['Asparagus, cooked', '6 spears', 20, 2.2, 3.7, 0.2], ['Zucchini, cooked', '1 cup', 27, 2, 5, 0.6], ['Mixed salad greens', '2 cups', 18, 1.5, 3.4, 0.2],
  ['Corn', '1 ear', 88, 3.3, 19, 1.4], ['Edamame, shelled', '1/2 cup', 94, 9, 7, 4],
  // protein
  ['Chicken breast, grilled', '4 oz (113 g)', 187, 35, 0, 4], ['Chicken thigh, cooked', '4 oz (113 g)', 232, 28, 0, 12.5],
  ['Ground turkey 93%, cooked', '4 oz (113 g)', 181, 23, 0, 9.5], ['Ground beef 90%, cooked', '4 oz (113 g)', 231, 28.5, 0, 12],
  ['Steak, sirloin, cooked', '4 oz (113 g)', 207, 30, 0, 8.5], ['Salmon, cooked', '4 oz (113 g)', 233, 25, 0, 14], ['Tuna, canned in water', '1 can (142 g)', 121, 27, 0, 1],
  ['Shrimp, cooked', '4 oz (113 g)', 112, 27, 0.2, 0.3], ['Cod, cooked', '4 oz (113 g)', 119, 26, 0, 1], ['Turkey breast, deli', '3 oz (85 g)', 89, 14.5, 3.5, 1.5],
  ['Bacon', '2 slices', 86, 6, 0.2, 6.7], ['Egg, whole', '1 large', 72, 6.3, 0.4, 4.8], ['Egg whites', '3 large', 51, 10.8, 0.7, 0.2],
  ['Tofu, firm', '1/2 cup (126 g)', 181, 21.8, 3.5, 11], ['Black beans, cooked', '1/2 cup', 114, 7.6, 20, 0.5], ['Chickpeas, cooked', '1/2 cup', 134, 7.3, 22.5, 2.1],
  ['Lentils, cooked', '1/2 cup', 115, 9, 20, 0.4], ['Protein powder, whey', '1 scoop (30 g)', 120, 24, 3, 1.5],
  // dairy
  ['Greek yogurt, plain nonfat', '3/4 cup (170 g)', 100, 17, 6, 0.7], ['Greek yogurt, plain 2%', '3/4 cup (170 g)', 124, 17, 6.6, 3.4],
  ['Cottage cheese, 2%', '1/2 cup', 92, 12, 5, 2.6], ['Milk, 2%', '1 cup', 122, 8, 12, 4.8], ['Milk, whole', '1 cup', 149, 7.7, 11.7, 8],
  ['Almond milk, unsweetened', '1 cup', 37, 1.4, 1.4, 3], ['Oat milk', '1 cup', 120, 3, 16, 5], ['Cheddar cheese', '1 oz (28 g)', 114, 6.5, 0.9, 9.4],
  ['Mozzarella, part-skim', '1 oz (28 g)', 72, 6.9, 0.8, 4.5], ['Feta cheese', '1 oz (28 g)', 75, 4, 1.1, 6], ['String cheese', '1 stick', 80, 7, 1, 5.5],
  ['Butter', '1 tbsp', 102, 0.1, 0, 11.5], ['Cream cheese', '1 tbsp', 51, 0.9, 0.8, 5],
  // grains and starches
  ['White rice, cooked', '1 cup', 205, 4.3, 44.5, 0.4], ['Brown rice, cooked', '1 cup', 218, 4.5, 46, 1.6], ['Quinoa, cooked', '1 cup', 222, 8.1, 39, 3.6],
  ['Pasta, cooked', '1 cup', 221, 8.1, 43, 1.3], ['Oatmeal, cooked', '1 cup', 166, 5.9, 28, 3.6], ['Rolled oats, dry', '1/2 cup (40 g)', 150, 5, 27, 3],
  ['Bread, whole wheat', '1 slice', 81, 4, 13.7, 1.1], ['Bread, white', '1 slice', 77, 2.6, 14.3, 1], ['Sourdough bread', '1 slice', 120, 4.5, 23, 0.8],
  ['Bagel, plain', '1 medium', 277, 11, 55, 1.4], ['English muffin', '1 muffin', 132, 5.1, 26, 1], ['Tortilla, flour (8 in)', '1 tortilla', 146, 3.9, 25, 3.2],
  ['Tortilla, corn', '1 tortilla', 52, 1.4, 10.7, 0.7], ['Granola', '1/2 cup', 240, 6, 32, 10], ['Rice cake', '1 cake', 35, 0.7, 7.3, 0.3],
  ['Pancake', '1 medium (4 in)', 86, 2.4, 11, 3.7], ['Cereal, Cheerios-style', '1 cup', 104, 3.4, 20.5, 1.9],
  // nuts, seeds, fats
  ['Almonds', '1 oz (23 nuts)', 164, 6, 6.1, 14.2], ['Walnuts', '1 oz', 185, 4.3, 3.9, 18.5], ['Cashews', '1 oz', 157, 5.2, 8.6, 12.4],
  ['Peanut butter', '2 tbsp', 191, 7.1, 7.1, 16.4], ['Almond butter', '2 tbsp', 196, 6.7, 6, 17.8], ['Chia seeds', '1 tbsp', 58, 2, 5, 3.7],
  ['Olive oil', '1 tbsp', 119, 0, 0, 13.5], ['Hummus', '2 tbsp', 70, 2, 4, 5], ['Guacamole', '2 tbsp', 45, 0.6, 2.4, 4], ['Trail mix', '1/4 cup', 173, 5, 17, 11],
  // meals and quick foods
  ['Chicken burrito bowl', '1 bowl', 630, 42, 62, 22], ['Caesar salad with chicken', '1 entrée', 470, 37, 15, 29], ['Turkey sandwich', '1 sandwich', 330, 22, 38, 9],
  ['Cheeseburger', '1 burger', 535, 30, 40, 28], ['Pizza, cheese', '1 slice', 285, 12, 36, 10.4], ['Sushi roll, California', '8 pieces', 262, 9, 38, 7],
  ['Chicken stir-fry with rice', '1 plate', 520, 34, 58, 15], ['Avocado toast', '1 slice', 250, 6, 22, 16], ['Scrambled eggs', '2 eggs', 182, 12.2, 2, 13.4],
  ['Omelet, veggie and cheese', '2-egg omelet', 260, 17, 5, 19], ['Smoothie, fruit and protein', '16 oz', 290, 24, 42, 4], ['Acai bowl', '1 bowl', 510, 8, 85, 16],
  ['Chicken noodle soup', '1 cup', 87, 6, 9.5, 2.7], ['French fries', 'medium', 365, 4, 48, 17], ['Mac and cheese', '1 cup', 376, 14, 47, 15],
  // snacks and sweets
  ['Protein bar', '1 bar', 210, 20, 22, 7], ['Granola bar', '1 bar', 140, 3, 20, 5], ['Popcorn, air-popped', '3 cups', 93, 3, 18.6, 1.1],
  ['Tortilla chips', '1 oz (about 10)', 140, 2, 18, 7], ['Dark chocolate', '1 oz', 170, 2.2, 13, 12], ['Ice cream, vanilla', '1/2 cup', 137, 2.3, 16, 7.3],
  ['Chocolate chip cookie', '1 medium', 148, 1.5, 20, 7.4], ['Pretzels', '1 oz', 108, 2.9, 22.5, 0.8],
  // drinks
  ['Coffee, black', '1 cup', 2, 0.3, 0, 0], ['Latte, 2% milk', '12 oz', 150, 10, 15, 6], ['Iced latte, oat milk', '16 oz', 190, 3, 28, 7],
  ['Matcha latte', '12 oz', 190, 9, 26, 5], ['Orange juice', '1 cup', 112, 1.7, 26, 0.5], ['Kombucha', '1 bottle (16 oz)', 60, 0, 14, 0],
  ['Wine, red', '5 oz', 125, 0.1, 3.8, 0], ['Beer', '12 oz', 153, 1.6, 12.6, 0], ['Sports drink', '20 oz', 140, 0, 36, 0], ['Honey', '1 tbsp', 64, 0.1, 17.3, 0]
];
// Typical weight in grams of the serving above, so any food can be logged by weight.
// Foods whose serving already names a weight, e.g. "4 oz (113 g)", are read from the label.
const GRAMS = {
  'Banana': 118, 'Apple': 182, 'Orange': 131, 'Strawberries': 152, 'Blueberries': 148, 'Raspberries': 123, 'Grapes': 151,
  'Mango': 165, 'Pineapple': 165, 'Watermelon': 152, 'Avocado': 100, 'Dates (Medjool)': 48,
  'Broccoli, cooked': 156, 'Spinach, raw': 60, 'Carrots': 61, 'Bell pepper': 119, 'Cucumber': 104, 'Tomato': 123,
  'Sweet potato, baked': 114, 'Potato, baked': 173, 'Green beans, cooked': 125, 'Asparagus, cooked': 90, 'Zucchini, cooked': 180,
  'Mixed salad greens': 85, 'Corn': 90, 'Edamame, shelled': 78,
  'Bacon': 16, 'Egg, whole': 50, 'Egg whites': 99, 'Black beans, cooked': 86, 'Chickpeas, cooked': 82, 'Lentils, cooked': 99,
  'Cottage cheese, 2%': 113, 'Milk, 2%': 244, 'Milk, whole': 244, 'Almond milk, unsweetened': 240, 'Oat milk': 240,
  'String cheese': 28, 'Butter': 14, 'Cream cheese': 15,
  'White rice, cooked': 158, 'Brown rice, cooked': 195, 'Quinoa, cooked': 185, 'Pasta, cooked': 140, 'Oatmeal, cooked': 234,
  'Bread, whole wheat': 32, 'Bread, white': 29, 'Sourdough bread': 45, 'Bagel, plain': 105, 'English muffin': 57,
  'Tortilla, flour (8 in)': 49, 'Tortilla, corn': 26, 'Granola': 55, 'Rice cake': 9, 'Pancake': 38, 'Cereal, Cheerios-style': 28,
  'Peanut butter': 32, 'Almond butter': 32, 'Chia seeds': 12, 'Olive oil': 13.5, 'Hummus': 30, 'Guacamole': 30, 'Trail mix': 37,
  'Pizza, cheese': 107, 'Sushi roll, California': 200, 'Scrambled eggs': 122, 'French fries': 117, 'Mac and cheese': 200,
  'Chicken noodle soup': 240, 'Protein bar': 60, 'Granola bar': 30, 'Popcorn, air-popped': 24, 'Ice cream, vanilla': 66,
  'Chocolate chip cookie': 30, 'Coffee, black': 237, 'Orange juice': 248, 'Honey': 21
};
// Reads a weight out of a serving label: "4 oz (113 g)" -> 113, "100 g" -> 100, "1 oz" -> 28.3.
export function gramsFromLabel(serving) {
  const t = String(serving || '');
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/i);
  if (m) return +m[1];
  m = t.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (m) return +m[1];
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?oz\b/i);
  if (m) return Math.round(+m[1] * 28.35 * 10) / 10;
  return null;
}
export const COMMON_FOODS = RAW.map(([name, serving, kcal, p, c, f]) => ({ name, serving, g: GRAMS[name] || gramsFromLabel(serving), kcal, p, c, f, builtin: true }));
