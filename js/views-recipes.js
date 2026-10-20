/* OpenPlate — views-recipes.js : Recipes tab (Discover / Favorites / Mine), detail, cook mode */
'use strict';

import { esc, fmtTime, timeTotal, fmtClock, findTimers, clamp, AISLES, photoFromFile, todayStr, addDays } from './util.js';
import { getState } from './store.js';
import { SOURCES, categories, sourceCounts, searchRecipes } from './sources.js';
import { estimateNutrition } from './nutrition.js';
import { estimateRecipeCost, fmtCAD } from './prices.js';
import { recipeCard, thumb, emptyState, SOURCE_BADGE, openModal, closeModal, showToast, stepperHtml, SLOT_LABEL, gradFor } from './views-core.js';

/* ---------- Recipes tab ---------- */
export function viewRecipes(seg = 'discover', query = '', results = null, huntResults = null) {
  const st = getState();
  const cats = categories();
  const counts = sourceCounts();
  let body = '';

  if (seg === 'favorites') {
    const favs = st.favorites;
    body = favs.length
      ? `<div class="rgrid">${favs.map((r) => recipeCard(r)).join('')}</div>`
      : emptyState('💛', 'No favorites yet', 'Tap the ♡ on any recipe to keep it here — favorites sync into your plan generator and work offline.', '');
  } else if (seg === 'mine') {
    body = st.custom.length
      ? `<div class="row-gap"><button class="btn btn-primary" data-action="recipe-new">+ Create a recipe</button></div><div class="rgrid">${st.custom.map((r) => recipeCard(r)).join('')}</div>`
      : emptyState('📓', 'Your recipe box is empty', 'Save family classics with your own ingredients and steps. Your recipes join the plan generator and grocery list like any other.', `
          <button class="btn btn-primary" data-action="recipe-new">+ Create your first recipe</button>`);
  } else {
    const list = results;
    body = `
      <form class="searchbar" id="search-form" role="search">
        <input id="search-input" class="input" type="search" placeholder="Search all sources — “chicken”, “curry”, “salmon”…" value="${esc(query)}" autocomplete="off" aria-label="Search recipes">
        <button class="btn btn-primary btn-sm" type="submit">Search</button>
      </form>
      <div class="seg-scroll" role="tablist" aria-label="Filter by source">
        ${['all', 'local', 'mealdb', 'dummyjson'].map((s) => `<button class="chip ${st.searchSource === s ? 'chip-on' : ''}" data-action="search-source" data-src="${s}" role="tab" aria-selected="${st.searchSource === s}">${s === 'all' ? 'All sources' : esc(SOURCES[s]?.label || s)}</button>`).join('')}
      </div>
      <div class="seg-scroll">
        <button class="chip ${st.searchCat === '' ? 'chip-on' : ''}" data-action="search-cat" data-cat="">Everything</button>
        ${cats.slice(0, 24).map((c) => `<button class="chip ${st.searchCat === c ? 'chip-on' : ''}" data-action="search-cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
        <button class="chip chip-cta" data-action="hunt-open">🧑‍🍳 Cook with what I have</button>
      </div>
      <p class="hint">${counts.local + counts.mealdb + counts.dummyjson} recipes bundled offline with photos — no internet needed. Search is instant &amp; typo-tolerant.</p>
      <div id="search-results">${searchResultsArea(list, huntResults)}</div>
      `;
  }
  return `
  <section class="pad">
    <div class="seg-nav" role="tablist">
      ${['discover', 'favorites', 'mine'].map((s) => `<button class="seg ${seg === s ? 'on' : ''}" data-action="recipes-seg" data-seg="${s}" role="tab" aria-selected="${seg === s}">${{ discover: 'Discover', favorites: `Favorites${st.favorites.length ? ' · ' + st.favorites.length : ''}`, mine: 'Mine' }[s]}</button>`).join('')}
    </div>
    ${body}
  </section>`;
}

/* results area — rendered separately on every keystroke (instant search)
   without touching the search input, so focus and cursor stay put */
export function searchResultsArea(list, huntResults = null) {
  const bansHidden = (list && list.bansHidden) || (huntResults && huntResults.bansHidden) || 0;
  return `
    ${bansHidden ? `<p class="hint">${bansHidden} result${bansHidden === 1 ? '' : 's'} hidden by your block list (Settings → Hidden &amp; blocked).</p>` : ''}
    ${huntResults ? `
      <h3 class="sect-title">Cook with what you have</h3>
      <div class="rgrid">${huntResults.map((h) => recipeCard(h.recipe, {
        extra: `<div class="have-bar"><span style="width:${Math.round((h.have / h.total) * 100)}%"></span></div><small class="have-txt">Have ${h.have}/${h.total} · missing: ${esc(h.missing.slice(0, 3).join(', ') || 'nothing!')}</small>`,
      })).join('')}</div>` : ''}
    ${list === null ? `<div class="loading">Loading recipes…</div>` :
      list.length ? `<div class="rgrid">${list.map((r) => recipeCard(r)).join('')}</div>` :
        emptyState('🔍', 'Nothing found', 'Try fewer words or a different spelling — search tolerates typos. You can also clear the category filters above.')}`;
}

/* ---------- recipe detail ---------- */
export function viewRecipeDetail(r, servings = null) {
  const st = getState();
  const serv = servings || st.settings.servings || r.servings || 4;
  const scale = serv / (r.servings || 4);
  const fav = st.favorites.some((f) => f.origKey === r.key);
  const t = timeTotal(r);
  const n = r.kcal ? { kcal: r.kcal } : estimateNutrition({ ingredients: r.ingredients, servings: r.servings || 4 });
  const allergenLabels = { dairy: 'Dairy', eggs: 'Eggs', gluten: 'Gluten', peanuts: 'Peanuts', treenuts: 'Tree nuts', sesame: 'Sesame', soy: 'Soy', shellfish: 'Shellfish', fish: 'Fish' };
  return `
  <section class="detail">
    <div class="detail-hero">${thumb(r, 'thumb-hero')}
      <button class="icon-btn back" data-action="nav-back" aria-label="Back">←</button>
      <button class="heart heart-hero ${fav ? 'on' : ''}" data-action="fav-toggle" data-key="${esc(r.key)}" aria-label="Toggle favorite">${fav ? '♥' : '♡'}</button>
    </div>
    <div class="pad detail-body">
      <div class="rcard-meta">${SOURCE_BADGE[r.source] || ''}${r.cuisine ? `<span class="meta-chip">🌍 ${esc(r.cuisine)}</span>` : ''}${t ? `<span class="meta-chip">⏱ ${fmtTime(t)}</span>` : ''}${r.rating ? `<span class="meta-chip">★ ${r.rating}</span>` : ''}</div>
      <h1 class="detail-title">${esc(r.name)}</h1>
      ${(r.allergens || []).length ? `<p class="hint">Contains: ${(r.allergens || []).map((a) => allergenLabels[a] || a).join(' · ')}</p>` : ''}
      <p class="hint">${r.kcal ? 'Calories' : 'Estimated nutrition'} per serving: <strong>${n.kcal || '—'} kcal</strong>${n.protein ? ` · ${n.protein}g protein · ${n.carb}g carbs · ${n.fat}g fat` : ''}</p>
      ${(() => {
        const cost = estimateRecipeCost(r);
        const overCap = st.settings.budget?.on && cost.perServing > st.settings.budget.max;
        return `<p class="hint">Estimated cost: <strong>≈ ${fmtCAD(cost.perServing)} per serving</strong> · ≈ ${fmtCAD(cost.total)} per recipe <small>(CAD estimate — actual prices vary by store)${overCap ? ' · 💎 over your price cap' : ''}</small></p>`;
      })()}

      <div class="serv-row">
        <div class="serv-wrap">
          <span class="serv-label">Servings</span>
          ${stepperHtml('detail-serv', serv, { min: 1, max: 24, action: 'detail-serv' })}
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" data-action="cook-open" data-key="${esc(r.key)}">👨‍🍳 Cook this</button>
          <button class="btn btn-secondary" data-action="addplan-open" data-key="${esc(r.key)}">+ Plan</button>
        </div>
      </div>

      <h2 class="sect-title">Ingredients <span class="sect-sub">for ${serv}</span></h2>
      <ul class="ing-list" id="ing-list">
        ${(r.ingredients || []).map((ing, i) => {
          const o = typeof ing === 'string' ? { name: ing, qty: null, unit: null } : ing;
          const amt = o.qty != null ? `${fmtScale(o.qty, scale)}${o.unit ? ' ' + o.unit : ''}` : '';
          return `<li class="ing-row" data-ing="${i}"><button class="check check-sm" aria-label="Have ingredient" data-action="ing-check"></button><span class="ing-amt">${esc(amt)}</span> <span class="ing-name">${esc(o.name)}</span>${o.note ? `<small class="ing-note">${esc(o.note)}</small>` : ''}</li>`;
        }).join('')}
      </ul>

      <h2 class="sect-title">Steps</h2>
      <ol class="steps-list">
        ${(r.steps || []).map((s, i) => {
          const timers = findTimers(s);
          return `<li class="step"><p>${esc(s)}</p>${timers.map((secs, j) => `<button class="chip chip-timer" data-action="start-timer" data-secs="${secs}">⏱ ${fmtClock(secs)}</button>`).join('')}</li>`;
        }).join('')}
      </ol>
      ${r.youtube ? `<a class="btn btn-ghost" href="${esc(r.youtube)}" target="_blank" rel="noopener">▶ Watch on YouTube</a>` : ''}
      ${r.sourceUrl ? `<a class="btn btn-ghost" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">View on ${esc(SOURCES[r.source]?.label || 'source')} ↗</a>` : ''}
      <button class="btn btn-ghost btn-sm" data-action="hide-open" data-key="${esc(r.key)}">Hide this recipe or ingredients…</button>
      <p class="hint center">${r.source === 'local' ? 'Built-in open recipe (CC0).' : r.source === 'mealdb' ? 'From TheMealDB — an open, community-built recipe database.' : r.source === 'dummyjson' ? 'From the open DummyJSON recipe dataset.' : r.source === 'custom' ? 'Your recipe — stored privately on this device.' : 'Saved favorite.'}</p>
    </div>
  </section>`;
}
function fmtScale(q, scale) {
  if (scale === 1) return String(q);
  const v = q * scale;
  if (Math.abs(v - Math.round(v)) < 0.05) return String(Math.round(v));
  return (Math.round(v * 4) / 4).toString();
}

/* add to plan modal */
export function addPlanModal(r, preset = {}) {
  const st = getState();
  const days = [];
  for (let i = 0; i < 14; i++) days.push(addDays(todayStr(), i));
  const presetDate = preset.date && days.includes(preset.date) ? preset.date : days[0];
  const presetSlot = preset.slot || 'dinner';
  openModal(`
    <div class="sheet-head"><h3>Add to meal plan</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">${esc(r.name)}</p>
    <div class="field"><label>Cook on</label>
      <select id="ap-date" class="select">${days.map((d, i) => `<option value="${d}" ${d === presetDate ? 'selected' : ''}>${i === 0 ? 'Today' : new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Meal</label>
      <select id="ap-slot" class="select">
        <option value="breakfast" ${presetSlot === 'breakfast' ? 'selected' : ''}>🌅 Breakfast</option>
        <option value="lunch" ${presetSlot === 'lunch' ? 'selected' : ''}>☀️ Lunch</option>
        <option value="dinner" ${presetSlot === 'dinner' ? 'selected' : ''}>🌙 Dinner</option>
      </select>
    </div>
    <div class="field"><label>Servings — type any number, e.g. 5</label>
      ${stepperHtml('ap-serv', st.settings.servings || 2, { min: 1, max: 24 })}
    </div>
    <button class="btn btn-primary" data-action="addplan-save" data-key="${esc(r.key)}">Add to plan</button>
    <p class="hint">Ingredients will be added to your grocery list automatically${st.settings.budget?.on ? ` · this recipe estimates ≈ ${fmtCAD(estimateRecipeCost(r).perServing)}/serving` : ''}.</p>`);
}

/* ---------- Cook Mode ---------- */
export function renderCookMode(r, servings) {
  const root = document.getElementById('cook-root');
  const scale = servings / (r.servings || 4);
  root.innerHTML = `
    <div class="cook" role="dialog" aria-label="Cook mode">
      <header class="cook-head">
        <button class="icon-btn" data-action="cook-exit" aria-label="Exit cook mode">✕</button>
        <div class="cook-title"><strong>${esc(r.name)}</strong><span>${servings} servings · ${fmtTime(timeTotal(r))}</span></div>
        <button class="icon-btn" data-action="cook-lock" id="wakelock-btn" aria-label="Keep screen on">📱</button>
      </header>
      <div class="cook-progress"><div id="cook-progress-bar" style="width:0%"></div></div>
      <div class="cook-body">
        <details class="cook-ings" open>
          <summary>Ingredients (${(r.ingredients || []).length})</summary>
          <ul>${(r.ingredients || []).map((ing) => {
            const o = typeof ing === 'string' ? { name: ing, qty: null, unit: null } : ing;
            const amt = o.qty != null ? `${fmtScale(o.qty, scale)}${o.unit ? ' ' + o.unit : ''}` : '';
            return `<li><strong>${esc(amt)}</strong> ${esc(o.name)}${o.note ? ` <small>${esc(o.note)}</small>` : ''}</li>`;
          }).join('')}</ul>
        </details>
        <ol class="cook-steps">
          ${(r.steps || []).map((s, i) => {
            const timers = findTimers(s);
            return `<li class="cook-step" data-step="${i}">
              <button class="cook-check" data-action="cook-step" aria-label="Mark step done"></button>
              <div><p>${esc(s)}</p>
              ${timers.map((secs) => `<button class="chip chip-timer" data-action="start-timer" data-secs="${secs}">⏱ ${fmtClock(secs)} timer</button>`).join('')}
              </div></li>`;
          }).join('')}
        </ol>
        <div id="timer-bar"></div>
      </div>
    </div>`;
  root.classList.add('open');
}
export function closeCookMode() {
  const root = document.getElementById('cook-root');
  root.classList.remove('open');
  root.innerHTML = '';
}
export function showTimer(secs) {
  const bar = document.getElementById('timer-bar');
  if (!bar) return null;
  const chip = document.createElement('div');
  chip.className = 'timer-chip';
  chip.innerHTML = `<span class="timer-clock">⏱ ${fmtClock(secs)}</span><button class="icon-btn" aria-label="Stop timer">✕</button>`;
  bar.appendChild(chip);
  const clock = chip.querySelector('.timer-clock');
  let left = secs;
  const iv = setInterval(() => {
    left--;
    clock.textContent = '⏱ ' + fmtClock(Math.max(0, left));
    if (left <= 0) {
      clearInterval(iv);
      chip.classList.add('ringing');
      clock.textContent = '🔔 Time is up!';
      beep();
      setTimeout(() => chip.remove(), 15000);
    }
  }, 1000);
  chip.querySelector('button').addEventListener('click', () => { clearInterval(iv); chip.remove(); });
  return iv;
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.32);
    });
  } catch { /* silent */ }
}

/* ---------- create/edit recipe ---------- */
export function recipeEditorModal(existing = null) {
  const r = existing || { name: '', image: null, servings: 4, timePrep: 15, timeCook: 20, cuisine: '', tags: [], ingredients: [{ name: '', qty: '', unit: '', note: '' }], steps: [''] };
  const [ga, gb] = r.grad || gradFor(r.name || '?');
  openModal(`
    <div class="sheet-head"><h3>${existing ? 'Edit recipe' : 'New recipe'}</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <div class="field"><label>Photo</label>
      <div class="photo-pick">
        <div class="photo-prev ${r.image ? '' : 'none'}" id="re-photo-prev" style="${r.image ? '' : `background:linear-gradient(135deg,${ga},${gb})`}">${r.image ? `<img src="${esc(r.image)}" alt="Recipe photo">` : `<span>${esc((r.name || '?').charAt(0).toUpperCase())}</span>`}</div>
        <div class="photo-btns">
          <label class="btn btn-secondary btn-sm" for="re-photo">Add / change photo</label>
          <input type="file" id="re-photo" accept="image/*" hidden>
          <button type="button" class="btn btn-ghost btn-sm" id="re-photo-clear" ${r.image ? '' : 'hidden'}>Remove photo</button>
          <input type="hidden" id="re-photo-data" value="${r.image && String(r.image).startsWith('data:') ? esc(r.image) : ''}">
          <small class="hint">Real photos beat icons: pick one from your camera roll. It is compressed on this device and never leaves it.</small>
        </div>
      </div>
    </div>
    <div class="field"><label>Name</label><input id="re-name" class="input" value="${esc(r.name)}" placeholder="Grandma's Sunday Sauce"></div>
    <div class="row-3">
      <div class="field"><label>Servings</label><input id="re-serv" class="input" type="number" inputmode="numeric" min="1" max="24" value="${r.servings || 4}"></div>
      <div class="field"><label>Prep min</label><input id="re-prep" class="input" type="number" min="0" value="${r.timePrep ?? 15}"></div>
      <div class="field"><label>Cook min</label><input id="re-cook" class="input" type="number" min="0" value="${r.timeCook ?? 20}"></div>
    </div>
    <div class="row-2">
      <div class="field"><label>Cuisine</label><input id="re-cuisine" class="input" value="${esc(r.cuisine || '')}" placeholder="Italian"></div>
      <div class="field"><label>Tags (comma)</label><input id="re-tags" class="input" value="${esc((r.tags || []).join(', '))}" placeholder="Comfort, Weeknight"></div>
    </div>
    <div class="field"><label>Ingredients — one per line: <code>qty unit name, note</code></label>
      <textarea id="re-ings" class="input" rows="6" placeholder="2 lb chicken thighs, bone-in&#10;1 cup rice&#10;2 cloves garlic, minced">${esc((r.ingredients || []).map((i) => typeof i === 'string' ? i : [i.qty, i.unit, i.name, i.note].filter(Boolean).join(' ')).join('\n'))}</textarea>
    </div>
    <div class="field"><label>Steps — one per line</label>
      <textarea id="re-steps" class="input" rows="6" placeholder="Brown the meat for 8 minutes.&#10;Simmer for 20 minutes.">${esc((r.steps || []).join('\n'))}</textarea>
    </div>
    <button class="btn btn-primary" data-action="recipe-save" data-id="${existing ? esc(existing.id) : ''}">Save recipe</button>
    ${existing ? `<button class="btn btn-ghost danger" data-action="recipe-delete" data-id="${esc(existing.id)}">Delete recipe</button>` : ''}`,
    { sheet: true, onMount: (el) => {
      const fileInput = el.querySelector('#re-photo');
      const prev = el.querySelector('#re-photo-prev');
      const dataInput = el.querySelector('#re-photo-data');
      const clearBtn = el.querySelector('#re-photo-clear');
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        try {
          const dataUrl = await photoFromFile(f);
          dataInput.value = dataUrl;
          prev.classList.remove('none');
          prev.style.background = '';
          prev.innerHTML = `<img src="${dataUrl}" alt="Recipe photo">`;
          clearBtn.hidden = false;
        } catch { showToast('Could not read that image', { tone: 'warn' }); }
      });
      clearBtn.addEventListener('click', () => {
        dataInput.value = '';
        fileInput.value = '';
        prev.classList.add('none');
        prev.style.background = `linear-gradient(135deg,${ga},${gb})`;
        prev.innerHTML = `<span>${esc((el.querySelector('#re-name').value || '?').charAt(0).toUpperCase())}</span>`;
        clearBtn.hidden = true;
      });
    } });
}

/* ---------- hide (shadowban) modal ---------- */
export function hideModal(r) {
  const ings = [...new Set((r.ingredients || []).map((i) => (typeof i === 'string' ? i : i.name).toLowerCase().trim()).filter(Boolean))].slice(0, 10);
  openModal(`
    <div class="sheet-head"><h3>Hide from OpenPlate</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Hidden items vanish from Discover, search and the plan generator. Bans expire after <strong>7 days</strong> unless you choose forever. Manage everything in Settings → Hidden &amp; blocked.</p>
    <div class="field"><label>Duration</label>
      <div class="chip-row" id="hd-dur">
        <button type="button" class="chip chip-on" data-dur="week">For a week</button>
        <button type="button" class="chip" data-dur="forever">Forever</button>
      </div>
    </div>
    <div class="btn-col">
      <button class="btn btn-danger" data-action="hide-run" data-type="recipes" data-bkey="${esc(r.key)}" data-name="${esc(r.name)}">Hide this recipe (“${esc(r.name)}”)</button>
      ${r.category ? `<button class="btn btn-secondary" data-action="hide-run" data-type="categories" data-bkey="${esc(String(r.category).toLowerCase())}" data-name="${esc(r.category)}">Hide all “${esc(r.category)}” recipes</button>` : ''}
      ${(r.tags || []).slice(0, 3).map((t) => `<button class="btn btn-secondary" data-action="hide-run" data-type="categories" data-bkey="${esc(String(t).toLowerCase())}" data-name="${esc(t)}">Hide all “${esc(t)}” recipes</button>`).join('')}
    </div>
    ${ings.length ? `<div class="field"><label>Or hide recipes containing an ingredient:</label>
      <div class="chip-row">${ings.map((i) => `<button type="button" class="chip" data-action="hide-run" data-type="ingredients" data-bkey="${esc(i)}" data-name="${esc(i)}">“${esc(i)}”</button>`).join('')}</div>
    </div>` : ''}`,
    { onMount: (el) => {
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('#hd-dur .chip');
        if (!chip) return;
        el.querySelectorAll('#hd-dur .chip').forEach((c) => c.classList.remove('chip-on'));
        chip.classList.add('chip-on');
      });
    } });
}

/* ---------- manual meal picker ---------- */
let pickerCtx = {}; // { date, slot } when opened for a specific day
export function mealPickerModal(ctx = {}) {
  pickerCtx = ctx || {};
  const dayLabel = pickerCtx.date
    ? new Date(pickerCtx.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : null;
  openModal(`
    <div class="sheet-head"><h3>${dayLabel ? `Add a meal — ${esc(dayLabel)}` : 'Add a meal manually'}</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Search every bundled recipe${dayLabel ? `, then pick the meal slot for ${esc(dayLabel)}` : ', then pick a day, meal and serving count'}. Results appear as you type — typos welcome.</p>
    <input id="mp-q" class="input" type="search" placeholder="Search all recipes…" autocomplete="off" aria-label="Search recipes">
    <div id="mp-results" class="mp-list"><div class="loading">Start typing — e.g. “chiken” finds chicken too.</div></div>`,
    { onMount: (el) => {
      const input = el.querySelector('#mp-q');
      const box = el.querySelector('#mp-results');
      const run = debounceSearch(() => {
        const q = input.value.trim();
        if (!q) { box.innerHTML = '<div class="loading">Start typing — e.g. “chiken” finds chicken too.</div>'; return; }
        const st = getState();
        const res = searchRecipes({ q, bans: st.bans, custom: st.custom, favorites: st.favorites });
        box.innerHTML = res.length
          ? res.slice(0, 14).map((r) => `
            <button type="button" class="mp-row" data-action="pick-meal" data-key="${esc(r.key)}">
              ${thumb(r, 'thumb-sm')}
              <span class="mp-name">${esc(r.name)}</span>
              <span class="mp-src">${esc(SOURCES[r.source]?.short || 'Yours')} · ≈ ${fmtCAD(estimateRecipeCost(r).perServing)}</span>
            </button>`).join('')
          : '<div class="loading">Nothing found — try another spelling.</div>';
      }, 40);
      input.addEventListener('input', run);
      setTimeout(() => input.focus(), 150);
    } });
}
export function pickerPreset() { const p = pickerCtx; pickerCtx = {}; return p || {}; }
function debounceSearch(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ---------- generate plan wizard (fully customizable) ---------- */
const MODE_HINTS = {
  standard: 'Variety first — rotates proteins and sources like a chef would.',
  pantry: 'Ranks recipes by how much you already have at home (pantry + staples).',
  mixed: 'Balances variety with your wallet: prefers recipes that cost the least in new groceries.',
};
export function generateModal(hasPlan = false) {
  const st = getState();
  const mode = st.settings.planMode || 'standard';
  const budget = st.settings.budget;
  const nPantry = Object.keys(st.pantry?.items || {}).length;
  openModal(`
    <div class="sheet-head"><h3>Customize your meal plan</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Tuned to your diet (${esc(st.settings.diet)})${st.settings.allergens.length ? `, free of ${st.settings.allergens.length} allergen groups` : ''}${st.settings.dislikes.length ? `, no ${st.settings.dislikes.join(', ')}` : ''}. Change anytime in Settings.</p>
    <div class="field"><label>Days to plan</label>
      ${stepperHtml('gw-days', 5, { min: 1, max: 7 })}
      <small class="hint">Planning day by day? Set 1 day here — or tap the ＋ next to any day in your plan.</small>
    </div>
    <div class="field"><label>Meals per day</label>
      <div class="chip-row" id="gw-slots">
        <button type="button" class="chip" data-slot="breakfast">🌅 Breakfast</button>
        <button type="button" class="chip" data-slot="lunch">☀️ Lunch</button>
        <button type="button" class="chip chip-on" data-slot="dinner">🌙 Dinner</button>
      </div>
      <small class="hint">Pick any combination — e.g. breakfast + dinner, or all three.</small>
    </div>
    <div class="field"><label>Servings per meal — type any number, e.g. 5</label>
      ${stepperHtml('gw-serv', st.settings.servings || 2, { min: 1, max: 24 })}
    </div>
    <div class="field"><label>How should I pick recipes?</label>
      <div class="chip-row wrap" id="gw-mode">
        <button type="button" class="chip ${mode === 'standard' ? 'chip-on' : ''}" data-m="standard">✨ Best variety</button>
        <button type="button" class="chip ${mode === 'pantry' ? 'chip-on' : ''}" data-m="pantry">🫙 Use what I have${nPantry ? ` (${nPantry})` : ''}</button>
        <button type="button" class="chip ${mode === 'mixed' ? 'chip-on' : ''}" data-m="mixed">💰 Spend least</button>
      </div>
      <small class="hint" id="gw-mode-hint">${MODE_HINTS[mode] || MODE_HINTS.standard}</small>
    </div>
    <div class="field"><label>Start</label>
      <select id="gw-start" class="select">
        <option value="0">Today</option>
        <option value="1">Tomorrow</option>
        <option value="nextmonday">Next Monday</option>
      </select>
    </div>
    ${budget?.on ? `<p class="hint">💰 Price cap is on: ≤ <strong>${fmtCAD(budget.max)}</strong> per serving — pricey meals are excluded. Want one anyway? Open that meal's ⋯ menu → 💎 splurge.</p>` : ''}
    ${hasPlan ? `
    <div class="btn-col">
      <button class="btn btn-primary" data-action="plan-generate-append">＋ Add to my current plan (fills free slots)</button>
      <button class="btn btn-secondary" data-action="plan-generate-run">Start a fresh plan with these settings</button>
    </div>` : `
    <button class="btn btn-primary btn-lg" data-action="plan-generate-run">Generate my plan</button>`}
    <p class="hint">Recipes are matched to each slot: real breakfasts at breakfast, mains at lunch &amp; dinner — with protein variety across days.</p>`,
    { onMount: (el) => {
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('#gw-slots .chip');
        if (chip) {
          chip.classList.toggle('chip-on');
          if (!el.querySelectorAll('#gw-slots .chip-on').length) chip.classList.add('chip-on'); // keep one
          return;
        }
        const mchip = e.target.closest('#gw-mode .chip');
        if (mchip) {
          el.querySelectorAll('#gw-mode .chip').forEach((c) => c.classList.remove('chip-on'));
          mchip.classList.add('chip-on');
          const hintEl = el.querySelector('#gw-mode-hint');
          if (hintEl) hintEl.textContent = MODE_HINTS[mchip.dataset.m] || '';
        }
      });
    } });
}

/* ---------- plan a single day (daily planning) ---------- */
export function dayPlanModal(date) {
  const st = getState();
  const label = date === todayStr() ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  openModal(`
    <div class="sheet-head"><h3>Plan ${esc(label)}</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Fill just this one day — auto-picked to fit your diet${st.settings.budget?.on ? `, your budget (≤ ${fmtCAD(st.settings.budget.max)}/serving)` : ''} and what you already have at home.</p>
    <div class="field"><label>Meals for this day</label>
      <div class="chip-row" id="dp-slots">
        <button type="button" class="chip" data-slot="breakfast">🌅 Breakfast</button>
        <button type="button" class="chip" data-slot="lunch">☀️ Lunch</button>
        <button type="button" class="chip chip-on" data-slot="dinner">🌙 Dinner</button>
      </div>
      <small class="hint">Slots you've already planned on ${esc(label)} are left untouched.</small>
    </div>
    <div class="btn-col">
      <button class="btn btn-primary" data-action="day-generate-run" data-date="${date}">✨ Auto-pick recipes for this day</button>
      <button class="btn btn-secondary" data-action="day-pick-open" data-date="${date}">✍️ Choose the recipes myself</button>
    </div>`,
    { onMount: (el) => {
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('#dp-slots .chip');
        if (!chip) return;
        chip.classList.toggle('chip-on');
        if (!el.querySelectorAll('#dp-slots .chip-on').length) chip.classList.add('chip-on');
      });
    } });
}

/* ---------- ingredient hunt ---------- */
export function huntModal() {
  const COMMON = ['chicken', 'rice', 'pasta', 'eggs', 'onion', 'garlic', 'tomato', 'potato', 'cheese', 'beans', 'spinach', 'mushroom', 'carrot', 'lemon', 'shrimp', 'beef'];
  openModal(`
    <div class="sheet-head"><h3>🧑‍🍳 Cook with what you have</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Pick ingredients sitting in your fridge — we'll rank recipes by how much you already own, across all open sources.</p>
    <div class="field"><label>Your ingredients</label>
      <input id="hunt-input" class="input" placeholder="Type and press Enter to add">
      <div class="chip-row" id="hunt-chips"></div>
    </div>
    <div class="field"><label>Common items</label>
      <div class="chip-row">${COMMON.map((c) => `<button class="chip" data-add="${c}">+ ${c}</button>`).join('')}</div>
    </div>
    <button class="btn btn-primary" data-action="hunt-run">Find my recipes</button>`,
    { onMount: (el) => {
      const chips = el.querySelector('#hunt-chips');
      const input = el.querySelector('#hunt-input');
      const add = (v) => {
        v = v.trim().toLowerCase();
        if (!v) return;
        if ([...chips.children].some((c) => c.dataset.v === v)) return;
        const chip = document.createElement('button');
        chip.className = 'chip chip-on'; chip.dataset.v = v;
        chip.textContent = v + ' ✕';
        chips.appendChild(chip);
        input.value = '';
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(input.value); } });
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-add]');
        if (a) add(a.dataset.add);
        const c = e.target.closest('#hunt-chips .chip');
        if (c) c.remove();
      });
    } });
}

/* ---------- onboarding ---------- */
export function onboardingModal() {
  openModal(`
    <div class="onboard">
      <div class="onboard-logo" aria-hidden="true">🍽️</div>
      <h2>Welcome to OpenPlate</h2>
      <p class="onboard-sub">The <strong>fully open-source</strong> meal planner. No account, no paywall, no cloud — everything lives on your device, and recipes come from <strong>open recipe databases</strong>.</p>
      <div class="field"><label>How many servings do you usually cook?</label>
        ${stepperHtml('ob-serv', 2, { min: 1, max: 24 })}
      </div>
      <div class="field"><label>Any diet to follow?</label>
        <div class="chip-row" id="ob-diet">
          <button class="chip chip-on" data-d="all">Everything</button>
          <button class="chip" data-d="vegetarian">Vegetarian</button>
          <button class="chip" data-d="vegan">Vegan</button>
          <button class="chip" data-d="pescatarian">Pescatarian</button>
        </div>
      </div>
      <div class="field"><label>Allergies to avoid? <span class="hint-inline">pick any — tap again to unselect</span></label>
        <div class="chip-row" id="ob-allerg">
          ${['dairy', 'eggs', 'gluten', 'peanuts', 'treenuts', 'soy', 'shellfish', 'fish'].map((a) => `<button class="chip" data-a="${a}">${{ dairy: 'Dairy', eggs: 'Eggs', gluten: 'Gluten', peanuts: 'Peanuts', treenuts: 'Tree nuts', soy: 'Soy', shellfish: 'Shellfish', fish: 'Fish' }[a]}</button>`).join('')}
        </div>
        <small class="hint">Planned meals and search results will avoid these.</small>
      </div>
      <button class="btn btn-primary btn-lg" data-action="onboard-done">Start planning 🍳</button>
      <p class="hint center">100% free &amp; open source (MIT) · works offline · export your data anytime</p>
    </div>`,
    { onMount: (el) => {
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip[data-n], .chip[data-d]');
        if (!chip) return; // allergy chips (data-a) are multi-select — handled by the global toggle
        const row = chip.parentElement;
        row.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip-on'));
        chip.classList.add('chip-on');
      });
    } });
}
