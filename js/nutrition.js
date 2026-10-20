/* OpenPlate — nutrition.js : offline nutrition estimator
   Per-100g values (kcal, protein g, carb g, fat g) + gram weights for volume units.
   Estimates only — clearly labeled in the UI. */
'use strict';

const T = {
  // meat / fish
  'chicken breast': [165, 31, 0, 3.6], 'chicken thighs': [209, 26, 0, 10.9], 'chicken': [190, 27, 0, 8],
  'ground beef': [250, 26, 0, 15], 'beef stew meat': [210, 26, 0, 11], 'beef': [217, 26, 0, 12],
  'ground turkey': [170, 27, 0, 6], 'turkey': [150, 27, 0, 4], 'pork': [242, 27, 0, 14],
  'bacon': [541, 37, 1.4, 42], 'sausage': [301, 12, 2, 27], 'ham': [145, 21, 1.5, 6],
  'lamb': [294, 25, 0, 21], 'duck': [337, 19, 0, 28], 'chorizo': [455, 24, 2, 38],
  'prosciutto': [195, 27, 0, 9], 'salami': [336, 22, 2, 26], 'meatball': [218, 14, 6, 15],
  'shrimp': [99, 24, 0.2, 0.3], 'salmon': [208, 20, 0, 13], 'cod': [82, 18, 0, 0.7],
  'white fish': [120, 24, 0, 2], 'tilapia': [128, 26, 0, 2.7], 'halibut': [111, 23, 0, 1.6],
  'tuna': [116, 26, 0, 1], 'scallops': [111, 20, 5, 1], 'squid': [175, 16, 8, 8],
  // dairy / eggs
  'egg': [155, 13, 1.1, 11], 'eggs': [155, 13, 1.1, 11],
  'milk': [61, 3.2, 4.8, 3.3], 'butter': [717, 0.9, 0.1, 81],
  'cheddar': [402, 25, 1.3, 33], 'mozzarella': [300, 22, 2.2, 22], 'parmesan': [431, 38, 4.1, 29],
  'feta': [264, 14, 4.1, 21], 'greek yogurt': [59, 10, 3.6, 0.4], 'yogurt': [61, 3.5, 4.7, 3.3],
  'cream': [340, 2.1, 2.8, 36], 'sour cream': [198, 2.4, 4.6, 19], 'cream cheese': [342, 6, 4, 34],
  'ricotta': [174, 11, 3, 13], 'gouda': [356, 25, 2.2, 27], 'swiss cheese': [380, 27, 5, 28],
  'mascarpone': [440, 4.9, 3.6, 46], 'condensed milk': [321, 8, 54, 8],
  // produce
  'potato': [77, 2, 17, 0.1], 'sweet potatoes': [86, 1.6, 20, 0.1], 'sweet potato': [86, 1.6, 20, 0.1],
  'onion': [40, 1.1, 9.3, 0.1], 'yellow onion': [40, 1.1, 9.3, 0.1], 'red onion': [40, 1.1, 9.3, 0.1],
  'garlic': [149, 6.4, 33, 0.5], 'ginger': [80, 1.8, 18, 0.8], 'ginger root': [80, 1.8, 18, 0.8],
  'carrot': [41, 0.9, 9.6, 0.2], 'carrots': [41, 0.9, 9.6, 0.2], 'celery': [16, 0.7, 3, 0.2],
  'bell pepper': [26, 1, 6, 0.3], 'red bell pepper': [31, 1, 6, 0.3], 'green bell pepper': [20, 0.9, 4.6, 0.2],
  'jalapeño': [29, 0.9, 6.5, 0.4], 'chili': [40, 1.9, 9, 0.4],
  'tomato': [18, 0.9, 3.9, 0.2], 'cherry tomatoes': [18, 0.9, 3.9, 0.2], 'canned tomatoes': [32, 1.6, 6.6, 0.2],
  'tomato sauce': [29, 1.4, 6.6, 0.2], 'tomato paste': [82, 4.3, 18, 0.5], 'salsa': [36, 1.5, 7, 0.2],
  'zucchini': [17, 1.2, 3.1, 0.3], 'cucumber': [15, 0.7, 3.6, 0.1], 'mushroom': [22, 3.1, 3.3, 0.3],
  'broccoli': [34, 2.8, 6.6, 0.4], 'cauliflower': [25, 1.9, 5, 0.3], 'spinach': [23, 2.9, 3.6, 0.4],
  'kale': [49, 4.3, 8.8, 0.9], 'lettuce': [15, 1.4, 2.9, 0.2], 'cabbage': [25, 1.3, 5.8, 0.1],
  'green bean': [31, 1.8, 7, 0.2], 'asparagus': [20, 2.2, 3.9, 0.1], 'peas': [81, 5.4, 14, 0.4],
  'corn': [96, 3.4, 21, 1.5], 'eggplant': [25, 1, 5.9, 0.2], 'squash': [34, 1.2, 8, 0.3],
  'pumpkin': [26, 1, 6.5, 0.1], 'butternut': [45, 1, 12, 0.1], 'avocado': [160, 2, 8.5, 15],
  'lemon': [29, 1.1, 9.3, 0.3], 'lime': [30, 0.7, 10.5, 0.2], 'orange': [47, 0.9, 11.8, 0.1],
  'apple': [52, 0.3, 14, 0.2], 'banana': [89, 1.1, 23, 0.3], 'strawberry': [32, 0.7, 7.7, 0.3],
  'blueberry': [57, 0.7, 14, 0.3], 'raspberry': [52, 1.2, 12, 0.7], 'grape': [69, 0.7, 18, 0.2],
  'mango': [60, 0.8, 15, 0.4], 'pineapple': [50, 0.5, 13, 0.1], 'peach': [39, 0.9, 9.5, 0.3],
  'pear': [57, 0.4, 15, 0.1], 'cherry': [63, 1.1, 16, 0.2], 'watermelon': [30, 0.6, 7.6, 0.2],
  'olives': [115, 0.8, 6, 10.7], 'olive': [115, 0.8, 6, 10.7],
  // pantry
  'rice': [360, 6.7, 79, 0.7], 'white rice': [360, 6.7, 79, 0.7], 'basmati rice': [356, 8.1, 78, 0.7],
  'cooked rice': [130, 2.7, 28, 0.3], 'arborio rice': [360, 6.7, 79, 0.7],
  'pasta': [371, 13, 75, 1.5], 'penne': [371, 13, 75, 1.5], 'spaghetti': [371, 13, 75, 1.5],
  'macaroni': [371, 13, 75, 1.5], 'noodles': [358, 12, 74, 1.5], 'egg noodles': [384, 13, 72, 3.3],
  'flour': [364, 10, 76, 1], 'cornstarch': [381, 0.3, 91, 0.1], 'breadcrumb': [395, 13, 72, 5],
  'quinoa': [368, 14, 64, 6.1], 'oats': [389, 17, 66, 6.9], 'couscous': [376, 13, 77, 0.6],
  'black beans': [132, 8.9, 24, 0.5], 'kidney beans': [127, 8.7, 23, 0.5], 'chickpeas': [164, 8.9, 27, 2.6],
  'cannellini beans': [139, 9.7, 25, 0.5], 'lentils': [116, 9, 20, 0.4], 'refried beans': [91, 5.9, 15, 0.9],
  'broth': [8, 1, 0.9, 0.2], 'chicken broth': [8, 1, 0.9, 0.2], 'beef broth': [10, 1.2, 0.9, 0.3], 'vegetable broth': [6, 0.5, 1, 0.2],
  'olive oil': [884, 0, 0, 100], 'vegetable oil': [884, 0, 0, 100], 'sesame oil': [884, 0, 0, 100],
  'coconut milk': [197, 2, 2.8, 21], 'peanut butter': [588, 25, 20, 50],
  'soy sauce': [53, 8, 4.9, 0.6], 'honey': [304, 0.3, 82, 0], 'syrup': [260, 0, 67, 0.1],
  'sugar': [387, 0, 100, 0], 'brown sugar': [380, 0, 98, 0],
  'vinegar': [21, 0, 0.9, 0], 'rice vinegar': [20, 0, 0.6, 0],
  'mayonnaise': [680, 1, 0.6, 75], 'mustard': [66, 4.4, 5.8, 3.3], 'ketchup': [101, 1.3, 25, 0.1],
  'pesto': [450, 5, 6, 46], 'tahini': [595, 17, 21, 54], 'hummus': [166, 7.9, 14, 9.6],
  'walnuts': [654, 15, 14, 65], 'almonds': [579, 21, 22, 50], 'cashews': [553, 18, 30, 44], 'pecans': [691, 9.2, 14, 72],
  'sesame seeds': [573, 18, 23, 50], 'chocolate': [546, 4.9, 61, 31], 'chocolate chips': [490, 4, 70, 24],
  'raisins': [299, 3.1, 79, 0.5], 'tortilla': [300, 8, 49, 7], 'corn tortillas': [218, 5.7, 45, 2.9],
  'bread': [265, 9, 49, 3.2], 'croutons': [465, 12, 71, 14], 'crackers': [490, 8, 60, 23],
  'falafel': [333, 13, 32, 18], 'tofu': [76, 8, 1.9, 4.8], 'tempeh': [192, 20, 7.6, 11],
  'edamame': [121, 12, 9, 5], 'seaweed': [43, 1.7, 9.6, 0.6],
  'worcestershire': [78, 0, 19, 0], 'hot sauce': [11, 0.5, 1.8, 0.4], 'fish sauce': [35, 5, 0.4, 0],
  'frozen peas and carrots': [65, 3, 12, 0.4], 'frozen corn': [88, 3.2, 20, 1.2],
  'wine': [83, 0.1, 2.6, 0], 'beer': [43, 0.5, 3.6, 0], 'coffee': [2, 0.1, 0, 0], 'tea': [1, 0, 0.3, 0],
  'juice': [45, 0.7, 10, 0.2],
};

// gram weight of 1 cup for density-sensitive ingredients; default 130g/cup for powdery, 240g liquid-y, 110g veg
const DENSER = {
  'flour': 120, 'sugar': 200, 'brown sugar': 213, 'rice': 185, 'white rice': 185, 'basmati rice': 185,
  'arborio rice': 190, 'quinoa': 170, 'oats': 90, 'couscous': 173, 'cocoa': 100,
  'peanut butter': 258, 'honey': 340, 'syrup': 322, 'mayonnaise': 220, 'ketchup': 270, 'pesto': 240,
  'butter': 227, 'milk': 244, 'cream': 238, 'yogurt': 245, 'greek yogurt': 245, 'sour cream': 232,
  'olive oil': 216, 'vegetable oil': 218, 'sesame oil': 218, 'soy sauce': 256, 'broth': 240,
  'chicken broth': 240, 'beef broth': 240, 'vegetable broth': 240, 'coconut milk': 240, 'tomato sauce': 245,
  'tomato paste': 265, 'cheddar': 113, 'mozzarella': 112, 'parmesan': 100, 'feta': 150,
  'almonds': 145, 'walnuts': 117, 'chocolate chips': 170, 'breadcrumb': 108, 'cornstarch': 138,
  'chickpeas': 240, 'black beans': 240, 'kidney beans': 240, 'lentils': 240, 'corn': 165,
  'spinach': 30, 'kale': 67, 'lettuce': 47, 'arugula': 20, 'cilantro': 16, 'parsley': 30, 'basil': 21,
  'mushroom': 70, 'onion': 160, 'carrot': 128, 'celery': 100, 'bell pepper': 150, 'broccoli': 91,
  'cauliflower': 107, 'zucchini': 124, 'cucumber': 130, 'tomato': 180, 'strawberry': 150, 'blueberry': 148,
  'raisins': 145, 'falafel': 130, 'tortilla chips': 120, 'sesame seeds': 138, 'nuts': 130, 'tahini': 240,
};

const FALLBACK = [150, 6, 15, 6]; // generic mixed-food estimate per 100g
function per100(name) {
  const s = name.toLowerCase();
  let best = null, bestLen = 0;
  for (const k of Object.keys(T)) {
    if ((s.includes(k) || k.includes(s)) && k.length > bestLen) { best = T[k]; bestLen = k.length; }
  }
  return best || FALLBACK;
}
function cupG(name) {
  const s = name.toLowerCase();
  let best = null, bestLen = 0;
  for (const k of Object.keys(DENSER)) {
    if ((s.includes(k) || k.includes(s)) && k.length > bestLen) { best = DENSER[k]; bestLen = k.length; }
  }
  return best ?? 130;
}
const GB = { ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, cup: 236.588, 'fl oz': 29.574, pint: 473.176, quart: 946.353 };
const MASS = { g: 1, kg: 1000, oz: 28.35, lb: 453.592 };

function gramsOf(ing) {
  if (ing.qty == null) return 60; // unknown amount: modest default
  const { qty, unit, name } = ing;
  if (unit && unit in MASS) return qty * MASS[unit];
  if (unit && unit in GB) {
    const cg = cupG(name);
    return (qty * GB[unit] / 236.588) * cg;
  }
  // count units — per-item grams for common ones
  const per = {
    clove: 3, egg: 50, slice: 28, stick: 55, sprig: 5, leaf: 2, stalk: 40, can: 400,
    bunch: 60, head: 300, fillet: 150, wedge: 40, ear: 90, sheet: 4, handful: 30, wheel: 200, package: 300,
  }[unit] ?? 100;
  return qty * per;
}

/** estimate nutrition for a recipe {ingredients, servings} → {kcal, protein, carb, fat} per serving */
export function estimateNutrition(recipe) {
  const totals = { kcal: 0, protein: 0, carb: 0, fat: 0 };
  for (const ing of recipe.ingredients || []) {
    const obj = typeof ing === 'string' ? { name: ing, qty: null, unit: null } : ing;
    const g = gramsOf(obj);
    const [k, p, c, f] = per100(obj.name);
    totals.kcal += k * g / 100;
    totals.protein += p * g / 100;
    totals.carb += c * g / 100;
    totals.fat += f * g / 100;
  }
  const serv = recipe.servings || 4;
  return {
    kcal: Math.round(totals.kcal / serv),
    protein: Math.round(totals.protein / serv),
    carb: Math.round(totals.carb / serv),
    fat: Math.round(totals.fat / serv),
  };
}
