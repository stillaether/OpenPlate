/* OpenPlate — planner.js : smart plan generation
   Filters by diet/allergies/dislikes/bans/time/BUDGET CAP, then scores for variety:
   - slot-aware picking (breakfast / lunch / dinner pools)
   - rotates protein types across days
   - avoids repeats from recent plans
   - planning modes: standard (variety) · pantry (use what I have) · mixed (spend least) */
'use strict';

import { allPool, banHit } from './sources.js';
import { dietOf, timeTotal, normName } from './util.js';
import { estimateRecipeCost, ingredientCost } from './prices.js';

const PROTEINS = [
  ['chicken', /chicken|turkey|poultry/i],
  ['beef', /beef|steak|burger|brisket|ribs/i],
  ['pork', /pork|bacon|ham|sausage|chorizo|prosciutto/i],
  ['seafood', /shrimp|salmon|fish|tuna|cod|prawn|scallop|crab|tilapia|halibut|anchov/i],
  ['beans', /bean|chickpea|lentil|tofu|falafel|tempeh/i],
  ['egg', /egg|frittata|omelet|omelette|shakshuka/i],
  ['cheese', /cheese|pizza|ricotta|feta|mozzarella|parmesan/i],
  ['pasta', /pasta|spaghetti|noodle|penne|macaroni|linguine|fettuccine|orzo/i],
  ['rice', /rice|risotto|fried rice|pilaf|paella/i],
];
function proteinOf(r) {
  const hay = (r.name || '') + ' ' + (r.ingredients || []).map((i) => (typeof i === 'string' ? i : i.name)).join(' ');
  for (const [name, re] of PROTEINS) if (re.test(hay)) return name;
  return 'other';
}

export function filterPool(recipes, settings, bans = null, opts = {}) {
  const { diet, allergens, dislikes, maxTime, sources } = settings;
  const NOT_MAIN = /beverage|smoothie|drink|cocktail|snack|dessert|sauce|condiment|spice mix/i;
  const cap = opts.maxCost !== undefined ? opts.maxCost : (settings.budget?.on ? settings.budget.max : null);
  const out = recipes.filter((r) => {
    if (bans && banHit(r, bans)) return false;
    if (sources && r.source !== 'local' && r.source !== 'custom' && r.source !== 'favorite' && !sources[r.source]) return false;
    // mains only: skip drinks/snacks/desserts in generated lunch/dinner plans
    if (NOT_MAIN.test(r.category || '') || NOT_MAIN.test(r.name || '')) return false;
    const tags = r.dietTags?.length ? r.dietTags : dietOf(r);
    if (diet && diet !== 'all') {
      if (!tags.includes(diet)) return false;
    }
    if (allergens?.length) {
      const hits = r.allergens || [];
      if (hits.some((a) => allergens.includes(a))) return false;
    }
    if (dislikes?.length) {
      const ings = (r.ingredients || []).map((i) => (typeof i === 'string' ? i : i.name).toLowerCase()).join(' | ');
      if (dislikes.some((d) => ings.includes(d.toLowerCase()))) return false;
    }
    const t = timeTotal(r);
    if (maxTime && t && t > maxTime) return false;
    // price cap: keep the plan away from expensive meals (per-serving estimate, CAD)
    if (cap != null && cap > 0) {
      const c = estimateRecipeCost(r);
      if (c.perServing > cap) return false;
    }
    return true;
  });
  return out;
}

/* ---------- pantry matching ---------- */
function haveHit(ingName, haveArr) {
  const n = normName(ingName);
  if (!n) return false;
  for (const h of haveArr) {
    if (n === h) return true;
    if (h.length >= 4 && (n.includes(h) || h.includes(n))) return true;
  }
  return false;
}
/** how much of a recipe is already in the kitchen + estimated cost of what's missing */
function pantryStats(r, haveArr) {
  let total = 0, have = 0, missCost = 0;
  for (const ing of r.ingredients || []) {
    const o = typeof ing === 'string' ? { name: ing, qty: null, unit: null } : ing;
    if (!o.name) continue;
    total++;
    if (haveHit(o.name, haveArr)) have++;
    else missCost += ingredientCost(o);
  }
  const serv = r.servings || 4;
  return { ratio: total ? have / total : 0, missPerServing: missCost / serv };
}

/* ---------- slot suitability ----------
   2 = clearly made for this slot, 1 = generic main (fits lunch/dinner), 0 = poor fit.
   Breakfast keeps a strict pool (nobody wants curry at 7am); lunch & dinner share the mains pool. */
const SLOT_HINTS = {
  breakfast: /\bbreakfast\b|pancake|oatmeal|porridge|omelet|omelette|granola|frittata|shakshuka|french toast|cereal|yogurt|bagel|muffin|smoothie bowl|breakfast burrito/i,
  lunch: /\blunch\b|sandwich|wrap|salad|soup|burger|taco|quesadilla|panini|bento|pasta salad/i,
  dinner: /\bdinner\b|supper/i,
};
const NOT_MAIN = /beverage|smoothie|drink|cocktail|snack|dessert|sauce|condiment|spice mix/i;
export function slotScore(r, slot) {
  const hay = [r.category || '', ...(r.tags || []), r.name || ''].join(' ').toLowerCase();
  if (SLOT_HINTS[slot] && SLOT_HINTS[slot].test(hay)) return 2;
  if (slot === 'breakfast') return 0;
  return NOT_MAIN.test(hay) ? 0 : 1;
}

/**
 * Generate a customizable meal plan.
 * @param {object} opts { days, slots:['breakfast','lunch','dinner'], servings, state,
 *                        excludeKeys:[], preferKeys:[], recentKeys:[],
 *                        mode:'standard'|'pantry'|'mixed', have:[] }
 * Returns meals ordered day-major: [day0-slotA, day0-slotB, day1-slotA, ...]
 */
export function generatePlan(opts = {}) {
  const { days = 1, slots = ['dinner'], servings = 2, state } = opts;
  const settings = state.settings;
  const bans = state.bans;
  const mode = opts.mode || settings.planMode || 'standard';
  let pool = filterPool(allPool(state.custom, state.favorites), settings, bans);
  if (!pool.length) pool = filterPool(allPool(state.custom, state.favorites), { ...settings, maxTime: 0 }, bans);
  if (!pool.length) pool = filterPool(allPool(state.custom, state.favorites), { ...settings, maxTime: 0, budget: { on: false } }, bans);
  if (!pool.length) pool = allPool(state.custom, state.favorites); // last resort: ignore filters
  if (opts.excludeKeys?.length) {
    const ex = new Set(opts.excludeKeys);
    pool = pool.filter((r) => !ex.has(r.key));
  }

  const recent = new Set(opts.recentKeys || []);
  const prefer = new Set(opts.preferKeys || []);
  const have = (opts.have && opts.have.length) ? opts.have : [];

  // precompute pantry/cost stats once per candidate (not per slot)
  const stats = new Map();
  if (mode !== 'standard' && have.length) {
    for (const r of pool) stats.set(r.key, pantryStats(r, have));
  }

  const picked = [];
  const usedProtein = [];
  const usedSource = [];
  const candidates = [...pool];
  // shuffle for freshness
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const work = [...candidates];
  const total = days * slots.length;
  while (picked.length < total && work.length) {
    const slot = slots[picked.length % slots.length];
    let bestIdx = -1, bestScore = -Infinity;
    for (let i = 0; i < work.length; i++) {
      const r = work[i];
      const sc = slotScore(r, slot);
      if (sc === 0) continue;
      let score = sc === 2 ? 20 : 0;
      const prot = proteinOf(r);
      const protPenalty = usedProtein.length - (usedProtein.lastIndexOf(prot) + 1);
      if (mode === 'pantry') {
        const st = stats.get(r.key);
        if (st) { score += 44 * st.ratio; if (st.ratio >= 0.999) score += 14; }
        score -= 8 * protPenalty;
      } else if (mode === 'mixed') {
        const st = stats.get(r.key);
        if (st) score += 15 * st.ratio - 3.2 * st.missPerServing;
        score -= 10 * protPenalty;
      } else {
        score -= 14 * protPenalty;
      }
      if (recent.has(r.key)) score -= 30;
      if (prefer.has(r.key)) score += 8;
      if (r.source === 'favorite') score += 3;
      if (r.rating) score += Math.min(4, r.rating) * 0.8;
      const srcTurn = usedSource.length ? usedSource[usedSource.length - 1] : '';
      if (r.source !== srcTurn) score += 2; // rotate sources
      score += Math.random() * 6; // serendipity
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx < 0) {
      // slot pool exhausted -> relax to any remaining candidate rather than leave a hole
      bestIdx = 0;
    }
    const chosen = work.splice(bestIdx, 1)[0];
    picked.push({ recipe: chosen, date: null, slot, servings });
    usedProtein.push(proteinOf(chosen));
    usedSource.push(chosen.source);
  }
  return picked;
}

export function swapMeal(meal, opts = {}) {
  const state = opts.state;
  const settings = state.settings;
  const allowExpensive = !!meal.splurge || !!opts.allowExpensive;
  let pool = filterPool(allPool(state.custom, state.favorites), settings, state.bans, allowExpensive ? { maxCost: null } : {});
  const exclude = new Set([...(opts.excludeKeys || []), meal.recipe.key, ...(state.plan?.meals.map((m) => m.recipe.key) || [])]);
  pool = pool.filter((r) => !exclude.has(r.key));
  const recent = new Set(opts.recentKeys || []);
  pool = pool.filter((r) => !recent.has(r.key));
  if (!pool.length) pool = allPool(state.custom, state.favorites).filter((r) => r.key !== meal.recipe.key);
  if (!pool.length) return meal.recipe;
  // prefer different protein
  const oldProt = proteinOf(meal.recipe);
  let alt = pool.filter((r) => proteinOf(r) !== oldProt);
  if (!alt.length) alt = pool;
  // pantry-aware swaps: rank by what you already have
  const mode = opts.mode || settings.planMode || 'standard';
  const have = opts.have && opts.have.length ? opts.have : [];
  if (mode !== 'standard' && have.length) {
    const ranked = alt
      .map((r) => [pantryStats(r, have), r])
      .sort((a, b) => b[0].ratio - a[0].ratio || a[0].missPerServing - b[0].missPerServing)
      .slice(0, 8)
      .map((x) => x[1]);
    return ranked[Math.floor(Math.random() * ranked.length)];
  }
  return alt[Math.floor(Math.random() * alt.length)];
}

export function proteinLabel(r) { return proteinOf(r); }
