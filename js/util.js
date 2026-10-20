/* OpenPlate — util.js : helpers, qty parsing, units, aisles, allergens */
'use strict';

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const todayStr = (d = new Date()) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
};
export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayStr(d);
};
export const fmtDate = (dateStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, opts);
export const dayShort = (dateStr) => new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- quantity parsing ---------- */
const VULGAR = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };

export function parseQty(raw) {
  // returns { qty:Number|null, unit:String|null, note:String }
  let s = String(raw ?? '').trim().toLowerCase();
  for (const [k, v] of Object.entries(VULGAR)) s = s.split(k).join(' ' + v + ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return { qty: null, unit: null, note: '' };
  // leading qty: "1 1/2", "2", "0.5", "1-2" (take first), "1½"
  const m = s.match(/^(\d+)\s+(\d+)\/(\d+)|^(\d*\.\d+)|^(\d+)\s*\/\s*(\d+)|^(\d+)/);
  let qty = null, rest = s;
  if (m) {
    if (m[1]) qty = (+m[1]) + (+m[2]) / (+m[3]);
    else if (m[4]) qty = parseFloat(m[4]);
    else if (m[5]) qty = (+m[5]) / (+m[6]);
    else qty = parseInt(m[7], 10);
    rest = s.slice(m[0].length).trim();
  } else if (/^(a|an)\s+/.test(s)) {
    qty = 1; rest = s.replace(/^(a|an)\s+/, '');
  }
  rest = rest.replace(/^[-–—]\s*/, ''); // "2-3 cups" -> treat as 2 cups
  const UNIT_ALIASES = [
    ['fl oz', 'fl oz'], ['fluid ounce', 'fl oz'], ['floz', 'fl oz'],
    ['tbsp', 'tbsp'], ['tablespoon', 'tbsp'], ['tablespoons', 'tbsp'], ['tbs', 'tbsp'],
    ['tsp', 'tsp'], ['teaspoon', 'tsp'], ['teaspoons', 'tsp'],
    ['lbs', 'lb'], ['lb', 'lb'], ['pound', 'lb'], ['pounds', 'lb'], ['pint', 'pint'], ['quart', 'quart'],
    ['oz', 'oz'], ['ounce', 'oz'], ['ounces', 'oz'],
    ['g', 'g'], ['gram', 'g'], ['grams', 'g'], ['kg', 'kg'], ['kilogram', 'kg'], ['kilograms', 'kg'],
    ['ml', 'ml'], ['milliliter', 'ml'], ['l', 'l'], ['liter', 'l'], ['litre', 'l'], ['liters', 'l'],
    ['cup', 'cup'], ['cups', 'cup'],
    ['clove', 'clove'], ['cloves', 'clove'],
    ['can', 'can'], ['cans', 'can'],
    ['bunch', 'bunch'], ['bunches', 'bunch'],
    ['stick', 'stick'], ['sticks', 'stick'],
    ['slice', 'slice'], ['slices', 'slice'],
    ['sprig', 'sprig'], ['sprigs', 'sprig'],
    ['leaf', 'leaf'], ['leaves', 'leaf'],
    ['head', 'head'], ['heads', 'head'],
    ['stalk', 'stalk'], ['stalks', 'stalk'],
    ['package', 'package'], ['packages', 'package'], ['pkg', 'package'], ['envelope', 'package'], ['envelopes', 'package'],
    ['pinch', 'pinch'], ['dash', 'dash'], ['splash', 'splash'],
    ['sheet', 'sheet'], ['sheets', 'sheet'],
    ['ear', 'ear'], ['ears', 'ear'],
    ['strip', 'strip'], ['strips', 'strip'],
    ['link', 'link'], ['links', 'link'],
    ['fillet', 'fillet'], ['fillets', 'fillet'], ['filet', 'fillet'], ['filets', 'fillet'],
    ['wheel', 'wheel'], ['wedge', 'wedge'], ['wedges', 'wedge'],
    ['handful', 'handful'],
  ];
  const firstWord = rest.split(' ')[0];
  let unit = null;
  for (const [alias, norm] of UNIT_ALIASES) {
    if (firstWord === alias || firstWord === alias + '.') { unit = norm; rest = rest.slice(firstWord.length).trim(); break; }
  }
  if (unit === 'l' && qty && qty < 5 && /ml/.test(rest)) { unit = 'ml'; rest = rest.replace(/^ml\s*/, ''); }
  const note = rest.replace(/^(of\s+)/, '').trim();
  return { qty, unit, note };
}

/* ---------- unit conversion ---------- */
const DIM = {
  vol: { ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, cup: 236.588, 'fl oz': 29.574, pint: 473.176, quart: 946.353, splash: 14.787 },
  mass: { g: 1, kg: 1000, oz: 28.35, lb: 453.592 },
  count: { count: 1, clove: 1, can: 1, bunch: 1, stick: 1, slice: 1, sprig: 1, leaf: 1, head: 1, stalk: 1, package: 1, pinch: 1, dash: 1, sheet: 1, ear: 1, strip: 1, link: 1, fillet: 1, wheel: 1, wedge: 1, handful: 1 },
};
export function unitDim(u) {
  if (!u) return 'count';
  for (const [dim, map] of Object.entries(DIM)) if (u in map) return dim;
  return 'count';
}
const toBase = { ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, cup: 236.588, 'fl oz': 29.574, pint: 473.176, quart: 946.353, g: 1, kg: 1000, oz: 28.35, lb: 453.592 };

export function convert(qty, from, to) {
  const d = unitDim(from);
  if (d !== unitDim(to)) return null;
  if (d !== 'count') return (qty * toBase[from]) / toBase[to];
  return from === to ? qty : null;
}

/* format qty nicely with fractions */
const GLYPH = { 0.125: '⅛', 0.25: '¼', 0.333: '⅓', 0.375: '⅜', 0.5: '½', 0.625: '⅝', 0.667: '⅔', 0.75: '¾', 0.875: '⅞' };
export function fmtQty(q) {
  if (q == null || isNaN(q)) return '';
  if (q >= 10) return String(Math.round(q));
  const whole = Math.floor(q);
  let frac = q - whole;
  if (frac < 0.04) return String(whole || q < 1 ? Math.round(q * 100) / 100 : whole);
  // snap to nearest known fraction
  let best = null, bestD = 1;
  for (const f of Object.keys(GLYPH)) {
    const d = Math.abs(frac - parseFloat(f));
    if (d < bestD) { bestD = d; best = f; }
  }
  if (best && bestD < 0.06) {
    frac = GLYPH[best];
    return (whole ? whole : '') + frac;
  }
  frac = Math.round(frac * 8) / 8;
  return String(whole + frac === Math.round(whole + frac * 100) / 100 ? whole + frac : Math.round(q * 100) / 100);
}

/* display a merged {qty(base), unit} per unit system */
export function fmtAmount(qtyBase, unit, units = 'us') {
  if (qtyBase == null) return '';
  const dim = unitDim(unit);
  if (dim === 'vol') {
    if (units === 'metric') return qtyBase >= 1000 ? fmtQty(qtyBase / 1000) + ' L' : Math.round(qtyBase) + ' ml';
    if (qtyBase < 15) return fmtQty(qtyBase / 4.929) + ' tsp';
    if (qtyBase < 45) return fmtQty(qtyBase / 14.787) + ' tbsp';
    if (qtyBase < 946) return fmtQty(qtyBase / 236.588) + ' cup' + (qtyBase / 236.588 >= 2 ? 's' : '');
    return fmtQty(qtyBase / 946.353) + ' quart' + (qtyBase / 946.353 >= 2 ? 's' : '');
  }
  if (dim === 'mass') {
    if (units === 'metric') return qtyBase >= 1000 ? fmtQty(qtyBase / 1000) + ' kg' : Math.round(qtyBase / 5) * 5 + ' g';
    if (qtyBase < 453.6) return fmtQty(qtyBase / 28.35) + ' oz';
    return fmtQty(qtyBase / 453.592) + ' lb';
  }
  if (dim === 'count') return fmtQty(qtyBase) + (unit && unit !== 'count' ? ' ' + plural(unit, qtyBase) : '');
  return fmtQty(qtyBase);
}
export const plural = (w, n) => (n === 1 ? w : w === 'leaf' ? 'leaves' : w + 's');

/* ---------- ingredient name normalization ---------- */
const IRREG = { tomatoes: 'tomato', potatoes: 'potato', leaves: 'leaf', loaves: 'loaf', chilies: 'chili', chillies: 'chili', berries: 'berry', cherries: 'cherry', peaches: 'peach', anchovies: 'anchovy', radishes: 'radish', squashes: 'squash', mangoes: 'mango', avocados: 'avocado' };
export function normName(raw) {
  let s = String(raw ?? '').toLowerCase().trim();
  s = s.replace(/\(.*?\)/g, ' ').replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim();
  // take main words, drop qualifiers that break matching but keep first 2 words
  const words = s.split(' ').filter(Boolean);
  s = words.slice(0, 3).join(' ');
  if (IRREG[s]) return IRREG[s];
  if (words.length && words[words.length - 1] === 's' && words.length > 1) s = s.slice(0, -1);
  else if (s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('us') && s.length > 4) s = s.slice(0, -1);
  return s.trim();
}

/* ---------- aisles ---------- */
export const AISLES = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry & Canned', 'Spices & Baking', 'Frozen', 'Drinks', 'Other'];
const A_KW = [
  ['Frozen', ['frozen']],
  ['Drinks', ['juice', 'soda', 'wine', 'beer', 'cider', 'cola', 'lemonade', 'sparkling water', 'club soda']],
  ['Spices & Baking', ['salt', 'black pepper', 'white pepper', 'cayenne', 'pepper flakes', 'red pepper flake', 'paprika', 'cumin', 'turmeric', 'cinnamon', 'nutmeg', 'oregano', 'thyme', 'rosemary', 'bay leaf', 'cardamom', 'allspice', 'cloves', 'coriander powder', 'ground coriander', 'chili powder', 'chilli powder', 'curry powder', 'garam masala', 'five-spice', 'za\'atar', 'saffron', 'baking powder', 'baking soda', 'yeast', 'vanilla', 'cocoa', 'cornstarch', 'corn starch', 'flour', 'sugar', 'brown sugar', 'powdered sugar', 'baking', 'spice', 'seasoning', 'sesame seed', 'fennel seed', 'mustard seed', 'chocolate chip']],
  ['Dairy & Eggs', ['milk', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'yogurt', 'yoghurt', 'cream', 'egg', 'eggs', 'half & half', 'ricotta', 'mascarpone', 'gouda', 'swiss cheese', 'ghee', 'condensed milk', 'evaporated milk']],
  ['Meat & Seafood', ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'steak', 'ground meat', 'ground beef', 'lamb', 'veal', 'shrimp', 'prawn', 'salmon', 'tuna', 'cod', 'fish', 'halibut', 'tilapia', 'scallop', 'clam', 'mussel', 'oyster', 'crab', 'lobster', 'anchovy', 'chorizo', 'prosciutto', 'salami', 'ribs', 'brisket', 'duck', 'meatball', 'hot dog', 'squid', 'sardine', 'mackerel', 'trout', 'fillet']],
  ['Bakery', ['bread', 'bun', 'baguette', 'tortilla', 'pita', 'naan', 'brioche', 'sourdough', 'english muffin', 'crouton', 'roll', 'bagel', 'croissant']],
  ['Produce', ['onion', 'scallion', 'green onion', 'shallot', 'leek', 'garlic', 'ginger', 'pepper', 'bell pepper', 'jalape', 'chili', 'chile', 'tomato', 'potato', 'carrot', 'celery', 'lettuce', 'greens', 'spinach', 'kale', 'arugula', 'broccoli', 'cauliflower', 'zucchini', 'cucumber', 'mushroom', 'lemon', 'lime', 'orange', 'grapefruit', 'apple', 'banana', 'avocado', 'cilantro', 'parsley', 'basil', 'mint', 'dill', 'sage', 'thyme leaves', 'cabbage', 'corn', 'peas', 'green bean', 'squash', 'eggplant', 'aubergine', 'beet', 'radish', 'turnip', 'mango', 'pineapple', 'strawberr', 'blueberr', 'raspberr', 'blackberr', 'grape', 'peach', 'pear', 'cherry', 'melon', 'watermelon', 'kiwi', 'coconut', 'plantain', 'okra', 'parsnip', 'asparagus', 'artichoke', 'brussels', 'bok choy', 'pumpkin', 'butternut', 'herb', 'chive', 'tamarind', 'date', 'fig']],
  ['Pantry & Canned', ['rice', 'pasta', 'spaghetti', 'penne', 'macaroni', 'noodle', 'linguine', 'fettuccine', 'orzo', 'couscous', 'quinoa', 'oat', 'cereal', 'granola', 'flour tortilla', 'canned', 'can ', 'tomato sauce', 'tomato paste', 'crushed tomato', 'diced tomato', 'broth', 'stock', 'bouillon', 'beans', 'bean', 'chickpea', 'garbanzo', 'lentil', 'refried', 'oil', 'vinegar', 'soy sauce', 'peanut butter', 'honey', 'syrup', 'jam', 'jelly', 'preserves', 'salsa', 'coconut milk', 'curry paste', 'tahini', 'breadcrumb', 'cracker', 'chip', 'popcorn', 'almond', 'cashew', 'walnut', 'pecan', 'nut', 'peanut', 'pistachio', 'hazelnut', 'raisin', 'chocolate', 'coffee', 'tea', 'mayonnaise', 'mayo', 'ketchup', 'mustard', 'hot sauce', 'sriracha', 'worcestershire', 'pesto', 'marinara', 'hoisin', 'oyster sauce', 'fish sauce', 'sesame oil', 'olive', 'pickle', 'relish', 'hominy', 'mole', 'harissa', 'miso', 'tofu', 'tempeh', 'edamame', 'hummus', 'dumpling wrapper', 'wonton', 'seaweed', 'nori', 'gelatin', 'marshmallow']],
];
export function guessAisle(ingName) {
  const s = ' ' + String(ingName ?? '').toLowerCase() + ' ';
  for (const [aisle, kws] of A_KW) for (const kw of kws) if (s.includes(kw)) return aisle;
  return 'Other';
}

/* ---------- allergens & diet ---------- */
export const ALLERGENS = [
  { id: 'dairy', label: 'Dairy', kws: ['milk', 'butter', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'yogurt', 'yoghurt', 'cream', 'ghee', 'half & half', 'ricotta', 'mascarpone', 'whey', 'custard', 'gouda', 'evaporated milk', 'condensed milk'] },
  { id: 'eggs', label: 'Eggs', kws: ['egg', 'eggs', 'mayonnaise', 'mayo', 'hollandaise'] },
  { id: 'gluten', label: 'Gluten / Wheat', kws: ['flour', 'wheat', 'bread', 'breadcrumb', 'pasta', 'spaghetti', 'macaroni', 'penne', 'linguine', 'fettuccine', 'noodle', 'tortilla', 'pita', 'naan', 'soy sauce', 'couscous', 'bulgur', 'semolina', 'barley', 'rye', 'seitan', 'graham', 'cracker', 'beer', 'batter', 'dumpling wrapper', 'wonton', 'orzo'] },
  { id: 'peanuts', label: 'Peanuts', kws: ['peanut', 'satay'] },
  { id: 'treenuts', label: 'Tree nuts', kws: ['almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'pine nut', 'nut butter', 'marzipan'] },
  { id: 'sesame', label: 'Sesame', kws: ['sesame', 'tahini'] },
  { id: 'soy', label: 'Soy', kws: ['soy', 'tofu', 'edamame', 'miso', 'tempeh', 'soybean', 'teriyaki', 'hoisin'] },
  { id: 'shellfish', label: 'Shellfish', kws: ['shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'clam', 'mussel', 'oyster', 'scallop', 'squid', 'calamari'] },
  { id: 'fish', label: 'Fish', kws: ['salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'fish', 'anchovy', 'sardine', 'mackerel', 'trout', 'fish sauce', 'worcestershire'] },
];
const wordHit = (hay, kw) => new RegExp('(^|[^a-z])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])', 'i').test(hay);

export function allergensOf(ingredients) {
  const hits = new Set();
  for (const ing of ingredients) {
    const s = ' ' + (typeof ing === 'string' ? ing : [ing.name, ing.note].filter(Boolean).join(' ')) + ' ';
    for (const a of ALLERGENS) {
      if (a.id === 'eggs' && /eggplant/i.test(s)) continue;
      for (const kw of a.kws) if (wordHit(s, kw)) { hits.add(a.id); break; }
    }
  }
  return [...hits];
}
const MEAT_KW = ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'lamb', 'veal', 'steak', 'ribs', 'brisket', 'duck', 'chorizo', 'prosciutto', 'salami', 'meatball', 'hot dog', 'goat', 'meat', 'burger', 'bologna', 'pastrami', 'venison', 'broth', 'stock', 'bouillon', 'gelatin'];
const FISH_KW = ['salmon', 'tuna', 'cod', 'halibut', 'tilapia', 'fish', 'anchovy', 'sardine', 'mackerel', 'trout', 'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop', 'squid', 'calamari', 'fish sauce', 'worcestershire'];
const DAIRY_EGG_KW = ['milk', 'butter', 'cheese', 'cream', 'yogurt', 'yoghurt', 'egg', 'ghee', 'whey'];
function ingText(ingredients) {
  return ' ' + ingredients.map((i) => (typeof i === 'string' ? i : [i.name, i.note].filter(Boolean).join(' '))).join(' ').toLowerCase() + ' ';
}
export function dietOf(recipe) {
  // returns array of dietTags the recipe satisfies
  const tags = new Set(recipe.dietTags || []);
  const s = ingText(recipe.ingredients || []);
  const hasMeat = MEAT_KW.some((k) => wordHit(s, k)) || /meat/i.test(recipe.name || '');
  const hasFish = FISH_KW.some((k) => wordHit(s, k));
  const hasDE = DAIRY_EGG_KW.some((k) => wordHit(s, k));
  const noMeatFish = !hasMeat && !hasFish;
  if (noMeatFish) tags.add('vegetarian');
  if (noMeatFish && !hasDE && !wordHit(s, 'honey')) tags.add('vegan');
  if (!hasMeat) tags.add('pescatarian');
  if ((recipe.tags || []).some((t) => /vegan/i.test(t))) { tags.add('vegan'); tags.add('vegetarian'); }
  if ((recipe.tags || []).some((t) => /vegetarian/i.test(t)) && noMeatFish) tags.add('vegetarian');
  return [...tags];
}
export function matchesDiet(recipe, diet) {
  if (!diet || diet === 'all') return true;
  return dietOf(recipe).includes(diet);
}

/* ---------- timers: find durations in step text ---------- */
export function findTimers(text) {
  const out = [];
  // require an explicit number + full-word unit (h|hr|hour|m|min|minute|s|sec|second), incl. "1 1/2 hours"
  const re = /(\d+(?:\.\d+)?)(\s+1\/2)?\s*(?:to\s+(\d+(?:\.\d+)?))?\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|seconds)\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const unit = m[4].toLowerCase();
    let base = parseFloat(m[1]) + (m[2] ? 0.5 : 0);
    if (m[3]) base = (base + parseFloat(m[3])) / 2; // "3 to 4 minutes" → 3.5
    let secs;
    if (unit.startsWith('h')) secs = base * 3600;
    else if (unit === 's' || unit.startsWith('sec')) secs = base;
    else secs = base * 60;
    if (secs >= 30 && secs <= 7200) out.push(Math.round(secs));
  }
  return out;
}
export const fmtClock = (s) => {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

/* ---------- misc ---------- */
export function toastHost() { return $('#toasts'); }
export function copyText(t) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t);
  return new Promise((res) => {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove(); res();
  });
}
export function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function timeTotal(r) {
  const t = (r.timePrep || 0) + (r.timeCook || 0);
  return t || r.timeTotal || null;
}
export const fmtTime = (m) => (m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);

/* ---------- photo upload: downscale + compress entirely on-device ---------- */
export function photoFromFile(file, maxDim = 480, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Not an image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      } catch (err) { URL.revokeObjectURL(url); reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}
