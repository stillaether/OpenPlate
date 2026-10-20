/* OpenPlate — prices.js : estimated Canadian grocery prices (CAD) + store deep links
   Prices are planning estimates compiled from typical 2025 national shelf prices
   (Superstore / No Frills / Walmart CA baseline). Actual prices vary by store,
   province and season — the UI always labels them as estimates. */
'use strict';

import { convert, unitDim, guessAisle } from './util.js';

export const CURRENCY = 'CA$';
export const fmtCAD = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2);

/* ---------- price table ----------
   [keyword, price, per]  ·  per: 'kg' | 'L' | 'ea'
   Longest keyword match wins, so order doesn't matter. */
const TABLE = [
  // meat & poultry ($/kg)
  ['chicken breast', 17.5, 'kg'], ['chicken thigh', 11.0, 'kg'], ['chicken leg', 9.0, 'kg'], ['chicken wing', 11.0, 'kg'],
  ['ground chicken', 11.5, 'kg'], ['chicken', 13.0, 'kg'], ['turkey', 12.5, 'kg'], ['duck', 16.0, 'kg'],
  ['ground beef', 13.5, 'kg'], ['ground pork', 8.5, 'kg'], ['ground lamb', 20.0, 'kg'], ['ground turkey', 12.5, 'kg'],
  ['steak', 21.0, 'kg'], ['brisket', 15.0, 'kg'], ['ribs', 14.5, 'kg'], ['beef', 16.0, 'kg'],
  ['pork chop', 11.0, 'kg'], ['pork loin', 9.0, 'kg'], ['pork tenderloin', 13.5, 'kg'], ['pork belly', 11.0, 'kg'], ['pork', 9.5, 'kg'],
  ['bacon', 13.0, 'kg'], ['ham', 11.0, 'kg'], ['sausage', 11.5, 'kg'], ['chorizo', 13.0, 'kg'],
  ['prosciutto', 32.0, 'kg'], ['salami', 22.0, 'kg'], ['pepperoni', 18.0, 'kg'], ['meatball', 11.0, 'kg'],
  ['lamb', 21.0, 'kg'], ['veal', 18.0, 'kg'], ['goat', 19.0, 'kg'],
  // fish & seafood ($/kg)
  ['salmon', 26.0, 'kg'], ['cod', 20.0, 'kg'], ['tilapia', 14.0, 'kg'], ['halibut', 32.0, 'kg'],
  ['tuna', 26.0, 'kg'], ['shrimp', 22.0, 'kg'], ['prawn', 22.0, 'kg'], ['scallop', 33.0, 'kg'],
  ['squid', 15.0, 'kg'], ['calamari', 16.0, 'kg'], ['crab', 32.0, 'kg'], ['lobster', 40.0, 'kg'],
  ['mussel', 9.0, 'kg'], ['clam', 12.0, 'kg'], ['oyster', 24.0, 'kg'], ['anchovy', 22.0, 'kg'],
  ['sardine', 16.0, 'kg'], ['trout', 20.0, 'kg'], ['mackerel', 14.0, 'kg'], ['fish', 18.0, 'kg'],
  // dairy ($/kg or $/L)
  ['milk', 1.95, 'L'], ['cream', 4.5, 'L'], ['butter', 14.0, 'kg'], ['margarine', 8.0, 'kg'],
  ['cheddar', 15.5, 'kg'], ['mozzarella', 13.0, 'kg'], ['parmesan', 25.0, 'kg'], ['feta', 16.0, 'kg'],
  ['ricotta', 9.0, 'kg'], ['gouda', 15.0, 'kg'], ['swiss cheese', 18.0, 'kg'], ['cheese', 14.0, 'kg'],
  ['yogurt', 4.0, 'kg'], ['greek yogurt', 7.5, 'kg'], ['sour cream', 6.0, 'kg'], ['cream cheese', 9.0, 'kg'],
  ['mascarpone', 20.0, 'kg'], ['ghee', 22.0, 'kg'], ['condensed milk', 5.0, 'kg'], ['eggs', 0.45, 'ea'], ['egg', 0.45, 'ea'],
  // produce ($/kg)
  ['onion', 1.8, 'kg'], ['shallot', 8.0, 'kg'], ['scallion', 8.0, 'kg'], ['leek', 4.5, 'kg'],
  ['garlic', 11.0, 'kg'], ['ginger', 9.0, 'kg'], ['carrot', 2.0, 'kg'], ['celery', 3.0, 'kg'],
  ['potato', 2.2, 'kg'], ['sweet potato', 3.5, 'kg'], ['tomato', 4.5, 'kg'], ['cherry tomato', 8.0, 'kg'],
  ['canned tomato', 3.2, 'kg'], ['tomato sauce', 3.5, 'kg'], ['tomato paste', 5.0, 'kg'], ['salsa', 6.0, 'kg'],
  ['lettuce', 4.0, 'kg'], ['spinach', 9.0, 'kg'], ['kale', 8.0, 'kg'], ['arugula', 11.0, 'kg'], ['greens', 7.0, 'kg'],
  ['broccoli', 4.5, 'kg'], ['cauliflower', 4.5, 'kg'], ['cabbage', 2.5, 'kg'], ['bok choy', 4.5, 'kg'],
  ['zucchini', 4.0, 'kg'], ['cucumber', 2.5, 'kg'], ['mushroom', 8.0, 'kg'], ['bell pepper', 6.5, 'kg'],
  ['jalape', 8.0, 'kg'], ['chili', 8.0, 'kg'], ['eggplant', 4.5, 'kg'], ['aubergine', 4.5, 'kg'],
  ['squash', 3.0, 'kg'], ['butternut', 3.5, 'kg'], ['pumpkin', 3.0, 'kg'], ['beet', 3.0, 'kg'],
  ['turnip', 2.5, 'kg'], ['radish', 3.0, 'kg'], ['parsnip', 4.0, 'kg'], ['asparagus', 11.0, 'kg'],
  ['brussels', 7.0, 'kg'], ['artichoke', 6.0, 'kg'], ['okra', 7.0, 'kg'], ['peas', 6.0, 'kg'],
  ['green bean', 7.0, 'kg'], ['corn', 1.2, 'ea'],
  ['lemon', 4.5, 'kg'], ['lime', 6.0, 'kg'], ['orange', 3.5, 'kg'], ['grapefruit', 4.0, 'kg'],
  ['apple', 4.5, 'kg'], ['banana', 1.7, 'kg'], ['avocado', 7.9, 'kg'], ['strawberr', 10.0, 'kg'],
  ['blueberr', 14.0, 'kg'], ['raspberr', 15.0, 'kg'], ['blackberr', 15.0, 'kg'], ['grape', 7.0, 'kg'],
  ['mango', 4.5, 'kg'], ['pineapple', 3.5, 'ea'], ['peach', 5.0, 'kg'], ['pear', 4.5, 'kg'],
  ['cherry', 9.0, 'kg'], ['watermelon', 1.8, 'kg'], ['melon', 2.5, 'kg'], ['kiwi', 6.0, 'kg'],
  ['coconut', 4.0, 'ea'], ['plantain', 2.5, 'kg'], ['date', 12.0, 'kg'], ['fig', 14.0, 'kg'],
  ['cilantro', 2.0, 'ea'], ['parsley', 2.0, 'ea'], ['basil', 2.5, 'ea'], ['mint', 2.0, 'ea'],
  ['dill', 2.0, 'ea'], ['sage', 2.5, 'ea'], ['rosemary', 2.5, 'ea'], ['thyme', 2.5, 'ea'], ['herb', 2.2, 'ea'],
  ['tamarind', 9.0, 'kg'],
  // pantry ($/kg, $/L or $/ea for cans)
  ['rice', 4.0, 'kg'], ['basmati', 5.0, 'kg'], ['jasmine', 5.0, 'kg'], ['arborio', 6.5, 'kg'],
  ['pasta', 3.0, 'kg'], ['spaghetti', 3.0, 'kg'], ['penne', 3.0, 'kg'], ['macaroni', 3.0, 'kg'],
  ['linguine', 3.2, 'kg'], ['fettuccine', 3.2, 'kg'], ['noodle', 4.5, 'kg'], ['orzo', 4.0, 'kg'],
  ['couscous', 6.0, 'kg'], ['quinoa', 9.0, 'kg'], ['oat', 4.0, 'kg'], ['cereal', 7.0, 'kg'], ['granola', 9.0, 'kg'],
  ['flour', 2.8, 'kg'], ['cornstarch', 4.0, 'kg'], ['corn starch', 4.0, 'kg'], ['breadcrumb', 5.0, 'kg'],
  ['sugar', 2.5, 'kg'], ['brown sugar', 3.0, 'kg'], ['honey', 12.0, 'kg'], ['syrup', 10.0, 'kg'],
  ['olive oil', 12.0, 'L'], ['vegetable oil', 5.0, 'L'], ['canola oil', 4.5, 'L'], ['sesame oil', 15.0, 'L'],
  ['oil', 5.0, 'L'], ['vinegar', 4.0, 'L'], ['rice vinegar', 6.0, 'L'], ['soy sauce', 7.0, 'L'],
  ['broth', 3.5, 'L'], ['stock', 3.5, 'L'], ['bouillon', 12.0, 'kg'],
  ['coconut milk', 5.0, 'L'], ['peanut butter', 7.5, 'kg'], ['tahini', 12.0, 'kg'], ['hummus', 8.0, 'kg'],
  ['black bean', 1.5, 'ea'], ['kidney bean', 1.5, 'ea'], ['chickpea', 1.5, 'ea'], ['garbanzo', 1.5, 'ea'],
  ['cannellini', 1.6, 'ea'], ['refried bean', 1.7, 'ea'], ['lentil', 4.5, 'kg'], ['bean', 3.5, 'kg'],
  ['ketchup', 3.5, 'kg'], ['mayonnaise', 7.0, 'kg'], ['mayo', 7.0, 'kg'], ['mustard', 5.5, 'kg'],
  ['hot sauce', 12.0, 'kg'], ['sriracha', 12.0, 'kg'], ['worcestershire', 10.0, 'kg'], ['pesto', 14.0, 'kg'],
  ['curry paste', 12.0, 'kg'], ['harissa', 14.0, 'kg'], ['miso', 16.0, 'kg'], ['fish sauce', 10.0, 'L'],
  ['hoisin', 9.0, 'kg'], ['oyster sauce', 9.0, 'kg'], ['olive', 8.0, 'kg'], ['pickle', 6.0, 'kg'],
  ['tofu', 6.5, 'kg'], ['tempeh', 12.0, 'kg'], ['edamame', 9.0, 'kg'], ['falafel', 10.0, 'kg'],
  ['almond', 22.0, 'kg'], ['cashew', 22.0, 'kg'], ['walnut', 20.0, 'kg'], ['pecan', 24.0, 'kg'],
  ['pistachio', 26.0, 'kg'], ['hazelnut', 24.0, 'kg'], ['pine nut', 40.0, 'kg'], ['peanut', 8.0, 'kg'],
  ['raisin', 9.0, 'kg'], ['chocolate', 16.0, 'kg'], ['cocoa', 15.0, 'kg'], ['coffee', 25.0, 'kg'],
  ['tortilla', 6.0, 'kg'], ['tomato paste', 1.2, 'ea'],
  // bakery ($/ea items + $/kg fallbacks)
  ['baguette', 3.0, 'ea'], ['sourdough', 4.5, 'ea'], ['bread', 3.5, 'ea'], ['bun', 0.6, 'ea'],
  ['bagel', 0.7, 'ea'], ['pita', 0.6, 'ea'], ['naan', 1.0, 'ea'], ['brioche', 4.5, 'ea'],
  ['croissant', 1.5, 'ea'], ['crouton', 6.0, 'kg'], ['cracker', 9.0, 'kg'],
  // frozen
  ['frozen pea', 5.0, 'kg'], ['frozen corn', 4.5, 'kg'], ['frozen vegetable', 5.0, 'kg'], ['frozen berry', 10.0, 'kg'],
  ['ice cream', 8.0, 'kg'], ['frozen', 6.0, 'kg'],
  // spices & baking ($/kg — recipes use a few grams, so per-recipe cost stays realistic)
  ['salt', 1.5, 'kg'], ['black pepper', 30.0, 'kg'], ['white pepper', 30.0, 'kg'], ['cayenne', 25.0, 'kg'],
  ['paprika', 20.0, 'kg'], ['cumin', 25.0, 'kg'], ['turmeric', 18.0, 'kg'], ['cinnamon', 22.0, 'kg'],
  ['nutmeg', 60.0, 'kg'], ['oregano', 30.0, 'kg'], ['thyme leaves', 30.0, 'kg'], ['rosemary', 30.0, 'kg'],
  ['bay leaf', 40.0, 'kg'], ['cardamom', 100.0, 'kg'], ['allspice', 40.0, 'kg'], ['cloves', 45.0, 'kg'],
  ['coriander', 20.0, 'kg'], ['curry powder', 20.0, 'kg'], ['garam masala', 24.0, 'kg'], ['chili powder', 18.0, 'kg'],
  ['chili flake', 20.0, 'kg'], ['za\'atar', 30.0, 'kg'], ['saffron', 250.0, 'kg'], ['vanilla', 90.0, 'kg'],
  ['baking powder', 6.0, 'kg'], ['baking soda', 3.0, 'kg'], ['yeast', 25.0, 'kg'], ['sesame seed', 12.0, 'kg'],
  ['fennel seed', 20.0, 'kg'], ['mustard seed', 18.0, 'kg'], ['spice', 25.0, 'kg'],
  // drinks
  ['juice', 3.0, 'L'], ['wine', 13.0, 'L'], ['beer', 4.0, 'L'], ['cider', 5.0, 'L'],
  ['sparkling water', 1.5, 'L'], ['club soda', 1.5, 'L'], ['cola', 1.8, 'L'], ['soda', 1.8, 'L'], ['lemonade', 2.5, 'L'],
];

/* fallback price by aisle when nothing matches: [CAD per kg, CAD per L] */
const AISLE_FALLBACK = {
  'Produce': [3.5, 3.0], 'Meat & Seafood': [15.0, 12.0], 'Dairy & Eggs': [10.0, 4.0],
  'Bakery': [5.0, 0], 'Pantry & Canned': [6.0, 4.0], 'Spices & Baking': [12.0, 8.0],
  'Frozen': [6.0, 0], 'Drinks': [4.0, 2.5], 'Other': [7.0, 4.0],
};
/* typical amount of one recipe's share when the ingredient has no quantity */
const AISLE_TYPICAL = {
  'Produce': 150, 'Meat & Seafood': 220, 'Dairy & Eggs': 60, 'Bakery': 60,
  'Pantry & Canned': 80, 'Spices & Baking': 4, 'Frozen': 120, 'Drinks': 60, 'Other': 80,
}; // grams (or ml for Drinks)
/* price per single count unit when no keyword matches */
const UNIT_EA = {
  clove: 0.15, can: 1.6, bunch: 2.0, slice: 0.15, stick: 1.3, head: 2.8, ear: 1.0,
  fillet: 5.0, sprig: 0.2, leaf: 0.05, sheet: 0.08, package: 4.5, wedge: 2.0, wheel: 8.0,
  handful: 0.3, pinch: 0.06, dash: 0.06, splash: 0.15, link: 1.2, strip: 0.5, stalk: 0.4, envelope: 1.5,
};
/* keyword-specific per-piece prices (count units) */
const EA_SPECIAL = {
  egg: 0.45, tortilla: 0.35, pineapple: 3.5, cabbage: 2.8, lettuce: 3.0, lemon: 0.7, lime: 0.5,
  avocado: 1.6, corn: 1.1, leek: 1.8, banana: 0.3, orange: 0.8, apple: 0.9, potato: 0.35,
  onion: 0.3, carrot: 0.15, mango: 2.0, cucumber: 1.0, 'bell pepper': 1.5, tomato: 0.5,
};
/* typical weight of ONE count-unit piece, in kg — used when a recipe says
   "12 chicken thighs" or "2 curry powder" (no unit) so counts don't get
   mistaken for kilograms. Spices get gram-scale defaults. */
const PIECE_KG = {
  'chicken thigh': 0.12, 'chicken breast': 0.17, 'chicken leg': 0.15, drumstick: 0.12,
  'chicken wing': 0.1, thigh: 0.12, breast: 0.17, fillet: 0.15, steak: 0.25, chop: 0.2,
  sausage: 0.07, bacon: 0.025, rasher: 0.025, meatball: 0.03, shrimp: 0.02, prawn: 0.02,
  chicken: 1.3, turkey: 4, duck: 1.8,
  onion: 0.15, shallot: 0.04, potato: 0.2, carrot: 0.07, tomato: 0.12, lemon: 0.1, lime: 0.07,
  orange: 0.15, apple: 0.18, banana: 0.12, avocado: 0.2, pepper: 0.15, eggplant: 0.3,
  aubergine: 0.3, zucchini: 0.2, cucumber: 0.25, parsnip: 0.12, beet: 0.15, turnip: 0.3,
  peach: 0.15, pear: 0.17, mango: 0.35, plantain: 0.25, artichoke: 0.3, 'bell pepper': 0.16,
  corn: 0.25, head: 0.3,
  bread: 0.5, bun: 0.09, bagel: 0.1, pita: 0.09, naan: 0.12, baguette: 0.25, roll: 0.09,
  tortilla: 0.045, pancake: 0.08, egg: 0.05, tofu: 0.4,
};
const AISLE_PIECE_KG = {
  'Produce': 0.15, 'Meat & Seafood': 0.25, 'Dairy & Eggs': 0.1, 'Bakery': 0.1,
  'Pantry & Canned': 0.2, 'Spices & Baking': 0.004, 'Frozen': 0.15, 'Drinks': 0.25, 'Other': 0.15,
};
function pieceKg(s, aisle) {
  for (const k of Object.keys(PIECE_KG)) if (s.includes(k)) return PIECE_KG[k];
  return AISLE_PIECE_KG[aisle] ?? 0.15;
}

function matchTable(s) {
  let best = null, bestLen = 0;
  for (const [kw, price, per] of TABLE) {
    if (s.includes(kw) && kw.length > bestLen) { best = { price, per }; bestLen = kw.length; }
  }
  return best;
}

/** cost of one ingredient {name, qty, unit, note} in CAD */
export function ingredientCost(ing) {
  const name = String(ing?.name ?? '');
  const s = (name + ' ' + (ing?.note || '')).toLowerCase();
  const hit = matchTable(s);
  const aisle = guessAisle(name);
  const dim = unitDim(ing?.unit);
  // volume: table price is $/L
  if (dim === 'vol') {
    const ml = convert(ing.qty ?? 0, ing.unit || 'ml', 'ml');
    if (ing.qty != null && ml != null) return hit ? hit.price * ml / 1000 : AISLE_FALLBACK[aisle][1] * ml / 1000;
    return hit ? hit.price * 0.06 : 0.3; // unspecified: ~60 ml splash
  }
  // mass: table price is $/kg
  if (dim === 'mass') {
    const g = convert(ing.qty ?? 0, ing.unit || 'g', 'g');
    if (ing.qty != null && g != null) return hit ? hit.price * g / 1000 : AISLE_FALLBACK[aisle][0] * g / 1000;
    const typ = AISLE_TYPICAL[aisle] ?? 80;
    return (hit ? hit.price : AISLE_FALLBACK[aisle][0]) * typ / 1000;
  }
  // count units
  if (ing.qty != null) {
    if (hit && hit.per === 'ea') return hit.price * ing.qty;
    const eaKey = Object.keys(EA_SPECIAL).find((k) => s.includes(k));
    if (eaKey) return EA_SPECIAL[eaKey] * ing.qty;
    if (UNIT_EA[ing.unit] != null) return UNIT_EA[ing.unit] * ing.qty;
    // count of a kg-priced item ("12 chicken thighs", "2 curry powder"): typical piece weight
    return (hit ? hit.price : AISLE_FALLBACK[aisle][0]) * pieceKg(s, aisle) * ing.qty;
  }
  // no quantity at all
  if (hit && hit.per === 'ea') return hit.price;
  const typ = AISLE_TYPICAL[aisle] ?? 80;
  return (hit ? (hit.per === 'L' ? hit.price * typ / 1000 : hit.price * typ / 1000) : AISLE_FALLBACK[aisle][0] * typ / 1000);
}

/* per-recipe cost memo (key → {total, perServing}) */
const COST_MEMO = new Map();
export function estimateRecipeCost(recipe) {
  const key = recipe.key || recipe.name;
  const memo = COST_MEMO.get(key);
  if (memo) return memo;
  let total = 0;
  for (const ing of recipe.ingredients || []) {
    const o = typeof ing === 'string' ? { name: ing, qty: null, unit: null } : ing;
    total += ingredientCost(o);
  }
  const serv = recipe.servings || 4;
  const out = { total, perServing: total / serv };
  if (COST_MEMO.size > 4000) COST_MEMO.clear();
  COST_MEMO.set(key, out);
  return out;
}

/** estimated cost of a merged grocery list item {name, qtyBase, unit} in CAD */
export function estimateItemCost(item) {
  if (item.pantry) return 0;
  if (item.qtyBase != null) {
    const dim = unitDim(item.unit);
    if (dim === 'mass') return ingredientCost({ name: item.name, qty: item.qtyBase, unit: 'g' });
    if (dim === 'vol') return ingredientCost({ name: item.name, qty: item.qtyBase, unit: 'ml' });
    return ingredientCost({ name: item.name, qty: item.qtyBase, unit: item.unit || 'count' });
  }
  return ingredientCost({ name: item.name, qty: null, unit: null });
}

/* ---------- Canadian grocery stores — deep search links ---------- */
export const CA_STORES = [
  { id: 'walmart', name: 'Walmart Canada', domain: 'walmart.ca', search: 'https://www.walmart.ca/en/search?q={q}', note: 'Pickup & delivery, nationwide' },
  { id: 'superstore', name: 'Real Canadian Superstore', domain: 'realcanadiansuperstore.ca', search: 'https://www.realcanadiansuperstore.ca/search?search-bar={q}', note: 'Loblaws banner · PC Optimum' },
  { id: 'loblaws', name: 'Loblaws', domain: 'loblaws.ca', search: 'https://www.loblaws.ca/en/search?search-bar={q}', note: 'PC Optimum points' },
  { id: 'nofrills', name: 'No Frills', domain: 'nofrills.ca', search: 'https://www.nofrills.ca/search?search-bar={q}', note: 'Discount · PC Optimum' },
  { id: 'metro', name: 'Metro', domain: 'metro.ca', search: 'https://www.metro.ca/en/online-grocery/search?filter={q}', note: 'ON & QC · online grocery' },
  { id: 'foodbasics', name: 'Food Basics', domain: 'foodbasics.ca', search: 'https://www.foodbasics.ca/search?filter={q}', note: 'Discount · Metro banner' },
  { id: 'sobeys', name: 'Sobeys', domain: 'sobeys.com', search: 'https://www.sobeys.com/en/search?q={q}', note: 'Nationwide · Scene+' },
  { id: 'freshco', name: 'FreshCo', domain: 'freshco.com', search: 'https://freshco.com/?s={q}', note: 'Discount · Sobeys banner' },
  { id: 'instacart', name: 'Instacart', domain: 'instacart.ca', search: 'https://www.instacart.ca/store/s?k={q}', note: 'Same-day from Loblaws, Metro & more' },
  { id: 'costco', name: 'Costco Canada', domain: 'costco.ca', search: 'https://www.costco.ca/CatalogSearch?keyword={q}', note: 'Bulk sizes (membership)' },
];
export function storeSearchUrl(storeId, query) {
  const st = CA_STORES.find((s) => s.id === storeId) || CA_STORES[0];
  return st.search.replace('{q}', encodeURIComponent(String(query || '').trim()));
}
