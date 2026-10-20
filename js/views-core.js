/* OpenPlate — views-core.js : shared UI primitives + Meal Plan + Groceries views */
'use strict';

import { esc, fmtQty, fmtAmount, fmtDate, dayShort, todayStr, addDays, AISLES, guessAisle, unitDim, fmtTime, timeTotal, plural, copyText, convert } from './util.js';
import { guessAisle as _ga } from './util.js';
import { getState, isStaple, pantryItems, pantryCount, removeFromPantry, haveList } from './store.js';
import { wasteTotalLb } from './store.js';
import { SOURCES } from './sources.js';
import { estimateRecipeCost, estimateItemCost, fmtCAD, CA_STORES, storeSearchUrl } from './prices.js';

/* ---------- toasts ---------- */
export function showToast(msg, opts = {}) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (opts.tone ? ' toast-' + opts.tone : '');
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, opts.ms || 2600);
}

/* ---------- modal framework ---------- */
let modalSeq = 0; // guards close-then-open races (new modal must not be wiped by the old close timer)
export function openModal(html, { sheet = true, onMount } = {}) {
  modalSeq++;
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-close></div>
    <div class="modal ${sheet ? 'modal-sheet' : 'modal-center'}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  document.body.classList.add('modal-open');
  const el = root.querySelector('.modal');
  requestAnimationFrame(() => el.classList.add('in'));
  root.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  if (onMount) onMount(el);
  const focusable = el.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 150);
  return el;
}
export function closeModal() {
  const root = document.getElementById('modal-root');
  const el = root.querySelector('.modal');
  const my = modalSeq;
  if (el) el.classList.remove('in');
  setTimeout(() => {
    if (my !== modalSeq) return; // a newer modal was opened meanwhile
    root.classList.remove('open'); root.innerHTML = ''; document.body.classList.remove('modal-open');
  }, 180);
}
export function modalOpen() { return document.getElementById('modal-root').classList.contains('open'); }

/* ---------- shared bits ---------- */
export const SOURCE_BADGE = {
  local: '<span class="badge badge-local">OpenPlate</span>',
  mealdb: '<span class="badge badge-mealdb">TheMealDB</span>',
  dummyjson: '<span class="badge badge-dummy">DummyJSON</span>',
  custom: '<span class="badge badge-custom">Yours</span>',
  favorite: '<span class="badge badge-fav">♥</span>',
};
export function gradFor(name) {
  const GRADS = [['#9CCB86', '#5FA052'], ['#F6B352', '#E56910'], ['#F97316', '#DC2626'], ['#86EFAC', '#059669'], ['#FBCFE8', '#BE185D'], ['#FDE68A', '#D97706'], ['#D6D3D1', '#57534E'], ['#6EE7B7', '#0E7490']];
  let h = 0;
  for (const ch of String(name || '?')) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return GRADS[h % GRADS.length];
}
export function thumb(r, cls = '') {
  const initial = esc(String(r.name || '?').trim().charAt(0).toUpperCase() || '?');
  if (r.image) {
    return `<div class="thumb ${cls}"><img src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy" onerror="this.parentElement.classList.add('imgfail');this.remove()"><div class="thumb-fallback" aria-hidden="true">${initial}</div></div>`;
  }
  const [a, b] = r.grad || gradFor(r.name);
  return `<div class="thumb ${cls}" style="background:linear-gradient(135deg,${a},${b})"><span class="thumb-letter" aria-hidden="true">${initial}</span></div>`;
}
export function recipeCard(r, { extra = '' } = {}) {
  const st = getState();
  const fav = st.favorites.some((f) => f.origKey === r.key);
  const t = timeTotal(r);
  const kcal = r.kcal ? r.kcal + ' kcal' : '';
  const cost = estimateRecipeCost(r);
  return `<article class="rcard" data-action="recipe-open" data-key="${esc(r.key)}" role="button" tabindex="0" aria-label="${esc(r.name)}">
    ${thumb(r)}
    <button class="heart ${fav ? 'on' : ''}" data-action="fav-toggle" data-key="${esc(r.key)}" aria-label="Toggle favorite" aria-pressed="${fav}">${fav ? '♥' : '♡'}</button>
    <div class="rcard-body">
      <h3 class="rcard-name">${esc(r.name)}</h3>
      <div class="rcard-meta">
        ${SOURCE_BADGE[r.source] || ''}
        ${t ? `<span class="meta-chip">⏱ ${fmtTime(t)}</span>` : ''}
        ${kcal ? `<span class="meta-chip">${kcal}</span>` : ''}
        <span class="meta-chip meta-cost" title="Estimated cost per serving (CAD — actual prices vary by store)">≈ ${fmtCAD(cost.perServing)}/serv</span>
      </div>
      ${extra}
    </div>
  </article>`;
}
export function emptyState(emoji, title, body, ctaHtml = '') {
  return `<div class="empty">
    <div class="empty-emoji" aria-hidden="true">${emoji}</div>
    <h3>${esc(title)}</h3>
    <p>${body}</p>
    ${ctaHtml}
  </div>`;
}

/* shared editable servings stepper (works with steppers in modals and on pages) */
export function stepperHtml(id, value, { min = 1, max = 24, action = '' } = {}) {
  const act = action ? ` data-action="${action}"` : '';
  return `<div class="stepper">
    <button type="button" class="step-btn"${act} data-step="-1" data-d="-1" data-min="${min}" data-max="${max}" aria-label="Fewer servings">−</button>
    <input class="serv-input" id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${value}" aria-label="Number of servings">
    <button type="button" class="step-btn"${act} data-step="1" data-d="1" data-min="${min}" data-max="${max}" aria-label="More servings">+</button>
  </div>`;
}
export const SLOT_LABEL = { breakfast: '🌅 Breakfast', lunch: '☀️ Lunch', dinner: '🌙 Dinner' };

/* =========================================================
   MEAL PLAN view
========================================================= */
export function viewPlan() {
  const st = getState();
  const plan = st.plan;
  const nav = st.plan ? '' : '';
  if (!plan || !plan.meals.length) {
    const totalSaved = wasteTotalLb();
    return `
    <section class="pad">
      ${st.onboarded && totalSaved > 0 ? `<div class="impact-strip" data-action="nav" data-nav="#/settings">
        <span class="impact-ico" aria-hidden="true">🌍</span>
        <div><strong>${totalSaved} lb</strong> food saved so far<small>Tap to see your impact</small></div>
      </div>` : ''}
      ${emptyState('🗓️', 'No meal plan yet', 'Generate a plan tuned to your diet, allergies and schedule — or add recipes one by one from the Recipes tab.', `
        <button class="btn btn-primary btn-lg" data-action="plan-generate">Customize Your Meal Plan</button>
        <div class="row-gap"><button class="btn btn-ghost" data-action="meal-add">＋ Add meals manually instead</button></div>
        <p class="hint">Plans are generated from <strong>open recipe sources</strong> and stored on your device only.</p>`)}
      ${plan && !plan.meals.length ? `<div class="row-gap"><button class="btn btn-ghost" data-action="plan-finish">Clear this empty plan</button></div>` : ''}
    </section>`;
  }

  const meals = [...plan.meals].sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
  const done = meals.filter((m) => m.done).length;
  const pct = Math.round((done / meals.length) * 100);
  const planSaved = Math.round(meals.filter((m) => m.done).reduce((s, m) => s + (m.servings || 2) * st.settings.wasteFactor, 0) * 10) / 10;
  const days = groupBy(meals, (m) => m.date);

  return `
  <section class="pad">
    <div class="plan-card">
      <div class="plan-head">
        <div>
          <h2 class="plan-title">This week's plan</h2>
          <p class="plan-sub">${meals.length} meal${meals.length > 1 ? 's' : ''} · starts ${fmtDate(plan.start)}</p>
        </div>
        <div class="plan-progress-ring" aria-label="${pct}% cooked"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" fill="none" stroke="var(--line)" stroke-width="3"/><circle cx="18" cy="18" r="16" fill="none" stroke="var(--green)" stroke-width="3" stroke-dasharray="${pct} 100" stroke-linecap="round" transform="rotate(-90 18 18)"/><text x="18" y="21" text-anchor="middle" font-size="9" fill="var(--text)">${pct}%</text></svg></div>
      </div>
      ${planSaved > 0 ? `<p class="plan-waste">🌍 ≈ <strong>${planSaved} lb</strong> of food saved with this plan so far</p>` : ''}
    </div>

    ${Object.entries(days).map(([date, list]) => `
      <div class="day-group">
        <div class="day-head">
          <span class="day-name">${isToday(date) ? 'Today' : fmtDate(date)}</span><span class="day-sub">${dayShort(date)}</span>
          <button class="icon-btn day-add" data-action="day-add" data-date="${date}" aria-label="Add meals to ${isToday(date) ? 'today' : fmtDate(date)}" title="Plan this day">＋</button>
        </div>
        ${list.map((m) => mealRow(m)).join('')}
      </div>`).join('')}

    <div class="row-gap">
      <button class="btn btn-secondary" data-action="plan-generate">✨ Add / change meals</button>
      <button class="btn btn-secondary" data-action="meal-add">＋ Add meal manually</button>
      <button class="btn btn-ghost" data-action="plan-finish">Finish &amp; archive plan</button>
    </div>
    <p class="hint center">Mark meals <strong>cooked ✓</strong> to track your food-waste savings. Your grocery list stays in sync automatically. Tap <strong>＋</strong> on any day to plan just that day.</p>
  </section>`;
}

export function mealRow(m) {
  const r = m.recipe;
  const st = getState();
  const cost = estimateRecipeCost(r);
  const overCap = st.settings.budget?.on && cost.perServing > st.settings.budget.max;
  return `<div class="meal-row ${m.done ? 'done' : ''}" data-action="meal-open" data-id="${m.id}" role="button" tabindex="0">
    ${thumb(r, 'thumb-sm')}
    <div class="meal-info">
      <span class="slot-chip">${SLOT_LABEL[m.slot] || m.slot} · ${m.servings} serving${m.servings === 1 ? '' : 's'} · ≈ ${fmtCAD(cost.perServing)}/serv</span>
      <h4 class="meal-name">${esc(r.name)}${m.splurge ? ' <span class="badge badge-splurge" title="Allowed over your price cap">💎 splurge</span>' : overCap ? ' <span class="badge badge-overcap" title="Over your price cap — tap ⋄ to allow it">over cap</span>' : ''}</h4>
      <span class="meal-src">${esc(SOURCES[r.source]?.short || 'Yours')}</span>
    </div>
    <div class="meal-actions">
      <button class="icon-btn" data-action="meal-done" data-id="${m.id}" aria-label="Mark cooked" title="Mark cooked">${m.done ? '✓' : '○'}</button>
      <button class="icon-btn" data-action="meal-menu" data-id="${m.id}" aria-label="More options" title="Options">⋯</button>
    </div>
  </div>`;
}
export const isToday = (d) => d === todayStr();
function groupBy(arr, fn) {
  const out = {};
  for (const item of arr) { const k = fn(item); (out[k] = out[k] || []).push(item); }
  return out;
}

/* meal options sheet */
export function mealMenuModal(id) {
  const st = getState();
  const m = st.plan?.meals.find((x) => x.id === id);
  if (!m) return;
  const days = [];
  for (let i = 0; i < 14; i++) days.push(addDays(st.plan?.start || todayStr(), i));
  const cost = estimateRecipeCost(m.recipe);
  openModal(`
    <div class="sheet-head"><h3>Meal options</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">${esc(m.recipe.name)}</p>
    <div class="field"><label>Cook on</label>
      <select id="mm-date" class="select">${days.map((d) => `<option value="${d}" ${d === m.date ? 'selected' : ''}>${isToday(d) ? 'Today' : fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Meal</label>
      <select id="mm-slot" class="select">
        <option value="breakfast" ${m.slot === 'breakfast' ? 'selected' : ''}>🌅 Breakfast</option>
        <option value="lunch" ${m.slot === 'lunch' ? 'selected' : ''}>☀️ Lunch</option>
        <option value="dinner" ${m.slot === 'dinner' ? 'selected' : ''}>🌙 Dinner</option>
      </select>
    </div>
    <div class="field"><label>Servings — type any number, e.g. 5</label>
      ${stepperHtml('mm-serv', m.servings || 2, { min: 1, max: 24 })}
    </div>
    <div class="field"><label>Estimated cost</label>
      <p class="hint">≈ <strong>${fmtCAD(cost.perServing)}</strong> per serving · ≈ ${fmtCAD(cost.total)} per recipe (CAD estimate)</p>
    </div>
    ${st.settings.budget?.on ? `
    <div class="field"><label>Budget — this meal</label>
      <div class="chip-row" id="mm-splurge">
        <button type="button" class="chip ${!m.splurge ? 'chip-on' : ''}" data-s="no">Stay in budget</button>
        <button type="button" class="chip ${m.splurge ? 'chip-on' : ''}" data-s="yes">💎 Allow pricier (splurge)</button>
      </div>
      <small class="hint">Splurge lets swaps &amp; regenerations pick meals above your ${fmtCAD(st.settings.budget.max)} cap — just for this meal.</small>
    </div>` : ''}
    <div class="btn-col">
      <button class="btn btn-primary" data-action="meal-save" data-id="${m.id}">Save changes</button>
      <button class="btn btn-secondary" data-action="meal-swap" data-id="${m.id}">🔄 Swap this recipe</button>
      <button class="btn btn-ghost danger" data-action="hide-open" data-key="${esc(m.recipe.key)}">Hide this recipe…</button>
      <button class="btn btn-ghost danger" data-action="meal-remove" data-id="${m.id}">Remove from plan</button>
    </div>`,
    { onMount: (el) => {
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('#mm-splurge .chip');
        if (!chip) return;
        el.querySelectorAll('#mm-splurge .chip').forEach((c) => c.classList.remove('chip-on'));
        chip.classList.add('chip-on');
      });
    } });
}

/* =========================================================
   GROCERIES view
========================================================= */
export function viewGroceries() {
  const st = getState();
  const all = st.groceries.items;
  const items = all.filter((i) => !i.pantry);
  const pantryHits = all.filter((i) => i.pantry);
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  const pct = total ? Math.round((checked / total) * 100) : 0;
  const units = st.settings.units;
  const toBuy = items.filter((i) => !i.checked);
  const estTotal = toBuy.reduce((s, i) => s + estimateItemCost(i), 0);
  if (!all.length) {
    return `<section class="pad">
      ${emptyState('🛒', 'Your list is empty', 'Add meals to your plan and every ingredient lands here — merged, sorted by aisle, priced in CAD, and ready to shop. Staple pantry items are filtered out automatically.', `
        <button class="btn btn-primary btn-lg" data-action="nav" data-nav="#/plan">Go to Meal Plan</button>`)}
    </section>`;
  }
  const byAisle = groupBy([...items].sort((a, b) => (a.aisle || 'Other').localeCompare(b.aisle || 'Other')), (i) => i.aisle || guessAisle(i.name));
  return `
  <section class="pad">
    <div class="plan-card">
      <div class="gro-progress"><div class="gro-progress-bar" style="width:${pct}%"></div></div>
      <p class="plan-sub">${checked} of ${total} items · ${pct}% complete</p>
      ${toBuy.length ? `<p class="plan-sub est-total">🇨🇦 Estimated to buy: <strong>≈ ${fmtCAD(estTotal)}</strong> <small>(CAD — estimates, actual prices vary by store)</small></p>` : ''}
      <div class="pantry-strip">
        <span>🫙 Pantry: <strong>${pantryCount()}</strong> item${pantryCount() === 1 ? '' : 's'} at home</span>
        <button class="btn btn-ghost btn-sm" data-action="pantry-open">Manage</button>
        ${checked ? `<button class="btn btn-secondary btn-sm" data-action="pantry-absorb">＋ Add checked to pantry</button>` : ''}
      </div>
    </div>
    <div class="row-gap wrap">
      <button class="btn btn-secondary btn-sm" data-action="grocery-copy">📋 Copy list</button>
      <button class="btn btn-secondary btn-sm" data-action="grocery-shopsheet">🛍️ Shop in Canada</button>
      <button class="btn btn-secondary btn-sm" data-action="grocery-sync">🔄 Sync with plan</button>
      <button class="btn btn-ghost btn-sm" data-action="grocery-clear-checked">Clear checked</button>
    </div>
    ${Object.entries(byAisle).map(([aisle, list]) => `
      <div class="aisle-group">
        <div class="aisle-head"><span class="aisle-emoji" aria-hidden="true">${AISLE_EMOJI[aisle] || '🧺'}</span> ${esc(aisle)} <span class="aisle-count">${list.filter((i) => !i.checked).length} left</span></div>
        ${list.map((i) => groceryRow(i, units)).join('')}
      </div>`).join('')}
    ${pantryHits.length ? `
      <h3 class="sect-title">🫙 Covered by your pantry — not on the buy list</h3>
      <p class="hint">Amounts in your pantry aren't tracked. If you're actually out of something, tap “I'm out” and it returns to the list.</p>
      <div class="aisle-group pantry-group">
        ${pantryHits.map((i) => `
          <div class="gro-row pantry-row">
            <span class="pantry-dot" aria-hidden="true">🫙</span>
            <div class="gro-info"><span class="gro-name">${esc(i.name)}</span>${i.meals?.length ? `<small class="gro-for">for ${esc(i.meals.slice(0, 2).join(', '))}${i.meals.length > 2 ? ` +${i.meals.length - 2}` : ''}</small>` : ''}</div>
            <span class="gro-amt">${i.qtyBase != null ? esc(fmtAmount(i.qtyBase, i.unit, units)) : ''}</span>
            <button class="icon-btn" data-action="pantry-out" data-key="${esc(i.pantryKey || '')}" aria-label="I'm out of ${esc(i.name)}" title="I'm out — back to the list">↩</button>
          </div>`).join('')}
      </div>` : ''}
    <button class="fab" data-action="grocery-add" aria-label="Add item">+</button>
  </section>`;
}
const AISLE_EMOJI = { 'Produce': '🥬', 'Meat & Seafood': '🥩', 'Dairy & Eggs': '🧀', 'Bakery': '🥖', 'Pantry & Canned': '🥫', 'Spices & Baking': '🧂', 'Frozen': '🧊', 'Drinks': '🥤', 'Other': '🧺', 'Staples': '🏡' };

export function groceryRow(i, units) {
  let amt = '';
  if (i.qtyBase != null) amt = fmtAmount(i.qtyBase, i.unit, units);
  else if (i.unit) amt = plural(i.unit, 1);
  const est = estimateItemCost(i);
  return `<div class="gro-row ${i.checked ? 'done' : ''}">
    <button class="check ${i.checked ? 'on' : ''}" data-action="grocery-toggle" data-id="${i.id}" role="checkbox" aria-checked="${i.checked}" aria-label="Check off ${esc(i.name)}"></button>
    <div class="gro-info" data-action="grocery-aisle" data-id="${i.id}">
      <span class="gro-name">${esc(i.name)}${i.custom ? ' <span class="badge badge-custom">added</span>' : ''}</span>
      ${i.meals?.length && !i.custom ? `<small class="gro-for">for ${esc(i.meals.slice(0, 2).join(', '))}${i.meals.length > 2 ? ` +${i.meals.length - 2}` : ''}</small>` : ''}
    </div>
    <span class="gro-amt">${esc(amt)}</span>
    <span class="gro-price" title="Estimated price (CAD)">${est > 0 ? '≈ ' + fmtCAD(est) : ''}</span>
    <button class="icon-btn" data-action="grocery-remove" data-id="${i.id}" aria-label="Remove ${esc(i.name)}">✕</button>
  </div>`;
}

export function groceryAddModal() {
  openModal(`
    <div class="sheet-head"><h3>Add item</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <div class="field"><label>Item</label><input id="ga-name" class="input" type="text" placeholder="e.g. Paper towels" autocomplete="off"></div>
    <div class="field"><label>Aisle</label>
      <select id="ga-aisle" class="select">${AISLES.map((a) => `<option value="${esc(a)}">${AISLE_EMOJI[a] || ''} ${esc(a)}</option>`).join('')}</select>
    </div>
    <button class="btn btn-primary" data-action="grocery-add-save">Add to list</button>`);
}
export function groceryAisleModal(id) {
  const st = getState();
  const it = st.groceries.items.find((x) => x.id === id);
  if (!it) return;
  const guess = it.aisle || guessAisle(it.name);
  openModal(`
    <div class="sheet-head"><h3>“${esc(it.name)}”</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <div class="field"><label>Move to aisle</label>
      <select id="gai-aisle" class="select">${AISLES.map((a) => `<option value="${esc(a)}" ${a === guess ? 'selected' : ''}>${AISLE_EMOJI[a] || ''} ${esc(a)}</option>`).join('')}</select>
    </div>
    <button class="btn btn-primary" data-action="grocery-aisle-save" data-id="${id}">Save</button>`);
}
/* ---------- Canadian grocery shopping sheet ---------- */
let shopStore = null; // remembered between opens
export function setShopStore(id) { shopStore = id; }
export function shopOnlineModal() {
  const st = getState();
  const preferred = st.settings.preferredStores?.length ? st.settings.preferredStores : ['walmart', 'instacart'];
  if (!shopStore || !CA_STORES.some((s) => s.id === shopStore)) shopStore = preferred[0];
  const store = CA_STORES.find((s) => s.id === shopStore);
  const items = st.groceries.items.filter((i) => !i.checked && !i.pantry);
  const estTotal = items.reduce((s, i) => s + estimateItemCost(i), 0);
  const links = st.settings.storeLinks || [];
  openModal(`
    <div class="sheet-head"><h3>🛍️ Shop this list in Canada</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Tap any item to open it pre-filled in ${esc(store.name)}'s search. Prices below are OpenPlate estimates — the store shows the real ones.</p>
    <div class="field"><label>Store</label>
      <div class="chip-row wrap">${CA_STORES.map((s) => `<button type="button" class="chip ${s.id === shopStore ? 'chip-on' : ''}" data-action="shop-store" data-store="${s.id}">${esc(s.name)}</button>`).join('')}</div>
      <small class="hint">${esc(store.note)} · ⭐ = your preferred store (change in Settings → Grocery stores)</small>
    </div>
    ${items.length ? `
      <div class="store-items">
        ${items.map((i) => {
          const est = estimateItemCost(i);
          const amt = i.qtyBase != null ? fmtAmount(i.qtyBase, i.unit, st.settings.units) : '';
          return `<a class="store-item" href="${esc(storeSearchUrl(store.id, i.name))}" target="_blank" rel="noopener">
            <span class="si-name">${esc(i.name)}${amt ? ` <small>· ${esc(amt)}</small>` : ''}</span>
            <span class="si-price">${est > 0 ? '≈ ' + fmtCAD(est) : ''}</span>
            <span class="si-go" aria-hidden="true">↗</span>
          </a>`;
        }).join('')}
      </div>
      <p class="hint">${items.length} items · estimated total ≈ <strong>${fmtCAD(estTotal)}</strong> (CAD)</p>`
      : `<p class="hint">Nothing left to buy — your list is all checked off. 🎉</p>`}
    <div class="btn-col">
      <button class="btn btn-primary" data-action="store-open" data-store="${store.id}">📋 Copy the whole list, then open ${esc(store.domain)}</button>
      <a class="btn btn-secondary" href="https://${esc(store.domain)}" target="_blank" rel="noopener">🌐 Open ${esc(store.name)}</a>
    </div>
    ${links.length ? `<div class="field"><label>Your saved links</label><div class="btn-col">${links.map((l) => `<a class="btn btn-ghost" href="${esc(l.url)}" target="_blank" rel="noopener">🛒 ${esc(l.name)}</a>`).join('')}</div></div>` : ''}
    <p class="hint">OpenPlate takes no cut and tracks nothing — links go straight to the store. Edit stores in Settings → Grocery stores (Canada).</p>`);
}
