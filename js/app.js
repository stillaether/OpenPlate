/* OpenPlate — app.js : router, interactions, reminders, offline seeding */
'use strict';

import { $, $$, esc, clamp, parseQty, fmtAmount, todayStr, addDays, copyText, download, debounce } from './util.js';
import { showToast, openModal, closeModal, modalOpen, viewPlan, mealMenuModal, viewGroceries, groceryAddModal, groceryAisleModal, shopOnlineModal, setShopStore } from './views-core.js';
import { viewRecipes, viewRecipeDetail, addPlanModal, renderCookMode, closeCookMode, showTimer, recipeEditorModal, generateModal, huntModal, onboardingModal, hideModal, mealPickerModal, pickerPreset, searchResultsArea, dayPlanModal } from './views-recipes.js';
import { viewSettings, drawImpactCharts, dietModal, staplesModal, servingsModal, timeModal, wasteModal, reminderModal, storesModal, aboutModal, confirmModal, bansModal, budgetModal, pantryModal } from './views-settings.js';
import * as store from './store.js';
import { generatePlan, swapMeal } from './planner.js';
import { searchRecipes, findByIngredients, getRecipe, seedCache, getCache, sourceCounts, ensurePackLoaded } from './sources.js';
import { estimateNutrition } from './nutrition.js';
import { CA_STORES } from './prices.js';

let seg = 'discover';
let query = '';
let searchResults = null;
let huntResults = null;
let wakeLock = null;

/* ---------------- router ---------------- */
const routes = { plan: viewPlan, groceries: viewGroceries, recipes: () => viewRecipes(seg, query, searchResults, huntResults), settings: viewSettings };

function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  if (name === 'recipe' && rest[0]) return { name: 'recipe', arg: decodeURIComponent(rest.join('/')) };
  if (routes[name]) return { name, arg: null };
  return { name: 'plan', arg: null };
}

function render() {
  const st = store.getState();
  document.documentElement.classList.toggle('dark', !!st.settings.dark);
  const { name, arg } = currentRoute();
  const main = document.getElementById('view');

  // topbar + tab state
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name || (name === 'recipe' && t.dataset.tab === 'recipes')));
  document.getElementById('topbar').innerHTML = topbarFor(name);

  if (name === 'recipe') {
    const r = recipeFromMemory(arg);
    if (r) { main.innerHTML = viewRecipeDetail(r, detailServ); bindDetail(); }
    else { main.innerHTML = `<section class="pad">${'<div class="loading">Loading recipe…</div>'}</section>`;
      getRecipe(arg, st.custom, st.favorites).then((r2) => {
        if (r2 && currentRoute().name === 'recipe') { detailServ = null; main.innerHTML = viewRecipeDetail(r2, detailServ); bindDetail(); }
        else showToast('Recipe not found', { tone: 'warn' });
      });
    }
  } else {
    closeCookMode();
    main.innerHTML = routes[name]();
    if (name === 'settings') requestAnimationFrame(drawImpactCharts);
    if (name === 'recipes' && seg === 'discover' && searchResults === null) runSearch();
    const si = document.getElementById('search-input');
    if (si) si.focus({ preventScroll: true });
  }
  updateBadges();
}
let detailServ = null;
function recipeFromMemory(key) {
  const st = store.getState();
  const pools = [st.custom, st.favorites, getCache().mealdb, getCache().dummyjson];
  for (const p of pools) { const hit = p.find((r) => r.key === key); if (hit) return hit; }
  return null;
}
function topbarFor(name) {
  const titles = { plan: 'Meal Plan', groceries: 'Groceries', recipes: 'Recipes', settings: 'Settings' };
  if (name === 'recipe') return `<button class="top-btn" data-action="nav-back" aria-label="Back">←</button><span class="top-title">Recipe</span><span></span>`;
  return `<span class="top-logo" aria-hidden="true">🍽️</span><span class="top-title">${titles[name] || 'OpenPlate'}</span><button class="top-btn" data-action="theme-quick" aria-label="Toggle dark mode" title="Dark mode">◐</button>`;
}
function updateBadges() {
  const st = store.getState();
  const planLeft = st.plan ? st.plan.meals.filter((m) => !m.done).length : 0;
  const groLeft = st.groceries.items.filter((i) => !i.checked && !i.pantry).length;
  setBadge('plan', planLeft);
  setBadge('groceries', groLeft);
}
function setBadge(tab, n) {
  const el = document.querySelector(`.tab[data-tab="${tab}"] .nav-badge`);
  if (!el) return;
  el.textContent = n > 0 ? n : '';
  el.style.display = n > 0 ? 'grid' : 'none';
}

/* ---------------- grocery sync ---------------- */
let lastGroceries = '';
function syncGroceries() {
  const items = store.groceriesFromPlan();
  const ser = JSON.stringify(items.map((i) => i.key + (i.pantry ? 'P' : '') + (i.qtyBase == null ? '' : Math.round(i.qtyBase * 10) / 10)));
  if (ser !== lastGroceries) {
    lastGroceries = ser;
    store.setGroceries(items);
  }
}

/* ---------------- boot ---------------- */
async function boot() {
  store.load();
  ensurePackLoaded(); // full open libraries (data + photos) ship with the app - zero network
  store.subscribe(() => { syncGroceries(); render(); });
  syncGroceries(); // rebuild grocery ids/merges from the current plan on every launch

  if (!store.getState().onboarded) {
    onboardingModal();
  }
  render();
  setInterval(checkReminder, 30000);
  if ('serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('sw.js'); } catch { /* ignore */ }
  }
}

/* ---------------- reminders ---------------- */
function checkReminder() {
  const s = store.getState().settings;
  if (!s.reminder.enabled) return;
  const now = new Date();
  const today = now.getDay();
  const [h, m] = s.reminder.time.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const targetMin = h * 60 + m;
  const key = todayStr() + ':' + s.reminder.day;
  if (today === s.reminder.day && Math.abs(nowMin - targetMin) <= 1 && s.lastReminderFired !== key) {
    s.lastReminderFired = key;
    store.notify();
    notifyUser('Time to plan your meals! 🗓️', 'Open OpenPlate to generate next week\'s plan and grocery list.');
  }
}
function notifyUser(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
    else showToast(title);
  } catch { showToast(title); }
}

/* ---------------- search (instant, offline, fuzzy) ---------------- */
function runSearch() {
  const st = store.getState();
  searchResults = searchRecipes({
    q: query, source: st.searchSource || 'all', category: st.searchCat || '',
    diet: st.settings.diet, maxTime: st.settings.maxTime,
    allergens: st.settings.allergens, dislikes: st.settings.dislikes,
    bans: st.bans,
    custom: st.custom, favorites: st.favorites,
  });
  render();
}
/* as-you-type: recompute over the prebuilt index and swap just the results
   container — the search input is never re-rendered, so focus/cursor survive */
const instantSearch = debounce(() => {
  const box = document.getElementById('search-results');
  if (!box) return;
  const st = store.getState();
  searchResults = searchRecipes({
    q: query, source: st.searchSource || 'all', category: st.searchCat || '',
    diet: st.settings.diet, maxTime: st.settings.maxTime,
    allergens: st.settings.allergens, dislikes: st.settings.dislikes,
    bans: st.bans,
    custom: st.custom, favorites: st.favorites,
  });
  box.innerHTML = searchResultsArea(searchResults, huntResults);
}, 40);

/* ---------------- cook mode ---------------- */
async function enterCook(r, servings) {
  renderCookMode(r, servings);
  document.body.classList.add('cook-open');
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
    wakeLock?.addEventListener('release', () => { wakeLock = null; const b = document.getElementById('wakelock-btn'); if (b) b.classList.remove('on'); });
    document.getElementById('wakelock-btn')?.classList.add('on');
  } catch { /* denied */ }
}
function exitCook() {
  closeCookMode();
  document.body.classList.remove('cook-open');
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}
function bindDetail() {
  /* handled via delegation */
}

/* ---------------- delegated events ---------------- */
document.addEventListener('click', async (e) => {
  const t = e.target;
  const el = t.closest('[data-action]');
  if (t.closest('[data-close-modal]') || t.closest('[data-close]')) { closeModal(); return; }
  if (el) {
    const a = el.dataset.action;
    const st = store.getState();
    const id = el.dataset.id;
    const key = el.dataset.key;

    switch (a) {
      /* navigation */
      case 'nav': location.hash = el.dataset.nav; return;
      case 'nav-back': history.back(); if (!history.length) location.hash = '#/plan'; return;
      case 'theme-quick': store.updateSettings({ dark: !st.settings.dark }); return;

      /* plan */
      case 'plan-generate': generateModal(!!(st.plan && st.plan.meals.length)); return;
      case 'plan-generate-run': runPlanGenerate(st, 'fresh'); return;
      case 'plan-generate-append': runPlanGenerate(st, 'append'); return;
      case 'plan-finish': confirmModal('Finish & archive this plan?', 'The plan moves to history (Settings → impact), your grocery list stays, and you can start fresh.', 'Finish plan', 'plan-finish-run', false); return;
      case 'plan-finish-run': store.finishPlan(); closeModal(); showToast('Plan archived 🗄️'); return;

      /* meals */
      case 'meal-open': if (!t.closest('button')) location.hash = '#/recipe/' + encodeURIComponent(st.plan.meals.find((m) => m.id === id)?.recipe.key || ''); return;
      case 'meal-done': {
        const m = st.plan?.meals.find((x) => x.id === id);
        if (m) { store.markDone(id, !m.done); showToast(m.done ? 'Un-marked' : '🎉 Cooked! Impact updated'); }
        return;
      }
      case 'meal-menu': mealMenuModal(id); return;
      case 'meal-add': mealPickerModal(); return;
      case 'pick-meal': {
        const r = recipeFromMemory(key) || await getRecipe(key, st.custom, st.favorites);
        if (r) { closeModal(); addPlanModal(r, pickerPreset()); }
        return;
      }
      case 'meal-save': {
        const m = document.querySelector('.modal');
        store.updateMeal(id, {
          date: m.querySelector('#mm-date').value,
          slot: m.querySelector('#mm-slot').value,
          servings: clamp(parseInt(m.querySelector('#mm-serv').value, 10) || 2, 1, 24),
          splurge: m.querySelector('#mm-splurge .chip-on')?.dataset.s === 'yes',
        });
        closeModal(); showToast('Meal updated'); return;
      }
      case 'meal-swap': {
        const m = st.plan?.meals.find((x) => x.id === id);
        const recentKeys = st.history.slice(0, 2).flatMap((h) => h.meals.map((x) => x.recipe.key));
        const nr = swapMeal(m, { state: st, recentKeys, allowExpensive: !!m.splurge, mode: st.settings.planMode, have: store.haveList() });
        store.updateMeal(id, { recipe: nr });
        closeModal(); showToast('🔄 Swapped to: ' + nr.name); return;
      }
      case 'meal-remove': store.removeMeal(id); closeModal(); showToast('Removed from plan'); return;

      /* daily planning: fill one specific day */
      case 'day-add': dayPlanModal(el.dataset.date); return;
      case 'day-generate-run': {
        const date = el.dataset.date;
        const slots = [...document.querySelectorAll('#dp-slots .chip-on')].map((c) => c.dataset.slot);
        if (!slots.length) return showToast('Pick at least one meal', { tone: 'warn' });
        const st2 = store.getState();
        const taken = new Set((st2.plan?.meals || []).filter((x) => x.date === date).map((x) => x.slot));
        const free = slots.filter((s) => !taken.has(s));
        if (!free.length) { showToast('That day already has those meals planned', { tone: 'warn' }); return; }
        const recentKeys2 = st2.history.slice(0, 2).flatMap((h) => h.meals.map((x) => x.recipe.key));
        const meals = generatePlan({
          days: 1, slots: free, servings: st2.settings.servings || 2, state: st2,
          mode: st2.settings.planMode, have: store.haveList(),
          recentKeys: recentKeys2, preferKeys: st2.favorites.slice(0, 4).map((f) => f.origKey),
        });
        if (!meals.length) return showToast('No recipes match your filters — loosen them in Settings', { tone: 'warn' });
        meals.forEach((mm) => { mm.date = date; });
        store.addMealsToPlan(meals);
        closeModal(); location.hash = '#/plan';
        showToast(`＋ ${meals.length} meal${meals.length === 1 ? '' : 's'} added to ${date === todayStr() ? 'today' : date}`);
        return;
      }
      case 'day-pick-open': closeModal(); mealPickerModal({ date: el.dataset.date }); return;

      /* groceries */
      case 'grocery-toggle': store.toggleGrocery(id); return;
      case 'grocery-aisle': if (!t.closest('button')) groceryAisleModal(id); return;
      case 'grocery-aisle-save': {
        const v = document.querySelector('#gai-aisle').value;
        store.setGroceryAisle(id, v); closeModal(); return;
      }
      case 'grocery-add': groceryAddModal(); return;
      case 'grocery-add-save': {
        const name = document.querySelector('#ga-name').value.trim();
        if (!name) return showToast('Type an item first', { tone: 'warn' });
        store.addCustomGrocery(name, document.querySelector('#ga-aisle').value);
        closeModal(); showToast('Added to list'); return;
      }
      case 'grocery-remove': store.removeGrocery(id); return;
      case 'grocery-clear-checked': store.clearCheckedGroceries(); showToast('Checked items cleared'); return;
      case 'grocery-sync': { lastGroceries = ''; syncGroceries(); showToast('🔄 List synced with plan'); render(); return; }
      case 'grocery-copy': {
        const lines = [];
        const byAisle = {};
        for (const i of st.groceries.items) { (byAisle[i.aisle || 'Other'] = byAisle[i.aisle || 'Other'] || []).push(i); }
        for (const [aisle, list] of Object.entries(byAisle)) {
          lines.push(aisle.toUpperCase());
          for (const i of list) lines.push(`${i.checked ? '[x]' : '[ ]'} ${i.name}${i.qtyBase != null ? ` — ${fmtAmtForCopy(i)}` : ''}`);
          lines.push('');
        }
        copyText(lines.join('\n')).then(() => showToast('📋 List copied to clipboard'));
        return;
      }
      case 'grocery-shopsheet': shopOnlineModal(); return;
      case 'shop-store': setShopStore(el.dataset.store); shopOnlineModal(); return;
      case 'store-open': {
        const lines = st.groceries.items.filter((i) => !i.checked && !i.pantry).map((i) => `• ${i.name}${i.qtyBase != null ? ` — ${fmtAmtForCopy(i)}` : ''}`);
        copyText(lines.join('\n')).catch(() => {});
        const caStore = CA_STORES.find((s) => s.id === el.dataset.store);
        if (caStore) window.open('https://' + caStore.domain, '_blank', 'noopener');
        showToast('📋 List copied — paste it into ' + (caStore?.name || 'your store'));
        return;
      }

      /* pantry (what you already have) */
      case 'pantry-open': pantryModal(); return;
      case 'pantry-add': {
        store.addToPantry(el.dataset.name);
        pantryModal(); render();
        showToast(`🫙 ${el.dataset.name} added to pantry`);
        return;
      }
      case 'pantry-add-input': {
        const v = (document.querySelector('#pantry-in')?.value || '').trim();
        if (!v) return showToast('Type an item first', { tone: 'warn' });
        store.addToPantry(v);
        pantryModal(); render();
        showToast(`🫙 ${v.toLowerCase()} added to pantry`);
        return;
      }
      case 'pantry-remove': {
        store.removeFromPantry(el.dataset.bkey || el.dataset.key);
        pantryModal(); render();
        return;
      }
      case 'pantry-out': {
        store.removeFromPantry(el.dataset.key);
        lastGroceries = ''; syncGroceries();
        showToast('↩ Back on your shopping list');
        render();
        return;
      }
      case 'pantry-absorb': {
        const n = store.absorbCheckedGroceries();
        showToast(n ? `🫙 ${n} item${n === 1 ? '' : 's'} moved to your pantry` : 'Check items off first, then tap this', { tone: n ? '' : 'warn' });
        render();
        return;
      }

      /* budget: price cap per serving */
      case 'budget-open': budgetModal(); return;
      case 'budget-save': {
        const chipVal = document.querySelector('#bud-opts .chip-on')?.dataset.n;
        const custom = parseFloat(document.querySelector('#bud-custom')?.value);
        let on, max;
        if (Number.isFinite(custom) && custom > 0) { on = true; max = custom; }
        else if (chipVal === 'off') { on = false; max = st.settings.budget?.max || 7.5; }
        else if (chipVal) { on = true; max = parseFloat(chipVal); }
        else return showToast('Pick a cap or type your own', { tone: 'warn' });
        store.updateSettings({ budget: { on, max } });
        closeModal();
        showToast(on ? `💰 Price cap: ≤ $${max.toFixed(2)} per serving` : '💰 Price cap off');
        render();
        return;
      }

      /* recipes */
      case 'recipes-seg': seg = el.dataset.seg; huntResults = null; render(); return;
      case 'search-source': st.searchSource = el.dataset.src; store.notify(); runSearch(); return;
      case 'search-cat': st.searchCat = el.dataset.cat; store.notify(); runSearch(); return;
      case 'recipe-open': location.hash = '#/recipe/' + encodeURIComponent(key); detailServ = null; return;
      case 'fav-toggle': {
        e.stopPropagation();
        const r = recipeFromMemory(key) || await getRecipe(key, st.custom, st.favorites);
        if (r) {
          const added = store.toggleFav(r);
          showToast(added ? '💛 Saved to favorites' : 'Removed from favorites');
          if (modalOpen() || currentRoute().name !== 'recipe') render();
          if (currentRoute().name === 'recipe') render();
        }
        return;
      }
      case 'detail-serv': {
        const input = el.parentElement.querySelector('input.serv-input');
        const cur = parseInt(input?.value, 10) || detailServ || st.settings.servings || 4;
        detailServ = clamp(cur + (+el.dataset.d), 1, 24);
        render(); return;
      }
      case 'addplan-open': {
        const r = recipeFromMemory(key) || await getRecipe(key, st.custom, st.favorites);
        if (r) addPlanModal(r);
        return;
      }
      case 'addplan-save': {
        const m = document.querySelector('.modal');
        const r = recipeFromMemory(key) || await getRecipe(key, st.custom, st.favorites);
        if (!r) return;
        store.addMealToPlan(r, m.querySelector('#ap-date').value, m.querySelector('#ap-slot').value, clamp(parseInt(m.querySelector('#ap-serv').value, 10) || 2, 1, 24));
        closeModal();
        showToast('📅 Added to plan — groceries updated');
        return;
      }
      case 'recipe-new': recipeEditorModal(); return;
      case 'recipe-save': {
        const m = document.querySelector('.modal');
        const name = m.querySelector('#re-name').value.trim();
        if (!name) return showToast('Give your recipe a name', { tone: 'warn' });
        const ings = m.querySelector('#re-ings').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => parseIngLine(l));
        const steps = m.querySelector('#re-steps').value.split('\n').map((s) => s.trim()).filter(Boolean);
        const existing = el.dataset.id ? st.custom.find((r) => r.id === el.dataset.id) : null;
        const photoData = m.querySelector('#re-photo-data').value;
        const recipe = {
          ...(existing || {}),
          id: existing?.id, key: existing?.key, source: 'custom',
          name, emoji: null,
          grad: existing?.grad || undefined,
          image: photoData || null,
          servings: clamp(+m.querySelector('#re-serv').value || 4, 1, 24),
          timePrep: +m.querySelector('#re-prep').value || 0,
          timeCook: +m.querySelector('#re-cook').value || 0,
          cuisine: m.querySelector('#re-cuisine').value.trim(),
          category: 'Dinner',
          tags: m.querySelector('#re-tags').value.split(',').map((s2) => s2.trim()).filter(Boolean),
          ingredients: ings, steps,
          dietTags: existing?.dietTags || [],
        };
        if (!recipe.grad) delete recipe.grad; // fall back to automatic gradient from the name
        recipe.kcal = estimateNutrition({ ingredients: ings, servings: recipe.servings }).kcal;
        store.saveCustomRecipe(recipe);
        closeModal();
        showToast(existing ? 'Recipe updated' : '📓 Recipe saved');
        if (seg === 'mine') render();
        return;
      }
      case 'recipe-delete': {
        store.deleteCustomRecipe(el.dataset.id);
        closeModal(); showToast('Recipe deleted'); render();
        return;
      }

      /* ingredient hunt */
      case 'hunt-open': huntModal(); return;
      case 'hunt-run': {
        const chips = [...document.querySelectorAll('#hunt-chips .chip')].map((c) => c.dataset.v);
        if (!chips.length) return showToast('Add at least one ingredient', { tone: 'warn' });
        huntResults = findByIngredients(chips, st.custom, st.favorites, st.bans);
        closeModal(); seg = 'discover'; render();
        return;
      }

      /* cook mode */
      case 'cook-open': {
        const r = recipeFromMemory(key) || await getRecipe(key, st.custom, st.favorites);
        if (r) enterCook(r, detailServ || st.settings.servings || r.servings);
        return;
      }
      case 'cook-exit': exitCook(); return;
      case 'cook-step': el.closest('.cook-step').classList.toggle('done');
        updateCookProgress(); return;
      case 'cook-lock': {
        if (wakeLock) { wakeLock.release(); }
        else { try { wakeLock = await navigator.wakeLock.request('screen'); el.classList.add('on'); } catch { showToast('Screen lock unavailable', { tone: 'warn' }); } }
        return;
      }
      case 'start-timer': showTimer(+el.dataset.secs); showToast('Timer started ⏱'); return;

      /* onboarding */
      case 'onboard-done': {
        const m = document.querySelector('.modal');
        const servings = clamp(parseInt(m.querySelector('#ob-serv').value, 10) || 2, 1, 24);
        const diet = m.querySelector('#ob-diet .chip-on')?.dataset.d || 'all';
        const allergens = [...m.querySelectorAll('#ob-allerg .chip-on')].map((c) => c.dataset.a);
        store.updateSettings({ servings, diet, allergens });
        st.onboarded = true; store.notify();
        closeModal();
        showToast('Welcome aboard! 🎉');
        generateModal(false);
        return;
      }

      /* settings */
      case 'diet-open': dietModal(); return;
      case 'diet-save': {
        const m = document.querySelector('.modal');
        store.updateSettings({
          diet: m.querySelector('#dm-diet .chip-on')?.dataset.d || 'all',
          allergens: [...m.querySelectorAll('#dm-allerg .chip-on')].map((c) => c.dataset.a),
          dislikes: m.querySelector('#dm-dislikes').value.split('\n').map((s2) => s2.trim().toLowerCase()).filter(Boolean),
        });
        closeModal(); showToast('Preferences saved'); render(); return;
      }
      case 'staples-open': staplesModal(); return;
      case 'staples-save': {
        const m = document.querySelector('.modal');
        store.updateSettings({
          staples: m.querySelector('#staples-txt').value.split('\n').map((s2) => s2.trim().toLowerCase()).filter(Boolean),
          hideStaples: m.querySelector('#staples-hide').checked,
        });
        lastGroceries = ''; syncGroceries();
        closeModal(); showToast('Staples saved'); render(); return;
      }
      case 'units-cycle': store.updateSettings({ units: st.settings.units === 'us' ? 'metric' : 'us' }); showToast('Units: ' + (st.settings.units === 'us' ? 'metric' : 'US')); return;
      case 'servings-open': servingsModal(); return;
      case 'servings-save': {
        const v = clamp(parseInt(document.querySelector('#sv-serv').value, 10) || 2, 1, 24);
        store.updateSettings({ servings: v });
        closeModal(); showToast('Default servings: ' + v); render(); return;
      }
      case 'time-open': timeModal(); return;
      case 'time-save': {
        const v = +document.querySelector('#tm-opts .chip-on')?.dataset.n || 0;
        store.updateSettings({ maxTime: v });
        closeModal(); render(); return;
      }
      case 'waste-open': wasteModal(); return;
      case 'dark-toggle': store.updateSettings({ dark: !st.settings.dark }); render(); return;
      case 'cache-refresh': {
        showToast('Checking open sources for new recipes…');
        try {
          const res = await seedCache();
          store.notify();
          showToast(res.mealdb + res.dummyjson ? `📚 +${res.mealdb + res.dummyjson} new recipes merged in (this session)` : 'You already have every published recipe bundled');
        } catch { showToast('Could not reach sources — are you online?', { tone: 'warn' }); }
        render(); return;
      }
      case 'reminder-open': reminderModal(); return;
      case 'reminder-save': {
        const m = document.querySelector('.modal');
        const enabled = m.querySelector('#rem-on').checked;
        if (enabled && 'Notification' in window && Notification.permission !== 'granted') {
          try { await Notification.requestPermission(); } catch { /* ignore */ }
        }
        store.updateSettings({ reminder: { enabled, day: +m.querySelector('#rem-day').value, time: m.querySelector('#rem-time').value || '10:00' } });
        closeModal(); showToast(enabled ? '🔔 Reminder set' : 'Reminder off'); render(); return;
      }
      case 'reminder-test': {
        if ('Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch { /* ignore */ } }
        notifyUser('OpenPlate test 🔔', 'This is what your meal-plan reminder looks like.');
        return;
      }
      case 'stores-open': storesModal(); return;
      case 'stores-add': {
        const m = document.querySelector('.modal');
        const div = document.createElement('div');
        div.className = 'row-2';
        div.innerHTML = '<input class="input sl-name" placeholder="Store"><input class="input sl-url" placeholder="https://…">';
        m.querySelector('[data-action="stores-add"]').before(div);
        return;
      }
      case 'stores-save': {
        const m = document.querySelector('.modal');
        const prefs = [...m.querySelectorAll('[data-pref-store]:checked')].map((c) => c.dataset.prefStore);
        const rows = [...m.querySelectorAll('[data-link-row], .row-2')].filter((r) => r.querySelector('.sl-name'));
        const links = rows.map((r) => ({ name: r.querySelector('.sl-name').value.trim(), url: r.querySelector('.sl-url').value.trim() })).filter((l) => l.name && l.url);
        store.updateSettings({ preferredStores: prefs, storeLinks: links });
        closeModal(); showToast('🛍️ Stores saved'); return;
      }
      case 'waste-save': {
        const n = +document.querySelector('#wf-opts .chip-on')?.dataset.n;
        if (n) store.updateSettings({ wasteFactor: n });
        closeModal(); render(); return;
      }
      case 'data-export': download('openplate-backup-' + todayStr() + '.json', JSON.stringify(store.getState(), null, 2)); showToast('📤 Backup downloaded'); return;
      case 'data-import': document.getElementById('import-file').click(); return;
      case 'data-reset': confirmModal('Reset everything?', 'Plans, favorites, custom recipes and impact history will be erased from this device. This cannot be undone.', 'Erase all data', 'data-reset-run'); return;
      case 'data-reset-run': store.resetAll(); lastGroceries = ''; closeModal(); location.hash = '#/plan'; showToast('Fresh start 🌱'); render(); onboardingModal(); return;
      case 'about-open': aboutModal(); return;
      case 'recipe-editor-edit': recipeEditorModal(recipeFromMemory(key)); return;

      /* shadowban: hide recipes / ingredients / food types */
      case 'hide-open': {
        const r = recipeFromMemory(key) || await getRecipe(key, st.custom, st.favorites);
        if (r) hideModal(r);
        return;
      }
      case 'hide-run': {
        const dur = document.querySelector('#hd-dur .chip-on')?.dataset.dur || 'week';
        store.addBan(el.dataset.type, el.dataset.bkey, el.dataset.name || '', dur === 'forever');
        closeModal();
        showToast(dur === 'forever' ? 'Hidden permanently — undo in Settings' : 'Hidden for 7 days — undo in Settings');
        if (currentRoute().name === 'recipe') location.hash = '#/recipes';
        huntResults = null;
        seg = 'discover'; query = ''; searchResults = null;
        runSearch();
        return;
      }
      case 'bans-open': bansModal(); return;
      case 'ban-remove': {
        store.removeBan(el.dataset.type, el.dataset.bkey);
        bansModal(); render(); showToast('Un-hidden — it can show up again');
        return;
      }
      case 'ban-add-ing': {
        const v = (document.querySelector('#ban-ing')?.value || '').trim().toLowerCase();
        if (!v) return showToast('Type an ingredient first', { tone: 'warn' });
        const perm = document.querySelector('#bd-dur .chip-on')?.dataset.dur === 'forever';
        store.addBan('ingredients', v, '', perm);
        bansModal(); render(); showToast(`“${v}” hidden ${perm ? 'permanently' : 'for 7 days'}`);
        return;
      }
      case 'ban-add-cat': {
        const v = (document.querySelector('#ban-cat')?.value || '').trim().toLowerCase();
        if (!v) return showToast('Type a food type first', { tone: 'warn' });
        const perm2 = document.querySelector('#bd-dur .chip-on')?.dataset.dur === 'forever';
        store.addBan('categories', v, '', perm2);
        bansModal(); render(); showToast(`All “${v}” recipes hidden ${perm2 ? 'permanently' : 'for 7 days'}`);
        return;
      }
    }
  }

  /* generic chip rows inside modals (single-select) */
  const chip = t.closest('.modal .chip[data-n], .modal .chip[data-d], .modal .chip[data-a]');
  if (chip) {
    const row = chip.parentElement;
    if (row.id !== 'dm-allerg' && row.id !== 'ob-allerg') row.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-on'));
    chip.classList.toggle('chip-on', !chip.classList.contains('chip-on'));
    if (row.id !== 'dm-allerg' && row.id !== 'ob-allerg') chip.classList.add('chip-on');
  }
  /* steppers (modals + pages): −/+ adjust the sibling number input */
  const step = t.closest('.step-btn[data-step]');
  if (step && !step.dataset.action) {
    const input = step.parentElement.querySelector('input.serv-input');
    if (input) {
      const min = +(step.dataset.min || 1), max = +(step.dataset.max || 24);
      input.value = clamp((parseInt(input.value, 10) || 1) + (+step.dataset.step), min, max);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});

/* ---------------- plan generation (fresh or append) ---------------- */
function runPlanGenerate(st, mode2) {
  const m = document.querySelector('.modal');
  const days = clamp(parseInt(m.querySelector('#gw-days').value, 10) || 5, 1, 7);
  const slots = [...m.querySelectorAll('#gw-slots .chip-on')].map((c) => c.dataset.slot);
  if (!slots.length) return showToast('Pick at least one meal per day', { tone: 'warn' });
  const servings = clamp(parseInt(m.querySelector('#gw-serv').value, 10) || st.settings.servings || 2, 1, 24);
  const planMode = m.querySelector('#gw-mode .chip-on')?.dataset.m || st.settings.planMode || 'standard';
  store.updateSettings({ planMode }); // remember the choice for next time / per-day planning
  const startSel = m.querySelector('#gw-start').value;
  const startOffset = startSel === 'nextmonday' ? ((1 - new Date().getDay() + 7) % 7) || 7 : +startSel || 0;
  const excludeKeys = mode2 === 'append' ? [] : (st.plan?.meals.map((x) => x.recipe.key) || []);
  const recentKeys = st.history.slice(0, 2).flatMap((h) => h.meals.map((x) => x.recipe.key));
  const preferKeys = st.favorites.slice(0, 4).map((f) => f.origKey);
  const meals = generatePlan({ days, slots, servings, state: st, excludeKeys, recentKeys, preferKeys, mode: planMode, have: store.haveList() });
  if (!meals.length) { showToast('No recipes match your filters — loosen them in Settings', { tone: 'warn' }); return; }
  const start = addDays(todayStr(), startOffset);
  if (mode2 === 'append' && st.plan) {
    // fill free (date, slot) pairs first, then extend past the current horizon
    const taken = new Set(st.plan.meals.map((x) => x.date + '|' + x.slot));
    let freeDay = 0;
    for (const meal of meals) {
      let placed = false;
      for (let d = 0; d < 21 && !placed; d++) {
        const date = addDays(start, d);
        for (const slot of slots) {
          if (!taken.has(date + '|' + slot)) {
            meal.date = date; meal.slot = slot;
            taken.add(date + '|' + slot);
            placed = true;
            break;
          }
        }
      }
      if (!placed) { meal.date = addDays(start, 21 + freeDay++); meal.slot = slots[0]; }
    }
    store.addMealsToPlan(meals);
    showToast(`＋ ${meals.length} meals added — free slots filled`);
  } else {
    meals.forEach((meal, i) => { meal.date = addDays(start, Math.floor(i / slots.length)); });
    store.newPlan(meals, start);
    showToast(`✨ ${meals.length} meals planned — grocery list updated`);
  }
  closeModal();
  location.hash = '#/plan';
}
function fmtAmtForCopy(i) {
  return fmtAmount(i.qtyBase, i.unit, store.getState().settings.units);
}
function updateCookProgress() {
  const steps = $$('.cook-step');
  const done = steps.filter((s) => s.classList.contains('done')).length;
  const bar = document.getElementById('cook-progress-bar');
  if (bar && steps.length) bar.style.width = Math.round((done / steps.length) * 100) + '%';
}

/* search form + instant typing */
document.addEventListener('submit', (e) => {
  if (e.target.id === 'search-form') {
    e.preventDefault();
    query = document.getElementById('search-input').value;
    st0(); runSearch();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search-input') {
    query = e.target.value;
    instantSearch();
  }
});
function st0() { store.getState().searchCat = ''; store.getState().searchSource = 'all'; }
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('cook-root').classList.contains('open')) exitCook();
    else if (modalOpen()) closeModal();
  }
});
document.addEventListener('change', (e) => {
  const src = e.target.closest('[data-action-src]');
  if (src) {
    const st = store.getState();
    st.settings.sources[src.dataset.actionSrc] = src.checked;
    store.notify();
    showToast('Source ' + (src.checked ? 'enabled' : 'disabled'));
  }
  if (e.target.id === 'import-file' && e.target.files[0]) {
    const fr = new FileReader();
    fr.onload = () => {
      try { store.importData(fr.result); showToast('📥 Backup restored'); location.hash = '#/plan'; render(); }
      catch { showToast('Invalid backup file', { tone: 'warn' }); }
    };
    fr.readAsText(e.target.files[0]);
  }
});
/* ingredient checklist on detail page */
document.addEventListener('click', (e) => {
  const ing = e.target.closest('[data-action="ing-check"]');
  if (ing) { ing.classList.toggle('on'); ing.closest('.ing-row').classList.toggle('have'); }
});
/* typed servings on the recipe detail page re-scale ingredients live */
document.addEventListener('change', (e) => {
  if (e.target.id === 'detail-serv') {
    detailServ = clamp(parseInt(e.target.value, 10) || 4, 1, 24);
    render();
  }
});

/* helper: parse "2 lb chicken thighs, note" from the recipe editor */
function parseIngLine(line) {
  const { qty, unit, note } = parseQty(line);
  if (qty != null && unit) {
    const rest = line.replace(/^[\d\s\/\.½⅓⅔¼¾]+\s*[a-zA-Z]+\.?\s+/, '').trim();
    const [namePart, ...notes] = rest.split(',');
    return { name: (namePart || rest).toLowerCase().trim(), qty, unit, note: notes.join(',').trim() };
  }
  const [namePart, ...notes] = line.split(',');
  return { name: namePart.trim().toLowerCase(), qty: null, unit: null, note: notes.join(',').trim() };
}

/* go */
window.addEventListener('hashchange', render);
boot();
