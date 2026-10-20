/* OpenPlate — store.js : local-first state (localStorage), no accounts, no servers */
'use strict';

import { uid, todayStr, addDays, normName, unitDim, convert } from './util.js';
import { DEFAULT_STAPLES } from './data-local.js';

const KEY = 'openplate.v1';

export const DEFAULT_STATE = () => ({
  v: 1,
  onboarded: false,
  settings: {
    units: 'us',            // 'us' | 'metric'
    servings: 2,            // default servings per meal
    dark: false,
    wasteFactor: 0.5,       // estimated lb of food saved per cooked serving
    sources: { local: true, mealdb: true, dummyjson: true },
    diet: 'all',            // 'all' | 'vegetarian' | 'vegan' | 'pescatarian'
    allergens: [],          // ids from util.ALLERGENS
    dislikes: [],           // ingredient substrings
    maxTime: 0,             // minutes, 0 = no limit
    staples: [...DEFAULT_STAPLES],
    hideStaples: true,
    budget: { on: false, max: 7.5 },   // max estimated CAD per serving, 0 = off
    planMode: 'standard',              // 'standard' | 'pantry' | 'mixed'
    preferredStores: ['walmart', 'instacart'],
    reminder: { enabled: false, day: 6, time: '10:00' },
    storeLinks: [
      { name: 'Walmart Canada', url: 'https://www.walmart.ca' },
      { name: 'Instacart Canada', url: 'https://www.instacart.ca' },
      { name: 'Amazon Fresh CA', url: 'https://www.amazon.ca/fresh' },
    ],
    lastReminderFired: '',
  },
  pantry: { items: {} },    // normKey -> { name, at } — what you already have at home
  favorites: [],            // normalized recipe objects (source:'favorite', key preserved w/ origKey)
  custom: [],               // user recipes
  bans: { recipes: {}, ingredients: {}, categories: {} }, // shadowban: until = epoch ms or null = permanent
  // NOTE: the bundled recipe pack lives in js/sources.js (module memory) — it is
  // deliberately NOT part of persisted state, otherwise every save would
  // serialize ~3MB of recipes into localStorage.
  plan: null,               // {id, createdAt, start, meals:[{id,date,slot,recipe,servings,done,splurge}]}
  history: [],              // archived plans {id, archivedAt, meals, wasteLb}
  waste: { log: [] },       // [{at, lb, label}]
  groceries: { items: [], updatedAt: 0 }, // [{id,name,aisle,qtyBase,unit,checked,custom,pantryKey}]
});

let state = null;
const listeners = new Set();

export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify() { save(); listeners.forEach((fn) => fn(state)); }

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? deepMerge(DEFAULT_STATE(), JSON.parse(raw)) : DEFAULT_STATE();
  } catch {
    state = DEFAULT_STATE();
  }
  delete state.cache; // legacy: old versions persisted the pack here — never again
  if (JSON.stringify(state.settings.storeLinks) === OLD_US_STORES) {
    state.settings.storeLinks = DEFAULT_STATE().settings.storeLinks; // migrate US defaults → Canadian
  }
  return state;
}
const OLD_US_STORES = JSON.stringify([
  { name: 'Instacart', url: 'https://www.instacart.com' },
  { name: 'Walmart', url: 'https://www.walmart.com/grocery' },
  { name: 'Amazon Fresh', url: 'https://www.amazon.com/fresh' },
]);
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('storage full', e); }
}
function deepMerge(base, over) {
  if (over === undefined) return base;          // key absent in saved data → keep default
  if (base === null || base === undefined) return over; // e.g. saved plan over null default
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || typeof over !== 'object') return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

/* ---------- pantry (what you already have at home) ----------
   Keys are normalized ingredient names. Pantry items are excluded from the
   shopping list and boost recipes when planning in "use what I have" mode. */
export function pantryItems() { return state.pantry ? state.pantry.items : (state.pantry = { items: {} }).items; }
export function pantryCount() { return Object.keys(pantryItems()).length; }
export function pantrySet() { return new Set(Object.keys(pantryItems())); }
export function addToPantry(name) {
  const key = normName(name);
  if (!key) return false;
  pantryItems()[key] = { name: key, at: Date.now() };
  notify();
  return true;
}
export function removeFromPantry(key) {
  if (pantryItems()[key]) { delete pantryItems()[key]; notify(); }
}
/** does the pantry cover this ingredient name? (exact or substring, len>=4) */
export function inPantry(name) {
  const n = normName(name);
  if (!n) return false;
  const items = pantryItems();
  if (items[n]) return true;
  for (const k of Object.keys(items)) {
    if (k.length < 4 || n.length < 4) continue;
    if (n.includes(k) || k.includes(n)) return true;
  }
  return false;
}
/** normalized list of everything considered "have" for planning: pantry + staples */
export function haveList() {
  const have = pantrySet();
  if (state.settings.hideStaples) for (const s of state.settings.staples) have.add(normName(s));
  return [...have].filter(Boolean);
}
/** move all checked grocery items into the pantry and clear them from the list */
export function absorbCheckedGroceries() {
  const checked = state.groceries.items.filter((i) => i.checked && !i.pantry);
  for (const it of checked) {
    const key = normName(it.name);
    if (key) pantryItems()[key] = { name: key, at: Date.now() };
  }
  state.groceries.items = state.groceries.items.filter((i) => !i.checked || i.pantry);
  notify();
  return checked.length;
}

/* ---------- shadowban: hide recipes / ingredients / food types ----------
   Default duration: 7 days. Expired bans are pruned automatically.
   recipes:  key -> { name, until }      ingredients/categories: key -> { until } */
export const BAN_WEEK_MS = 7 * 864e5;
function pruneBans(b) {
  const now = Date.now();
  for (const group of ['recipes', 'ingredients', 'categories']) {
    const g = b[group];
    if (!g) continue;
    for (const k of Object.keys(g)) {
      const e = g[k];
      const until = e && typeof e === 'object' ? e.until : e;
      if (until && until < now) delete g[k];
    }
  }
}
export function getBans() {
  pruneBans(state.bans);
  return state.bans;
}
export function addBan(type, key, name = '', permanent = false) {
  if (!key) return;
  const until = permanent ? null : Date.now() + BAN_WEEK_MS;
  state.bans[type] = state.bans[type] || {};
  state.bans[type][key] = type === 'recipes' ? { name: name || key, until } : { until };
  notify();
}
export function removeBan(type, key) {
  if (state.bans[type]) { delete state.bans[type][key]; notify(); }
}
export function bansCount() {
  const b = getBans();
  return Object.keys(b.recipes).length + Object.keys(b.ingredients).length + Object.keys(b.categories).length;
}

/* ---------- favorites ---------- */
export function isFav(key) { return state.favorites.some((f) => f.origKey === key || f.key === key); }
export function toggleFav(recipe) {
  const i = state.favorites.findIndex((f) => f.origKey === recipe.key);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.unshift({ ...recipe, origKey: recipe.key, source: 'favorite', favAt: Date.now() });
  notify();
  return i < 0;
}

/* ---------- plan ---------- */
export function newPlan(meals, start = todayStr()) {
  state.plan = { id: uid(), createdAt: Date.now(), start, meals: meals.map((m) => ({ id: uid(), done: false, ...m })) };
  notify();
}
export function addMealToPlan(recipe, date = todayStr(), slot = 'dinner', servings) {
  if (!state.plan) state.plan = { id: uid(), createdAt: Date.now(), start: date, meals: [] };
  state.plan.meals.push({ id: uid(), date, slot, servings: servings || state.settings.servings, recipe, done: false });
  notify();
}
export function addMealsToPlan(list) {
  if (!state.plan) state.plan = { id: uid(), createdAt: Date.now(), start: todayStr(), meals: [] };
  for (const m of list) state.plan.meals.push({ id: uid(), done: false, ...m });
  notify();
}
export function removeMeal(id) {
  if (!state.plan) return;
  state.plan.meals = state.plan.meals.filter((m) => m.id !== id);
  notify();
}
export function updateMeal(id, patch) {
  const m = state.plan?.meals.find((x) => x.id === id);
  if (m) Object.assign(m, patch);
  notify();
}
export function markDone(id, done = true) {
  const m = state.plan?.meals.find((x) => x.id === id);
  if (!m || m.done === done) return;
  m.done = done;
  if (done) {
    const lb = Math.round((m.servings || 2) * state.settings.wasteFactor * 10) / 10;
    state.waste.log.push({ at: Date.now(), lb, label: m.recipe.name });
  } else {
    const i = state.waste.log.findIndex((w) => w.label === m.recipe.name && !w._locked);
    if (i >= 0) state.waste.log.splice(i, 1);
  }
  notify();
}
export function wasteTotalLb() {
  return Math.round(state.waste.log.reduce((s, w) => s + w.lb, 0) * 10) / 10;
}
export function finishPlan() {
  if (!state.plan || !state.plan.meals.length) return false;
  state.history.unshift({ id: state.plan.id, archivedAt: Date.now(), start: state.plan.start, meals: state.plan.meals });
  state.history = state.history.slice(0, 20);
  state.plan = null;
  notify();
  return true;
}

/* ---------- groceries ---------- */
export function groceriesFromPlan() {
  if (!state.plan) return state.groceries.items;
  // rebuild from current plan, preserving checked state & custom items
  const prev = new Map(state.groceries.items.map((i) => [i.key, i]));
  const merged = new Map();
  const mealFilter = state.groceries.hideCooked === true;
  for (const meal of state.plan.meals) {
    if (meal.done && mealFilter) continue;
    const scale = (meal.servings || 2) / (meal.recipe.servings || 4);
    for (const ing of meal.recipe.ingredients || []) {
      const obj = typeof ing === 'string' ? { name: ing, qty: null, unit: null } : ing;
      const key = obj.name.toLowerCase().trim();
      if (isStaple(key)) continue;
      // convert to a single base unit so quantities merge correctly (2 cups + 3 tbsp, 1 lb + 200 g)
      let qtyBase = obj.qty != null ? obj.qty * scale : null;
      let unit = obj.unit || null;
      if (qtyBase != null && unit) {
        const dim = unitDim(unit);
        if (dim === 'mass') { qtyBase = convert(qtyBase, unit, 'g'); unit = 'g'; }
        else if (dim === 'vol') { qtyBase = convert(qtyBase, unit, 'ml'); unit = 'ml'; }
      }
      const e = merged.get(key);
      if (e) {
        if (qtyBase != null && e.qtyBase != null && e.unit === unit) e.qtyBase += qtyBase;
        else { e.qtyBase = null; e.unit = obj.unit || e.unit; }
        e.meals.push(meal.recipe.name);
      } else {
        merged.set(key, {
          id: prev.get(key)?.id || uid(),
          key, name: obj.name, qtyBase, unit, note: obj.note || '',
          aisle: prev.get(key)?.aisle, checked: prev.get(key)?.checked || false,
          meals: [meal.recipe.name], custom: false,
        });
      }
    }
  }
  for (const item of state.groceries.items) if (item.custom) merged.set(item.key, item);
  // mark items your pantry already covers so the list can show them separately
  const out = [...merged.values()];
  for (const item of out) {
    if (!item.custom && inPantry(item.name)) { item.pantry = true; item.pantryKey = normName(item.name); }
  }
  return out;
}
export function isStaple(nameLower) {
  const s = ' ' + nameLower + ' ';
  return state.settings.staples.some((st) => s.includes(st.toLowerCase()));
}
export function setGroceries(items) {
  state.groceries.items = items;
  state.groceries.updatedAt = Date.now();
  notify();
}
export function toggleGrocery(id) {
  const it = state.groceries.items.find((x) => x.id === id);
  if (it) { it.checked = !it.checked; notify(); }
}
export function addCustomGrocery(name, aisle = 'Other') {
  state.groceries.items.push({ id: uid(), key: name.toLowerCase(), name, aisle, qtyBase: null, unit: null, checked: false, custom: true, meals: [] });
  notify();
}
export function removeGrocery(id) {
  state.groceries.items = state.groceries.items.filter((x) => x.id !== id);
  notify();
}
export function setGroceryAisle(id, aisle) {
  const it = state.groceries.items.find((x) => x.id === id);
  if (it) { it.aisle = aisle; notify(); }
}
export function clearCheckedGroceries() {
  state.groceries.items = state.groceries.items.filter((x) => !x.checked);
  notify();
}

/* ---------- custom recipes ---------- */
export function saveCustomRecipe(recipe) {
  if (recipe.id) {
    const i = state.custom.findIndex((r) => r.id === recipe.id);
    if (i >= 0) state.custom[i] = recipe; else state.custom.push(recipe);
  } else {
    recipe.id = uid();
    recipe.key = 'custom-' + recipe.id;
    recipe.source = 'custom';
    state.custom.push(recipe);
  }
  notify();
}
export function deleteCustomRecipe(id) {
  state.custom = state.custom.filter((r) => r.id !== id);
  notify();
}

/* ---------- settings ---------- */
export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  notify();
}
export function importData(json) {
  const data = JSON.parse(json);
  if (!data || data.v !== 1) throw new Error('Unrecognized backup file');
  state = deepMerge(DEFAULT_STATE(), data);
  delete state.cache; // legacy backups may carry the old pack dump — drop it
  save();
  listeners.forEach((fn) => fn(state));
}
export function resetAll() {
  state = DEFAULT_STATE();
  save();
  listeners.forEach((fn) => fn(state));
}
export { addDays };
