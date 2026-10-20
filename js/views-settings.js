/* OpenPlate — views-settings.js : Settings tab + preference sheets + impact dashboard */
'use strict';

import { esc, AISLES } from './util.js';
import { getState, wasteTotalLb, getBans, bansCount, pantryItems, removeFromPantry, addToPantry } from './store.js';
import { sourceCounts, categories } from './sources.js';
import { lineChart, barChart } from './charts.js';
import { openModal, closeModal, showToast, stepperHtml } from './views-core.js';
import { CA_STORES, fmtCAD } from './prices.js';

export function viewSettings() {
  const st = getState();
  const s = st.settings;
  const counts = sourceCounts();
  const saved = wasteTotalLb();
  const doneMeals = st.waste.log.length;
  const allergenLabels = { dairy: 'Dairy', eggs: 'Eggs', gluten: 'Gluten', peanuts: 'Peanuts', treenuts: 'Tree nuts', sesame: 'Sesame', soy: 'Soy', shellfish: 'Shellfish', fish: 'Fish' };
  return `
  <section class="pad">
    <div class="impact-card" id="impact-card">
      <div class="impact-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--line)" stroke-width="3.4"/><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--green)" stroke-width="3.4" stroke-dasharray="${Math.min(100, Math.round((saved % 60) / 60 * 100))} 100" stroke-linecap="round" transform="rotate(-90 18 18)"/></svg><strong>${saved}<small>lb</small></strong></div>
      <div class="impact-txt">
        <h2>Food waste saved</h2>
        <p><strong>${doneMeals}</strong> home-cooked meal${doneMeals === 1 ? '' : 's'} planned &amp; cooked with OpenPlate. Planning exact amounts means less ends up in the bin — great for the planet and your wallet.</p>
        <small class="hint">Estimate: ${s.wasteFactor} lb per serving (adjust below). Stored privately on your device.</small>
      </div>
    </div>
    <div class="chart-card" id="impact-charts">
      <h3 class="sect-title">Cumulative savings</h3>
      <canvas id="chart-line" height="90" aria-label="Cumulative food savings chart"></canvas>
      <h3 class="sect-title">Saved per cooked meal</h3>
      <canvas id="chart-bar" height="90" aria-label="Savings per meal chart"></canvas>
    </div>

    <h3 class="sect-title">Preferences</h3>
    <div class="set-group">
      <button class="set-row" data-action="diet-open">
        <span class="set-ico" aria-hidden="true">🥗</span>
        <span class="set-label">Diet, allergies &amp; dislikes</span>
        <span class="set-val">${s.diet === 'all' ? 'Everything' : s.diet}${s.allergens.length ? ' · ' + s.allergens.length + ' allergen' + (s.allergens.length > 1 ? 's' : '') : ''}${s.dislikes.length ? ' · ' + s.dislikes.length + ' disliked' : ''}</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="bans-open">
        <span class="set-ico" aria-hidden="true">🚫</span>
        <span class="set-label">Hidden &amp; blocked (shadowban)</span>
        <span class="set-val">${bansCount() ? bansCount() + ' active' : 'None'}</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="staples-open">
        <span class="set-ico" aria-hidden="true">🏡</span>
        <span class="set-label">Pantry staples I always have</span>
        <span class="set-val">${s.staples.length} items</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="units-cycle">
        <span class="set-ico" aria-hidden="true">⚖️</span>
        <span class="set-label">Units</span>
        <span class="set-val">${s.units === 'us' ? 'US (cups, oz)' : 'Metric (ml, g)'}</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="servings-open">
        <span class="set-ico" aria-hidden="true">🍽️</span>
        <span class="set-label">Default servings</span>
        <span class="set-val">${s.servings}</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="budget-open">
        <span class="set-ico" aria-hidden="true">💰</span>
        <span class="set-label">Price cap per serving (CAD)</span>
        <span class="set-val">${s.budget?.on ? '≤ ' + fmtCAD(s.budget.max) : 'Off'}</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="pantry-open">
        <span class="set-ico" aria-hidden="true">🫙</span>
        <span class="set-label">My pantry (what's at home)</span>
        <span class="set-val">${Object.keys(pantryItems()).length} items</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="time-open">
        <span class="set-ico" aria-hidden="true">⏱</span>
        <span class="set-label">Max cook time filter</span>
        <span class="set-val">${s.maxTime ? s.maxTime + ' min' : 'Any'}</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="dark-toggle">
        <span class="set-ico" aria-hidden="true">${s.dark ? '🌙' : '☀️'}</span>
        <span class="set-label">Dark mode</span>
        <span class="set-val">${s.dark ? 'On' : 'Off'}</span>
        <span class="set-arrow">›</span>
      </button>
    </div>

    <h3 class="sect-title">Open recipe sources</h3>
    <div class="set-group">
      ${['local', 'mealdb', 'dummyjson'].map((k) => `
        <label class="set-row">
          <span class="set-ico" aria-hidden="true">${{ local: '📗', mealdb: '🌐', dummyjson: '🧪' }[k]}</span>
          <span class="set-label">${{ local: 'OpenPlate built-in library', mealdb: 'TheMealDB (open database)', dummyjson: 'DummyJSON open recipes' }[k]}
            <small>${{ local: counts.local + ' recipes · always offline', mealdb: counts.mealdb + ' recipes · bundled offline with photos', dummyjson: counts.dummyjson + ' recipes · bundled offline with photos' }[k]}</small>
          </span>
          <input type="checkbox" class="switch" data-action-src="${k}" ${s.sources[k] ? 'checked' : ''} aria-label="Use ${{ local: 'built-in', mealdb: 'TheMealDB', dummyjson: 'DummyJSON' }[k]}">
        </label>`).join('')}
      <button class="set-row" data-action="cache-refresh">
        <span class="set-ico" aria-hidden="true">🔄</span>
        <span class="set-label">Check open sources for newly added recipes</span>
        <span class="set-val">optional · online</span>
        <span class="set-arrow">›</span>
      </button>
    </div>

    <h3 class="sect-title">Helpful extras</h3>
    <div class="set-group">
      <button class="set-row" data-action="reminder-open">
        <span class="set-ico" aria-hidden="true">🔔</span>
        <span class="set-label">Meal plan reminder</span>
        <span class="set-val">${s.reminder.enabled ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.reminder.day] + ' @ ' + s.reminder.time : 'Off'}</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="stores-open">
        <span class="set-ico" aria-hidden="true">🛍️</span>
        <span class="set-label">Grocery stores (Canada)</span>
        <span class="set-val">${s.preferredStores?.length || 0} preferred · ${s.storeLinks.length} links</span>
        <span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="waste-open">
        <span class="set-ico" aria-hidden="true">🌍</span>
        <span class="set-label">Waste-saving estimate</span>
        <span class="set-val">${s.wasteFactor} lb / serving</span>
        <span class="set-arrow">›</span>
      </button>
    </div>

    <h3 class="sect-title">Your data</h3>
    <div class="set-group">
      <button class="set-row" data-action="data-export">
        <span class="set-ico" aria-hidden="true">📤</span>
        <span class="set-label">Export everything (JSON backup)</span><span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="data-import">
        <span class="set-ico" aria-hidden="true">📥</span>
        <span class="set-label">Import a backup</span><span class="set-arrow">›</span>
      </button>
      <button class="set-row" data-action="data-reset">
        <span class="set-ico" aria-hidden="true">🗑️</span>
        <span class="set-label danger">Reset app data</span><span class="set-arrow">›</span>
      </button>
    </div>
    <input type="file" id="import-file" accept=".json,application/json" hidden>

    <h3 class="sect-title">About</h3>
    <div class="set-group">
      <button class="set-row" data-action="about-open">
        <span class="set-ico" aria-hidden="true">💚</span>
        <span class="set-label">About OpenPlate &amp; open source</span><span class="set-arrow">›</span>
      </button>
    </div>
    <p class="hint center">v1.2 · MIT licensed · 861 open recipes + photos bundled offline · CAD price estimates · zero trackers, zero accounts</p>
  </section>`;
}

export function drawImpactCharts() {
  const st = getState();
  const line = document.getElementById('chart-line');
  const bar = document.getElementById('chart-bar');
  if (!line || !bar) return;
  const log = st.waste.log;
  if (log.length) {
    let acc = 0;
    const pts = log.map((w) => { acc += w.lb; return { x: '', y: Math.round(acc * 10) / 10 }; });
    pts[0].x = new Date(log[0].at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    pts[pts.length - 1].x = new Date(log[log.length - 1].at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    lineChart(line, pts);
    const bars = log.slice(-16).map((w, i) => ({ x: i === 0 ? '' : i, y: w.lb }));
    barChart(bar, bars);
  } else {
    const ctx = line.getContext('2d');
    ctx.font = '13px system-ui'; ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
    ctx.textAlign = 'center';
    ctx.fillText('Cook a planned meal to start saving 🍳', line.getBoundingClientRect().width / 2, 45);
    barChart(bar, [{ x: '', y: 0 }]);
  }
}

/* ---------- diet sheet ---------- */
export function dietModal() {
  const s = getState().settings;
  const ALL = [
    { id: 'dairy', label: 'Dairy' }, { id: 'eggs', label: 'Eggs' }, { id: 'gluten', label: 'Gluten / Wheat' },
    { id: 'peanuts', label: 'Peanuts' }, { id: 'treenuts', label: 'Tree nuts' }, { id: 'sesame', label: 'Sesame' },
    { id: 'soy', label: 'Soy' }, { id: 'shellfish', label: 'Shellfish' }, { id: 'fish', label: 'Fish' },
  ];
  openModal(`
    <div class="sheet-head"><h3>🥗 Diet, allergies &amp; dislikes</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <div class="field"><label>Diet</label>
      <div class="chip-row" id="dm-diet">
        ${[['all', 'Everything'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian']].map(([v, l]) => `<button class="chip ${s.diet === v ? 'chip-on' : ''}" data-d="${v}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="field"><label>Allergies &amp; restrictions</label>
      <div class="chip-row" id="dm-allerg">
        ${ALL.map((a) => `<button class="chip ${s.allergens.includes(a.id) ? 'chip-on' : ''}" data-a="${a.id}">${a.label}</button>`).join('')}
      </div>
    </div>
    <div class="field"><label>Ingredients you dislike (one per line)</label>
      <textarea id="dm-dislikes" class="input" rows="3" placeholder="lamb&#10;olives">${esc(s.dislikes.join('\n'))}</textarea>
    </div>
    <button class="btn btn-primary" data-action="diet-save">Save preferences</button>
    <p class="hint">Used by the plan generator, search filters and allergen badges on recipes.</p>`);
}

/* ---------- staples sheet ---------- */
export function staplesModal() {
  const s = getState().settings;
  openModal(`
    <div class="sheet-head"><h3>🏡 Pantry staples</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">These are assumed to be in your kitchen and are <strong>hidden from the shopping list</strong> (you can turn that off in Groceries). One per line.</p>
    <textarea id="staples-txt" class="input" rows="8" style="min-height:180px">${esc(s.staples.join('\n'))}</textarea>
    <label class="checkline"><input type="checkbox" id="staples-hide" class="switch" ${s.hideStaples ? 'checked' : ''}> Hide staples in the grocery list</label>
    <button class="btn btn-primary" data-action="staples-save">Save staples</button>`);
}

/* ---------- servings / time sheets ---------- */
export function servingsModal() {
  const s = getState().settings;
  openModal(`
    <div class="sheet-head"><h3>🍽️ Default servings</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Type any number — 3, 5, 12 — or use the stepper.</p>
    ${stepperHtml('sv-serv', s.servings || 2, { min: 1, max: 24 })}
    <button class="btn btn-primary" data-action="servings-save">Save default</button>
    <p class="hint">Applied when generating plans and adding recipes (you can always override per meal).</p>`);
}
export function timeModal() {
  const s = getState().settings;
  openModal(`
    <div class="sheet-head"><h3>⏱ Max cook time</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <div class="chip-row" id="tm-opts">${[[0, 'Any'], [30, '≤ 30 min'], [45, '≤ 45 min'], [60, '≤ 1 hr'], [90, '≤ 1.5 hr']].map(([v, l]) => `<button class="chip ${s.maxTime === v ? 'chip-on' : ''}" data-n="${v}">${l}</button>`).join('')}</div>
    <button class="btn btn-primary" data-action="time-save">Save</button>
    <p class="hint">Recipes from open sources without time data are never filtered out.</p>`);
}
export function wasteModal() {
  const s = getState().settings;
  openModal(`
    <div class="sheet-head"><h3>🌍 Waste-saving estimate</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Each cooked serving counts as <strong>${s.wasteFactor} lb</strong> of food kept out of the bin (households typically toss 30–40% of groceries — planning exact amounts avoids most of it).</p>
    <div class="chip-row" id="wf-opts">${[0.25, 0.5, 0.75, 1].map((n) => `<button class="chip ${s.wasteFactor === n ? 'chip-on' : ''}" data-n="${n}">${n} lb</button>`).join('')}</div>
    <button class="btn btn-primary" data-action="waste-save">Save</button>
    <p class="hint">Honest by design: it's an estimate, and the formula is in the open source code for anyone to audit.</p>`);
}

/* ---------- hidden & blocked (shadowban) manager ---------- */
export function bansModal() {
  const b = getBans();
  const cats = categories();
  const when = (until) => until == null ? 'permanent' : Math.max(1, Math.ceil((until - Date.now()) / 864e5)) + ' days left';
  const row = (type, k, label, until) => `
    <div class="ban-row">
      <div class="ban-info"><span class="ban-name">${esc(label)}</span><small class="ban-when">${when(until)}</small></div>
      <button class="icon-btn" data-action="ban-remove" data-type="${type}" data-bkey="${esc(k)}" aria-label="Remove ban" title="Un-hide">✕</button>
    </div>`;
  const recipeRows = Object.entries(b.recipes || {}).map(([k, e]) => row('recipes', k, e.name || k, e.until)).join('');
  const ingRows = Object.entries(b.ingredients || {}).map(([k, e]) => row('ingredients', k, 'anything with “' + k + '”', e.until)).join('');
  const catRows = Object.entries(b.categories || {}).map(([k, e]) => row('categories', k, 'all “' + k + '” recipes', e.until)).join('');
  openModal(`
    <div class="sheet-head"><h3>🚫 Hidden &amp; blocked</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Shadowbanned items disappear from Discover, search and plan generation. Bans expire after <strong>7 days</strong> (unless marked permanent) and clear themselves automatically.</p>
    ${recipeRows || ingRows || catRows ? `
      <div class="ban-groups">
        ${recipeRows ? `<h4 class="sect-title">Hidden recipes</h4>${recipeRows}` : ''}
        ${ingRows ? `<h4 class="sect-title">Hidden ingredients</h4>${ingRows}` : ''}
        ${catRows ? `<h4 class="sect-title">Hidden food types</h4>${catRows}` : ''}
      </div>` : `<p class="hint">Nothing is hidden right now. Hide a recipe from its detail page (“Hide this recipe…”), or add ingredient / food-type bans below.</p>`}
    <div class="field"><label>New duration for additions</label>
      <div class="chip-row" id="bd-dur">
        <button type="button" class="chip chip-on" data-dur="week">For a week</button>
        <button type="button" class="chip" data-dur="forever">Forever</button>
      </div>
    </div>
    <div class="field"><label>Hide an ingredient</label>
      <div class="row-2"><input id="ban-ing" class="input" placeholder="e.g. olives, lamb, cilantro…"><button class="btn btn-secondary" data-action="ban-add-ing">Hide</button></div>
    </div>
    <div class="field"><label>Hide a food type</label>
      <div class="row-2">
        <input id="ban-cat" class="input" list="ban-cat-list" placeholder="e.g. Seafood, Dessert, Pork…">
        <datalist id="ban-cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <button class="btn btn-secondary" data-action="ban-add-cat">Hide</button>
      </div>
    </div>`,
    { onMount: (el) => {
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('#bd-dur .chip');
        if (!chip) return;
        el.querySelectorAll('#bd-dur .chip').forEach((c) => c.classList.remove('chip-on'));
        chip.classList.add('chip-on');
      });
    } });
}

/* ---------- reminders ---------- */
export function reminderModal() {
  const r = getState().settings.reminder;
  openModal(`
    <div class="sheet-head"><h3>🔔 Meal plan reminder</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <label class="checkline"><input type="checkbox" id="rem-on" class="switch" ${r.enabled ? 'checked' : ''}> Remind me to plan next week's meals</label>
    <div class="row-2">
      <div class="field"><label>Day</label>
        <select id="rem-day" class="select">${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => `<option value="${i}" ${r.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Time</label>
        <input id="rem-time" class="input" type="time" value="${esc(r.time)}">
      </div>
    </div>
    <button class="btn btn-primary" data-action="reminder-save">Save reminder</button>
    <button class="btn btn-secondary" data-action="reminder-test">Send test notification</button>
    <p class="hint">Works while OpenPlate is open in a tab (a real background push would need a server — this app has none, by design).</p>`);
}

/* ---------- price cap (budget) sheet ---------- */
export function budgetModal() {
  const b = getState().settings.budget || { on: false, max: 7.5 };
  const presets = [5, 6.5, 8, 10, 12.5];
  openModal(`
    <div class="sheet-head"><h3>💰 Price cap per serving</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">The plan generator will skip meals estimated above this amount (CAD). Estimates use built-in Canadian price data — actual store prices vary.</p>
    <div class="field"><label>Cap</label>
      <div class="chip-row wrap" id="bud-opts">
        <button type="button" class="chip ${!b.on ? 'chip-on' : ''}" data-n="off">No cap</button>
        ${presets.map((p) => `<button type="button" class="chip ${b.on && Math.abs(b.max - p) < 0.01 ? 'chip-on' : ''}" data-n="${p}">${fmtCAD(p)}</button>`).join('')}
      </div>
    </div>
    <div class="field"><label>Or type your own cap ($ per serving)</label>
      <input id="bud-custom" class="input" type="number" inputmode="decimal" min="1" step="0.5" value="${b.on ? b.max : ''}" placeholder="e.g. 7.50">
    </div>
    <button class="btn btn-primary" data-action="budget-save">Save price cap</button>
    <p class="hint">Recipes on every card and in the plan show ≈ $/serving. Need something pricier one day? Open that meal's ⋯ menu and toggle 💎 splurge.</p>`,
    { onMount: (el) => {
      el.addEventListener('click', (e) => {
        const chip = e.target.closest('#bud-opts .chip');
        if (!chip) return;
        el.querySelectorAll('#bud-opts .chip').forEach((c) => c.classList.remove('chip-on'));
        chip.classList.add('chip-on');
        if (chip.dataset.n !== 'off') el.querySelector('#bud-custom').value = chip.dataset.n;
      });
    } });
}

/* ---------- pantry manager ---------- */
const PANTRY_QUICK = ['rice', 'pasta', 'eggs', 'milk', 'butter', 'flour', 'sugar', 'olive oil', 'onion', 'garlic', 'canned tomatoes', 'beans', 'cheese', 'oats', 'potatoes', 'bread', 'peanut butter', 'soy sauce', 'frozen peas', 'pasta sauce'];
export function pantryModal() {
  const items = pantryItems();
  const keys = Object.keys(items).sort();
  openModal(`
    <div class="sheet-head"><h3>🫙 My pantry</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">What you already have at home. Pantry items are <strong>left off your shopping list</strong> and recipes that use them rank higher in “Use what I have” planning.</p>
    <div class="field"><label>Add an item</label>
      <div class="row-2"><input id="pantry-in" class="input" placeholder="e.g. rice, eggs, olive oil…" list="pantry-quick-list"><button class="btn btn-secondary" data-action="pantry-add-input">Add</button></div>
      <datalist id="pantry-quick-list">${PANTRY_QUICK.map((q) => `<option value="${esc(q)}">`).join('')}</datalist>
      <div class="chip-row wrap">${PANTRY_QUICK.map((q) => `<button type="button" class="chip" data-action="pantry-add" data-name="${esc(q)}">＋ ${esc(q)}</button>`).join('')}</div>
    </div>
    ${keys.length ? `<div class="ban-groups">
      ${keys.map((k) => `
        <div class="ban-row">
          <div class="ban-info"><span class="ban-name">${esc(items[k].name || k)}</span></div>
          <button class="icon-btn" data-action="pantry-remove" data-key="${esc(k)}" aria-label="Remove ${esc(k)}" title="Remove from pantry">✕</button>
        </div>`).join('')}
    </div>` : '<p class="hint">Your pantry is empty — add a few basics above, or check items off in Groceries and tap “Add checked to pantry”.</p>'}
    <p class="hint">Tip: in the Groceries tab, check off what you just bought and tap <strong>＋ Add checked to pantry</strong> — next plan won't ask you to buy it again.</p>`,
    { onMount: (el) => {
      const input = el.querySelector('#pantry-in');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-action="pantry-add-input"]').click(); } });
    } });
}

/* ---------- Canadian grocery stores ---------- */
export function storesModal() {
  const s = getState().settings;
  const pref = new Set(s.preferredStores || []);
  openModal(`
    <div class="sheet-head"><h3>🛍️ Grocery stores (Canada)</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">Your shopping list can open item-by-item in any of these stores (pre-filled searches). Star the ones you use — they appear first in the shopping sheet.</p>
    <div class="ban-groups">
      ${CA_STORES.map((st) => `
        <label class="ban-row set-store-row">
          <div class="ban-info">
            <span class="ban-name">${esc(st.name)} ${pref.has(st.id) ? '⭐' : ''}</span>
            <small class="ban-when">${esc(st.note)} · ${esc(st.domain)}</small>
          </div>
          <input type="checkbox" class="switch" data-pref-store="${st.id}" ${pref.has(st.id) ? 'checked' : ''} aria-label="Prefer ${esc(st.name)}">
        </label>`).join('')}
    </div>
    <div class="field"><label>Your own store links (shown in the shopping sheet)</label>
      ${s.storeLinks.map((l, i) => `<div class="row-2" data-link-row="${i}"><input class="input sl-name" value="${esc(l.name)}" placeholder="Store"><input class="input sl-url" value="${esc(l.url)}" placeholder="https://…"></div>`).join('')}
      <button class="btn btn-ghost btn-sm" data-action="stores-add">＋ Add another store</button>
    </div>
    <button class="btn btn-primary" data-action="stores-save">Save stores</button>
    <p class="hint">OpenPlate earns nothing from these links and sends them nothing — they open the store's own search with the ingredient pre-filled.</p>`);
}

/* ---------- about ---------- */
export function aboutModal() {
  openModal(`
    <div class="sheet-head"><h3>💚 About OpenPlate</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="onboard-sub">OpenPlate is a <strong>fully open-source</strong> meal planner built as an open alternative to Mealime. It runs on plain HTML, CSS and JavaScript — no frameworks, no build step, no servers, no accounts, no ads, no paywalls.</p>
    <ul class="about-list">
      <li>📜 <strong>License:</strong> MIT — fork it, host it, change it, share it</li>
      <li>🧠 <strong>Recipe sources:</strong> TheMealDB community database · DummyJSON open recipes · built-in CC0 library</li>
      <li>🔒 <strong>Privacy:</strong> every byte of your data stays in your browser (localStorage). Export or delete it anytime.</li>
      <li>🌱 <strong>Impact:</strong> the waste-savings model is a documented estimate, auditable in the source</li>
      <li>✈️ <strong>Offline:</strong> service worker + cached sources keep planning, lists and cooking working without internet</li>
    </ul>
    <p class="hint">To self-host: copy the <code>openplate/</code> folder to any static host (GitHub Pages, Netlify…) — that's it.</p>`);
}

/* ---------- confirm helper ---------- */
export function confirmModal(title, body, actionLabel, action, danger = true) {
  openModal(`
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close-modal aria-label="Close">✕</button></div>
    <p class="sheet-sub">${body}</p>
    <div class="btn-row"><button class="btn ${danger ? 'btn-ghost danger' : 'btn-secondary'}" data-close-modal>Cancel</button>
    <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="${action}">${esc(actionLabel)}</button></div>`);
}
