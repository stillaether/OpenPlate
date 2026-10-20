/* OpenPlate — sources.js : unified adapters for 3 open recipe sources
   1. "local"     — built-in CC0 library (js/data-local.js)
   2. "mealdb"    — TheMealDB (themealdb.com) — FULL pack bundled offline (js/data-mealdb.js)
   3. "dummyjson" — DummyJSON open recipes — FULL pack bundled offline (js/data-dummyjson.js)
   Everything is normalized to one schema. No network needed: recipes + images ship with the app. */
'use strict';

import { LOCAL_RECIPES } from './data-local.js';
import { MEALDB_PACK } from './data-mealdb.js';
import { DUMMYJSON_PACK } from './data-dummyjson.js';
import { parseQty, normName, allergensOf, dietOf, timeTotal } from './util.js';

export const SOURCES = {
  local: { id: 'local', label: 'OpenPlate Library', short: 'Built-in', url: '', offline: true },
  mealdb: { id: 'mealdb', label: 'TheMealDB', short: 'TheMealDB', url: 'https://www.themealdb.com', offline: true },
  dummyjson: { id: 'dummyjson', label: 'DummyJSON Recipes', short: 'DummyJSON', url: 'https://dummyjson.com/recipes', offline: true },
};
export const API = 'https://www.themealdb.com/api/json/v1/1/';

/* ---------- normalization ---------- */
export function normMealdb(m) {
  const ingredients = [];
  const seen = new Set();
  for (let i = 1; i <= 20; i++) {
    const name = (m['strIngredient' + i] || '').trim();
    if (!name) continue;
    const raw = (m['strMeasure' + i] || '').trim();
    const { qty, unit, note } = parseQty(raw);
    // TheMealDB occasionally repeats an ingredient row — keep the first occurrence
    const dedupKey = name.toLowerCase() + '|' + raw.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    ingredients.push({ name: name.toLowerCase(), qty, unit, note: note || '' });
  }
  const tags = [];
  if (m.strTags) tags.push(...m.strTags.split(',').map((t) => t.trim()).filter(Boolean));
  const diet = [];
  const cat = (m.strCategory || '').toLowerCase();
  if (cat === 'vegan') diet.push('vegan', 'vegetarian');
  if (cat === 'vegetarian') diet.push('vegetarian');
  if (cat === 'seafood') diet.push('pescatarian');
  const r = {
    key: 'mealdb-' + m.idMeal, source: 'mealdb', id: m.idMeal,
    name: m.strMeal, image: m.strMealThumb || null, emoji: null, grad: null,
    servings: 4, timePrep: null, timeCook: null, cuisine: m.strArea || null,
    category: m.strCategory || 'Dinner', tags,
    ingredients, steps: splitSteps(m.strInstructions || ''),
    kcal: null, rating: null, youtube: m.strYoutube || null, sourceUrl: 'https://www.themealdb.com/meal/' + m.idMeal,
    dietTags: diet,
  };
  r.allergens = allergensOf(r.ingredients);
  r.dietTags = [...new Set([...(r.dietTags || []), ...dietOf(r)])];
  return r;
}
export function normDummy(r) {
  const ingredients = r.ingredients.map((s) => {
    const { qty, unit, note } = parseQty(s);
    if (qty != null) {
      const cleaned = s.replace(/^\s*(\d+\s*\d*\/\d*|\d*\.?\d+|\d+)\s*[a-zA-Z.]*\s*/, '').trim();
      const [nPart, ...nRest] = cleaned.split(',');
      return { name: (nPart || cleaned).toLowerCase().trim(), qty, unit, note: nRest.join(',').trim() || note || '' };
    }
    return { name: s.toLowerCase().trim(), qty: null, unit: null, note: '' };
  });
  const out = {
    key: 'dummyjson-' + r.id, source: 'dummyjson', id: r.id,
    name: r.name, image: r.image || null, emoji: null, grad: null,
    servings: r.servings || 4, timePrep: r.prepTimeMinutes ?? null, timeCook: r.cookTimeMinutes ?? null,
    cuisine: r.cuisine || null, category: (r.mealType && r.mealType[0]) || 'Dinner',
    tags: r.tags || [], ingredients, steps: r.instructions || [],
    kcal: r.caloriesPerServing ?? null, rating: r.rating ?? null, youtube: null,
    sourceUrl: null, dietTags: [],
  };
  out.allergens = allergensOf(out.ingredients);
  out.dietTags = dietOf(out);
  return out;
}
function splitSteps(text) {
  return String(text).split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 3);
}

/* ---------- bundled offline pack + module-local cache ----------
   The full open recipe libraries ship inside the app (data + compressed images),
   so Discover / search / planning work with zero network access.
   The cache deliberately lives in module memory (NOT in persisted state) —
   otherwise every localStorage save would serialize the whole pack. */
let cache = { at: 0, mealdb: [], dummyjson: [] };
export function getCache() { return cache; }
let packLoaded = false;
export function ensurePackLoaded() {
  if (packLoaded) return;
  const have = new Set(cache.mealdb.map((r) => r.key));
  for (const m of MEALDB_PACK.meals || []) {
    const n = normMealdb(m);
    if (!have.has(n.key)) { cache.mealdb.push(n); have.add(n.key); }
  }
  const haveD = new Set(cache.dummyjson.map((r) => r.key));
  for (const r of DUMMYJSON_PACK.recipes || []) {
    const n = normDummy(r);
    if (!haveD.has(n.key)) { cache.dummyjson.push(n); haveD.add(n.key); }
  }
  if (!cache.at) cache.at = MEALDB_PACK.at || Date.now();
  packLoaded = true;
  INDEX = null; // force search index rebuild over the full pool
}
export function packCounts() {
  return { mealdb: (MEALDB_PACK.meals || []).length, dummyjson: (DUMMYJSON_PACK.recipes || []).length };
}

async function fetchJSON(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

/** Optional top-up: merge any newly published recipes from the open APIs.
 *  The full libraries already ship bundled, so this is never required.
 *  Merges into the session cache (it never removes bundled recipes). */
export async function seedCache() {
  const result = { mealdb: 0, dummyjson: 0, error: null };
  try {
    const letters = ['c', 's', 'b', 'p'];
    const meals = [];
    const settled = await Promise.allSettled(letters.map((l) => fetchJSON(API + 'search.php?f=' + l)));
    for (const s of settled) if (s.status === 'fulfilled' && s.value?.meals) meals.push(...s.value.meals);
    try {
      const rs = await fetchJSON(API + 'randomselection.php');
      if (rs?.meals) meals.push(...rs.meals);
    } catch { /* optional */ }
    const known = new Set(cache.mealdb.map((r) => r.key));
    let added = 0;
    for (const m of meals) {
      if (!m.idMeal || known.has('mealdb-' + m.idMeal)) continue;
      known.add('mealdb-' + m.idMeal);
      cache.mealdb.push(normMealdb(m)); added++;
    }
    result.mealdb = added;
  } catch (e) { result.error = 'mealdb:' + e.message; }
  try {
    const data = await fetchJSON('https://dummyjson.com/recipes?limit=0');
    const knownD = new Set(cache.dummyjson.map((r) => r.key));
    let addedD = 0;
    for (const r of data?.recipes || []) {
      if (knownD.has('dummyjson-' + r.id)) continue;
      knownD.add('dummyjson-' + r.id);
      cache.dummyjson.push(normDummy(r)); addedD++;
    }
    result.dummyjson = addedD;
  } catch (e) { result.error = (result.error || '') + ' dummyjson:' + e.message; }
  if (result.mealdb || result.dummyjson) { cache.at = Date.now(); INDEX = null; }
  return result;
}

/* ---------- pools ---------- */
export function localPool(custom = [], favorites = []) {
  return [...LOCAL_RECIPES, ...custom, ...favorites];
}
export function allPool(custom, favorites) {
  return [...localPool(custom, favorites), ...cache.mealdb, ...cache.dummyjson];
}
export async function getRecipe(key, custom = [], favorites = []) {
  const pool = allPool(custom, favorites);
  return pool.find((r) => r.key === key) || null; // everything ships bundled — no lookup calls needed
}

/* ---------- shadowban (hide recipes / ingredients / food types) ----------
   Bans are { recipes:{key:{name,until}}, ingredients:{name:until}, categories:{name:until} }
   where `until` is an epoch-ms expiry or null = permanent. */
export function banHit(r, bans) {
  if (!bans) return false;
  if (bans.recipes && bans.recipes[r.key]) return true;
  if (bans.categories) {
    const cat = (r.category || '').toLowerCase();
    if (cat && bans.categories[cat]) return true;
    if ((r.tags || []).some((t) => bans.categories[String(t).toLowerCase()])) return true;
  }
  if (bans.ingredients && Object.keys(bans.ingredients).length) {
    for (const ing of r.ingredients || []) {
      const s = (typeof ing === 'string' ? ing : ing.name).toLowerCase();
      for (const b in bans.ingredients) if (s.includes(b)) return true;
    }
  }
  return false;
}
function applyBans(list, bans) {
  if (!bans) return list;
  const kept = list.filter((r) => !banHit(r, bans));
  kept.bansHidden = list.length - kept.length;
  return kept;
}

/* ---------- instant fuzzy search ----------
   A precomputed, normalized index over the whole offline database makes
   search-as-you-type instantaneous (no network, no per-keystroke scanning of
   raw text). Scoring: name > ingredients > cuisine/category/tags, with
   prefix and typo tolerance (trigram similarity). */
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
function trigrams(s) {
  const t = ' ' + s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const out = new Set();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
function dice(a, b) {
  if (!a || !b || !a.size || !b.size) return 0;
  let inter = 0;
  for (const g of a) if (b.has(g)) inter++;
  return (2 * inter) / (a.size + b.size);
}
const TOK_GRAMS = new Map(); // vocab memo for fuzzy matching
function tokGrams(t) {
  let g = TOK_GRAMS.get(t);
  if (!g) { g = trigrams(t); if (TOK_GRAMS.size > 8000) TOK_GRAMS.clear(); TOK_GRAMS.set(t, g); }
  return g;
}
let INDEX = null, INDEX_STAMP = null;
function ensureIndex(custom = [], favorites = []) {
  const stamp = custom.length + ':' + favorites.length;
  if (INDEX && INDEX_STAMP === stamp) return INDEX;
  const pool = allPool(custom, favorites);
  const docs = pool.map((r) => {
    const nameF = fold(r.name || '');
    const nameToks = new Set(words(r.name || ''));
    const ingF = fold((r.ingredients || []).map((i) => (typeof i === 'string' ? i : [i.name, i.note].filter(Boolean).join(' '))).join(' '));
    const ingToks = new Set(words(ingF));
    const metaToks = new Set(words([r.cuisine, r.category, ...(r.tags || [])].join(' ')));
    const grams = trigrams(nameF + ' ' + ingF);
    return { r, nameF, nameToks, ingF, ingToks, metaToks, grams };
  });
  INDEX = { docs };
  INDEX_STAMP = stamp;
  return INDEX;
}
function scoreDoc(d, qtoks, qgrams) {
  let total = 0;
  for (let qi = 0; qi < qtoks.length; qi++) {
    const qt = qtoks[qi];
    let best = 0;
    if (d.nameToks.has(qt)) best = 100;
    else if (d.nameF.includes(qt)) best = 60; // substring / word start inside the name
    if (best < 40) {
      if (d.ingToks.has(qt)) best = Math.max(best, 40);
      else if (d.ingF.includes(qt)) best = Math.max(best, 30);
    }
    if (best < 25) {
      if (d.metaToks.has(qt)) best = Math.max(best, 25);
      else for (const t of d.metaToks) if (t.startsWith(qt)) { best = Math.max(best, 18); break; }
    }
    if (!best) {
      // typo tolerance: trigram similarity against name tokens, then ingredient tokens
      const qg = qgrams[qi];
      let sim = 0;
      for (const t of d.nameToks) { const s2 = dice(qg, tokGrams(t)); if (s2 > sim) sim = s2; }
      const nameSim = sim;
      if (sim < 0.55) for (const t of d.ingToks) { const s2 = dice(qg, tokGrams(t)) * 0.75; if (s2 > sim) sim = s2; }
      // longer words need stronger evidence before we call it a match
      const min = qt.length > 8 ? 0.55 : qt.length > 5 ? 0.48 : 0.42;
      if (sim >= min) best = Math.round(nameSim >= min ? sim * 55 : sim * 45);
    }
    if (!best) return 0; // every word of the query must match somewhere
    total += best;
  }
  return total;
}
export function searchRecipes({ q = '', source = 'all', category = '', diet = '', maxTime = 0, allergens = [], dislikes = [], bans = null, custom = [], favorites = [] } = {}) {
  ensureIndex(custom, favorites);
  let docs = INDEX.docs;
  if (source !== 'all') docs = docs.filter((d) => d.r.source === source || d.r.source === 'custom' || d.r.source === 'favorite');
  if (category) docs = docs.filter((d) => (d.r.category || '').toLowerCase() === category.toLowerCase() || (d.r.tags || []).some((t) => t.toLowerCase() === category.toLowerCase()));
  if (diet && diet !== 'all') docs = docs.filter((d) => d.r.dietTags?.includes(diet));
  if (maxTime) docs = docs.filter((d) => !timeTotal(d.r) || timeTotal(d.r) <= maxTime);
  if (allergens?.length) docs = docs.filter((d) => !(d.r.allergens || allergensOf(d.r.ingredients || [])).some((a) => allergens.includes(a)));
  if (dislikes?.length) docs = docs.filter((d) => !(d.r.ingredients || []).some((i) => {
    const s = (typeof i === 'string' ? i : i.name).toLowerCase();
    return dislikes.some((dd) => s.includes(dd.toLowerCase()));
  }));
  const qtoks = words(q);
  let results, bansHidden = 0;
  if (qtoks.length) {
    const qgrams = qtoks.map(tokGrams);
    const scored = [];
    for (const d of docs) {
      if (banHit(d.r, bans)) { bansHidden++; continue; }
      const sc = scoreDoc(d, qtoks, qgrams);
      if (sc > 0) scored.push([sc, d.r]);
    }
    scored.sort((a, b) => b[0] - a[0] || (b[1].rating || 0) - (a[1].rating || 0) || a[1].name.localeCompare(b[1].name));
    results = scored.slice(0, 120).map((x) => x[1]);
    results.bansHidden = bansHidden;
    results.query = q.trim();
    return results;
  }
  results = docs.filter((d) => !banHit(d.r, bans)).map((d) => d.r);
  bansHidden = docs.length - results.length;
  results.bansHidden = bansHidden;
  return results.slice(0, 90); // browse view: keep the grid light; search finds anything
}

/* ---------- cook with what you have (fully offline) ---------- */
export function findByIngredients(haveList = [], custom = [], favorites = [], bans = null) {
  const have = haveList.map((h) => normName(h)).filter(Boolean);
  if (!have.length) return [];
  const pool = allPool(custom, favorites);
  const localResults = [];
  for (const r of pool) {
    const ingNames = (r.ingredients || []).map((i) => (typeof i === 'string' ? i : i.name));
    const normed = ingNames.map(normName);
    let matched = 0;
    const missing = [];
    for (let i = 0; i < normed.length; i++) {
      if (have.some((h) => normed[i].includes(h) || h.includes(normed[i]))) matched++;
      else missing.push(ingNames[i]);
    }
    if (matched > 0) localResults.push({ recipe: r, have: matched, total: normed.length, missing: missing.slice(0, 6) });
  }
  localResults.sort((a, b) => (b.have / b.total) - (a.have / a.total) || b.have - a.have);
  let out = localResults.slice(0, 40);
  if (bans) {
    const kept = out.filter((h) => !banHit(h.recipe, bans));
    kept.bansHidden = out.length - kept.length;
    out = kept;
  }
  return out;
}

/* ---------- categories ---------- */
export function categories() {
  const set = new Set();
  for (const r of allPool()) { if (r.category) set.add(r.category); (r.tags || []).slice(0, 3).forEach((t) => set.add(t)); }
  return [...set].sort();
}
export function sourceCounts() {
  return {
    local: LOCAL_RECIPES.length,
    mealdb: cache.mealdb.length,
    dummyjson: cache.dummyjson.length,
  };
}
