// Food tab: a daily diary by meal, with five ways to add food — search (built-in foods plus
// the Open Food Facts database), barcode scan, a photo, a typed description, or quick add.
import { state, save } from './store.js';
import { $, esc, fmt, uid, num, ymd, addDays, niceDate, ring } from './util.js';
import { dayTotals, recentFoods, guessMeal, MEALS } from './calc.js';
import { actions, inputs, submits, nav, openSheet, setSheet, closeSheet, toast, buzz, icon } from './ui.js';
import { openScanner } from './scan.js';
import { COMMON_FOODS } from './foods-db.js';
import { api, isSignedIn, config } from './sync.js';

export const foodNav = { date: ymd() };
const kc = e => (e.kcal || 0) * (e.qty ?? 1);
const macroLine = (e, q = e.qty ?? 1) => `P ${fmt((e.p || 0) * q, 0)} · C ${fmt((e.c || 0) * q, 0)} · F ${fmt((e.f || 0) * q, 0)}`;
const MACRO = { p: ['Protein', '#6E89A8'], c: ['Carbs', '#D9A29A'], f: ['Fat', '#D9BC6A'] };

export function renderFood() {
  const date = foodNav.date, tot = dayTotals(date), tg = state.settings.targets;
  const left = tg.kcal ? tg.kcal - tot.kcal : null;
  const stat = k => `<div class="col"><span class="muted small" style="font-weight:700">${MACRO[k][0]}</span>
<span class="sub"><span data-count="${Math.round(tot[k])}">${fmt(tot[k], 0)}</span><span class="unit">${tg[k] ? ' / ' + fmt(tg[k], 0) : ''} g</span></span>
<div class="bar"><i data-w="${tg[k] ? Math.min(100, (tot[k] / tg[k]) * 100).toFixed(1) : tot[k] ? 100 : 0}" style="background:${MACRO[k][1]}"></i></div></div>`;

  const meals = MEALS.map(meal => {
    const items = state.foodLog.filter(e => e.date === date && e.meal === meal).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const sum = items.reduce((a, e) => a + kc(e), 0);
    return `<div class="sec-head"><h2>${meal.toLowerCase()}${items.length ? ` <span class="muted" style="font-family:Quicksand,sans-serif;font-size:13px;font-weight:700">${fmt(sum, 0)} kcal</span>` : ''}</h2>
<button class="icon-btn" data-action="food-add" data-meal="${meal}" aria-label="Add to ${meal}">${icon.plus}</button></div>
${items.length ? `<div class="list">${items.map(e => `<div class="swipe"><button class="swipe-del" data-action="food-del" data-id="${e.id}">Delete</button>
<div class="swipe-body" data-action="food-edit" data-id="${e.id}"><div class="col grow" style="gap:2px"><span class="sub ellip">${esc(e.name)}</span>
<span class="muted small ellip">${(e.qty ?? 1) !== 1 ? fmt(e.qty, 2) + ' × ' : ''}${esc(e.serving || 'serving')} · ${macroLine(e)}</span></div>
<span class="v">${fmt(kc(e), 0)}</span></div></div>`).join('')}</div>
${items.length >= 2 ? `<button class="link" data-action="meal-save" data-meal="${meal}" style="align-self:flex-start">Save as a meal</button>` : ''}`
      : `<button class="card dashed press" data-action="food-add" data-meal="${meal}" style="padding:12px 16px;flex-direction:row;align-items:center;gap:8px;color:var(--muted);font-size:13px;font-weight:600">${icon.plus} Add ${meal.toLowerCase()}</button>`}`;
  }).join('');

  return `<header class="head"><h1>food</h1>
<div class="row" style="gap:6px"><button class="icon-btn" data-action="food-day" data-d="-1" aria-label="Previous day">${icon.chevL}</button>
<button class="chip${date === ymd() ? ' on' : ''}" data-action="food-today" style="min-height:44px">${niceDate(date)}</button>
<button class="icon-btn" data-action="food-day" data-d="1" aria-label="Next day">${icon.chevR}</button></div></header>
<section class="card lg tape t-pink">
<div class="row" style="gap:18px">
${ring({ size: 124, stroke: 12, pct: tg.kcal ? tot.kcal / tg.kcal : 0, from: '#EBC7C2', to: '#C98F87', main: fmt(tot.kcal, 0), sub: 'eaten', label: 'Calories eaten' })}
<div class="col grow" style="gap:4px"><span class="label">${tg.kcal ? (left >= 0 ? 'Remaining' : 'Over by') : 'Calories'}</span>
<span class="big" data-count="${tg.kcal ? Math.round(Math.abs(left)) : Math.round(tot.kcal)}">${fmt(tg.kcal ? Math.abs(left) : tot.kcal, 0)}</span>
${tg.kcal ? `<span class="muted">${fmt(tg.kcal, 0)} goal − ${fmt(tot.kcal, 0)} food</span>` : `<button class="link" data-action="tab" data-tab="settings">Set a calorie goal</button>`}</div></div>
<div class="macro3">${stat('p')}${stat('c')}${stat('f')}</div></section>
<div class="food-actions">
<button data-action="food-add" data-tab="search">${icon.search}Search</button>
<button data-action="food-scan">${icon.scan}Scan</button>
<button data-action="food-photo">${icon.camera}Photo</button>
<button data-action="food-describe">${icon.pencil}Describe</button></div>
${meals}`;
}

actions['food-day'] = el => { foodNav.date = addDays(foodNav.date, +el.dataset.d); nav.render(true); };
actions['food-today'] = () => { foodNav.date = ymd(); nav.render(true); };
export function shiftFoodDay(d) { foodNav.date = addDays(foodNav.date, d); nav.render(true); }

export function logFood(src, meal, date, qty) {
  state.foodLog.push({
    id: uid(), date, meal: MEALS.includes(meal) ? meal : guessMeal(), name: src.name, serving: src.serving || '', kcal: +src.kcal || 0, p: +src.p || 0, c: +src.c || 0, f: +src.f || 0,
    qty: qty ?? src.qty ?? 1, ts: Date.now()
  });
}

// ---------- add food sheet ----------
let add = { meal: 'Breakfast', date: ymd(), tab: 'search', q: '' };
let online = { q: '', state: 'idle', foods: [], msg: '' }, searchTimer = null;
const TABS = [['search', 'Search'], ['recent', 'Recent'], ['mine', 'Mine'], ['quick', 'Quick add']];
const beginAdd = (meal, date) => { add.meal = meal || guessMeal(); add.date = date || (nav.tab === 'food' ? foodNav.date : ymd()); };
const row = (action, key, e, right, plus = true) => `<button class="item press" data-action="${action}" data-k="${esc(key)}">
<span class="col grow" style="gap:2px"><span class="sub ellip">${esc(e.name)}</span><span class="muted small ellip">${right}</span></span>
${plus ? `<span class="v c-cyan">${icon.plus}</span>` : `<span class="muted">${icon.chevR}</span>`}</button>`;
const hint = t => `<span class="muted" style="padding:8px 2px;line-height:1.5">${t}</span>`;

function searchList() {
  const q = add.q.trim().toLowerCase();
  if (!q) {
    const rec = recentFoods(6);
    return `${rec.length ? `<span class="label">Recent</span><div class="list">${rec.map(e => row('add-recent', e.id, e, `${fmt(kc(e), 0)} kcal · ${(e.qty ?? 1) !== 1 ? fmt(e.qty, 2) + ' × ' : ''}${esc(e.serving || 'serving')}`)).join('')}</div>` : ''}
${hint('Search everyday foods and packaged products, or use the camera button to scan a barcode.')}`;
  }
  const words = q.split(/\s+/), hit = n => words.every(w => (n || '').toLowerCase().includes(w));
  const mine = state.foods.filter(e => hit(e.name)).slice(0, 6);
  const common = COMMON_FOODS.map((e, i) => [e, i]).filter(([e]) => hit(e.name)).slice(0, 8);
  let out = '';
  if (mine.length) out += `<span class="label">My foods</span><div class="list">${mine.map(e => row('pick-mine', e.id, e, `${fmt(e.kcal, 0)} kcal · ${esc(e.serving || 'serving')}`, false)).join('')}</div>`;
  if (common.length) out += `<span class="label">Everyday foods</span><div class="list">${common.map(([e, i]) => row('pick-common', i, e, `${fmt(e.kcal, 0)} kcal · ${esc(e.serving)}`, false)).join('')}</div>`;
  out += `<span class="label">Packaged and branded</span>`;
  if (q.length < 3) out += hint('Keep typing to search the product database.');
  else if (online.q !== q || online.state === 'loading') out += `<div class="row" style="padding:10px 2px"><span class="spinner" style="width:22px;height:22px;border-width:3px"></span><span class="muted">Searching…</span></div>`;
  else if (online.state === 'error') out += hint(esc(online.msg));
  else if (!online.foods.length) out += hint('Nothing found. Try fewer words, or add it yourself under Quick add.');
  else out += `<div class="list">${online.foods.map((e, i) => row('pick-online', i, e, `${e.brand ? esc(e.brand) + ' · ' : ''}${fmt(e.kcal, 0)} kcal · ${esc(e.serving)}`, false)).join('')}</div>
<span class="muted small">Product data from Open Food Facts. Check it against the label.</span>`;
  return out;
}
function runOnlineSearch() {
  const q = add.q.trim().toLowerCase();
  clearTimeout(searchTimer);
  if (q.length < 3 || online.q === q) return;
  searchTimer = setTimeout(async () => {
    online = { q, state: 'loading', foods: [], msg: '' };
    try {
      const { body } = await api('/foods?q=' + encodeURIComponent(q));
      if (online.q !== q) return; // a newer search has started
      online = { q, state: 'done', foods: (body && body.foods) || [], msg: '' };
    } catch (e) {
      if (online.q !== q) return;
      online = { q, state: 'error', foods: [], msg: navigator.onLine === false ? 'You are offline, so only everyday foods and your own foods are searchable.' : e.message };
    }
    const l = document.getElementById('add-list'); if (l && add.tab === 'search' && add.q.trim().toLowerCase() === q) l.innerHTML = searchList();
  }, 450);
}

function addList() {
  const q = add.q.trim().toLowerCase(), match = n => !q || (n || '').toLowerCase().includes(q);
  if (add.tab === 'search') return searchList();
  if (add.tab === 'recent') {
    const list = recentFoods().filter(e => match(e.name));
    return list.length ? `<div class="list">${list.map(e => row('add-recent', e.id, e, `${fmt(kc(e), 0)} kcal · ${(e.qty ?? 1) !== 1 ? fmt(e.qty, 2) + ' × ' : ''}${esc(e.serving || 'serving')}`)).join('')}</div>`
      : hint(q ? 'No recent foods match.' : 'Foods you log show up here for one-tap logging next time.');
  }
  if (add.tab === 'mine') {
    const foods = state.foods.filter(e => match(e.name)).sort((a, b) => a.name.localeCompare(b.name));
    const meals = state.meals.filter(e => match(e.name));
    return `${meals.length ? `<span class="label">Saved meals</span><div class="list">${meals.map(m => `<div class="swipe"><button class="swipe-del" data-action="meal-del" data-id="${m.id}">Delete</button>
<div class="swipe-body" data-action="add-meal" data-k="${m.id}"><span class="col grow" style="gap:2px"><span class="sub ellip">${esc(m.name)}</span>
<span class="muted small">${m.items.length} items · ${fmt(m.items.reduce((a, e) => a + kc(e), 0), 0)} kcal</span></span><span class="v c-cyan">${icon.plus}</span></div></div>`).join('')}</div>` : ''}
<span class="label">My foods</span>
${foods.length ? `<div class="list">${foods.map(e => `<div class="swipe"><button class="swipe-del" data-action="myfood-del" data-id="${e.id}">Delete</button>
<div class="swipe-body" data-action="pick-mine" data-k="${e.id}"><span class="col grow" style="gap:2px"><span class="sub ellip">${esc(e.name)}</span>
<span class="muted small ellip">${fmt(e.kcal, 0)} kcal · ${esc(e.serving || 'serving')}</span></span><span class="muted">${icon.chevR}</span></div></div>`).join('')}</div>` : hint(q ? 'No saved foods match.' : 'Foods you scan or create are kept here. To save a meal, log two or more foods in it and tap “Save as a meal”.')}
<button class="btn ghost block" data-action="food-new">${icon.plus} Create a food</button>`;
  }
  return foodForm({ submit: 'quick-add', cta: `Add to ${add.meal}`, saveOption: true });
}

function foodForm({ submit, cta, v = {}, saveOption = false, qty = false, id = '' }) {
  const f = (name, label, mode, val, ph = '') => `<label class="field"><span>${label}</span><input type="text" name="${name}" inputmode="${mode}" value="${esc(val ?? '')}" placeholder="${ph}" autocomplete="off"></label>`;
  return `<form data-submit="${submit}" data-id="${id}" class="col" style="gap:12px">
${f('name', 'Name', 'text', v.name, saveOption ? 'optional' : 'e.g. Greek yogurt')}
<div class="grid2">${f('serving', 'Serving', 'text', v.serving, 'e.g. 1 cup')}${qty ? f('qty', 'Servings', 'decimal', v.qty ?? 1) : f('kcal', 'Calories', 'decimal', v.kcal, '0')}</div>
${qty ? f('kcal', 'Calories per serving', 'decimal', v.kcal, '0') : ''}
<div class="grid3">${f('p', 'Protein g', 'decimal', v.p, '0')}${f('c', 'Carbs g', 'decimal', v.c, '0')}${f('f', 'Fat g', 'decimal', v.f, '0')}</div>
${saveOption ? '<label class="check-row"><input type="checkbox" name="keep" value="1"> Also save to My foods</label>' : ''}
<button class="btn primary block" type="submit">${cta}</button></form>`;
}

const mealChips = (action, current) => `<div class="chips scroll">${MEALS.map(m => `<button class="chip${current === m ? ' on' : ''}" data-action="${action}" data-m="${m}">${m}</button>`).join('')}</div>`;
function addHtml() {
  return `<div class="sheet-head"><h2 class="sheet-title">Add food</h2>
<span class="row" style="gap:8px"><button class="icon-btn" data-action="food-scan" aria-label="Scan a barcode">${icon.scan}</button>
<button class="btn ghost sm" data-action="sheet-close">Done</button></span></div>
${mealChips('add-meal-pick', add.meal)}
<div class="seg">${TABS.map(([k, l]) => `<button class="${add.tab === k ? 'on' : ''}" data-action="add-tab" data-t="${k}">${l}</button>`).join('')}</div>
${add.tab === 'quick' ? '' : `<input type="search" data-input="add-q" value="${esc(add.q)}" placeholder="${add.tab === 'search' ? 'Search foods, e.g. banana or oat milk' : 'Filter'}" autocomplete="off" autocorrect="off" enterkeyhint="search" aria-label="Search foods">`}
<div id="add-list" class="col" style="gap:10px;min-height:44vh">${addList()}</div>`;
}

export function openAddFood(meal, date, tab) {
  beginAdd(meal, date);
  add.tab = tab || 'search'; add.q = '';
  openSheet(`<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col" id="add-wrap">${addHtml()}</div>`);
}
const refreshAdd = () => { const w = document.getElementById('add-wrap'); if (w) w.innerHTML = addHtml(); };
actions['food-add'] = el => openAddFood(el.dataset.meal, foodNav.date, el.dataset.tab);
actions['add-meal-pick'] = el => { add.meal = el.dataset.m; refreshAdd(); };
actions['add-tab'] = el => { add.tab = el.dataset.t; add.q = ''; refreshAdd(); };
inputs['add-q'] = el => {
  add.q = el.value;
  const l = document.getElementById('add-list'); if (l) l.innerHTML = addList();
  if (add.tab === 'search') runOnlineSearch();
};

const logged = name => { save('foodLog'); buzz(); toast(`Added ${name} to ${add.meal}`); nav.render(); };
actions['add-recent'] = el => { const e = state.foodLog.find(x => x.id === el.dataset.k); if (e) { logFood(e, add.meal, add.date); logged(e.name); refreshAdd(); } };
actions['add-meal'] = el => {
  const m = state.meals.find(x => x.id === el.dataset.k); if (!m) return;
  for (const it of m.items) logFood(it, add.meal, add.date);
  logged(m.name);
};
actions['meal-del'] = el => { state.meals = state.meals.filter(m => m.id !== el.dataset.id); save('meals'); refreshAdd(); };
actions['myfood-del'] = el => { state.foods = state.foods.filter(f => f.id !== el.dataset.id); save('foods'); refreshAdd(); toast('Food removed'); };

// ---------- choose how much: the serving sheet ----------
let srv = null;
function servingHtml() {
  const f = srv.food, q = srv.qty;
  return `<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col" id="srv-wrap"><div class="sheet-head"><h2 class="sheet-title">How much?</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<div class="col" style="gap:2px"><span class="title">${esc(f.name)}</span><span class="muted">${f.brand ? esc(f.brand) + ' · ' : ''}1 serving = ${esc(f.serving || '1 serving')}</span></div>
<div class="row" style="justify-content:center;gap:14px">
<button class="icon-btn" data-action="srv-step" data-d="-0.5" aria-label="Half a serving less" style="width:52px;height:52px;border-radius:26px">−</button>
<input type="text" inputmode="decimal" data-input="srv-qty" value="${q}" aria-label="Number of servings" style="width:112px;height:64px;font-size:28px;font-weight:700;text-align:center">
<button class="icon-btn" data-action="srv-step" data-d="0.5" aria-label="Half a serving more" style="width:52px;height:52px;border-radius:26px">${icon.plus}</button></div>
<section class="card pink" id="srv-tot" style="flex-direction:row;align-items:center;justify-content:space-between">${servingTotals()}</section>
${mealChips('srv-meal', add.meal)}
${srv.canSave ? `<label class="check-row"><input type="checkbox" id="srv-keep"${srv.keep ? ' checked' : ''}> Save to My foods</label>` : ''}
<button class="btn primary block" data-action="srv-add">Add to ${add.meal}</button></div>`;
}
const servingTotals = () => { const f = srv.food, q = srv.qty || 0; return `<span class="mid">${fmt(f.kcal * q, 0)}<span class="unit"> kcal</span></span><span class="muted" style="font-weight:700">${macroLine(f, q)}</span>`; };
function openServing(food, { canSave = false, keep = false } = {}) {
  srv = { food: { name: food.name, brand: food.brand || '', serving: food.serving || '', kcal: +food.kcal || 0, p: +food.p || 0, c: +food.c || 0, f: +food.f || 0 }, qty: 1, canSave, keep };
  openSheet(servingHtml());
}
inputs['srv-qty'] = el => { const n = num(el.value); srv.qty = n && n > 0 ? n : 0; const t = $('#srv-tot'); if (t) t.innerHTML = servingTotals(); };
actions['srv-step'] = el => {
  srv.qty = Math.max(0.5, Math.round(((srv.qty || 0) + +el.dataset.d) * 100) / 100);
  const k = $('#srv-keep'); if (k) srv.keep = k.checked;
  setSheet(servingHtml());
};
actions['srv-meal'] = el => { add.meal = el.dataset.m; const k = $('#srv-keep'); if (k) srv.keep = k.checked; setSheet(servingHtml()); };
actions['srv-add'] = () => {
  if (!srv.qty) return toast('Enter how many servings');
  const k = $('#srv-keep'), f = srv.food;
  if (srv.canSave && k && k.checked && !state.foods.some(x => x.name.toLowerCase() === f.name.toLowerCase())) {
    state.foods.push({ id: uid(), name: f.name, serving: f.serving, kcal: f.kcal, p: f.p, c: f.c, f: f.f }); save('foods');
  }
  logFood(f, add.meal, add.date, srv.qty);
  closeSheet(); logged(f.name); refreshAdd();
};
actions['pick-mine'] = el => { const e = state.foods.find(x => x.id === el.dataset.k); if (e) openServing(e); };
actions['pick-common'] = el => { const e = COMMON_FOODS[+el.dataset.k]; if (e) openServing(e); };
actions['pick-online'] = el => { const e = online.foods[+el.dataset.k]; if (e) openServing({ ...e, name: e.name }, { canSave: true, keep: true }); };

// ---------- barcode ----------
actions['food-scan'] = () => {
  if (!document.getElementById('add-wrap')) beginAdd(null, foodNav.date);
  openScanner(async (code, err) => {
    if (err) return toast(err);
    if (!code) return; // cancelled
    toast('Looking up…');
    let body = null;
    try { body = (await api('/food/' + code)).body; }
    catch (e) { return toast(navigator.onLine === false ? 'You are offline. Scanning needs a connection.' : e.message); }
    if (body && body.found) return openServing(body, { canSave: true, keep: true });
    toast('Not in the database yet. Add it from the label.');
    openSheet(`<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col"><div class="sheet-head"><h2 class="sheet-title">New food</h2><button class="link" data-action="sheet-close">Cancel</button></div>
${foodForm({ submit: 'food-create', cta: 'Save and add' })}</div>`);
  });
};

const readFood = v => ({ name: (v.name || '').trim(), serving: (v.serving || '').trim(), kcal: num(v.kcal) || 0, p: num(v.p) || 0, c: num(v.c) || 0, f: num(v.f) || 0 });
submits['quick-add'] = v => {
  const f = readFood(v);
  if (!f.kcal && !f.p && !f.c && !f.f) return toast('Enter calories or macros');
  if (!f.name) f.name = 'Quick add';
  logFood(f, add.meal, add.date, 1);
  if (v.keep && f.name !== 'Quick add' && !state.foods.some(x => x.name.toLowerCase() === f.name.toLowerCase())) { state.foods.push({ id: uid(), ...f }); save('foods'); }
  logged(f.name); refreshAdd();
};
actions['food-new'] = () => openSheet(`<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col"><div class="sheet-head"><h2 class="sheet-title">New food</h2><button class="link" data-action="sheet-close">Cancel</button></div>
${foodForm({ submit: 'food-create', cta: 'Save and add' })}</div>`);
submits['food-create'] = v => {
  const f = readFood(v);
  if (!f.name) return toast('Give the food a name');
  state.foods.push({ id: uid(), ...f }); save('foods');
  logFood(f, add.meal, add.date, 1);
  closeSheet(); logged(f.name); refreshAdd();
};

// ---------- photo and description (AI estimate) ----------
let ai = null; // { items: [{ name, serving, kcal, p, c, f, on }], note, thumb }
const wrapAi = html => `<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col" id="ai-wrap">${html}</div>`;
function aiReady() {
  if (isSignedIn() && config.ai) return true;
  openSheet(wrapAi(`<h2 class="sheet-title">${isSignedIn() ? 'Not switched on yet' : 'Sign in first'}</h2>
<p class="muted" style="font-size:15px;line-height:1.5">${isSignedIn()
    ? 'Photo and description estimates use an AI service that the app owner switches on in Settings, under App setup.'
    : 'Photo and description estimates run through your account. Create one or log in under Settings, then come back.'}</p>
<button class="btn primary block" data-action="ai-to-settings">Open Settings</button>
<button class="btn ghost block" data-action="sheet-close">Not now</button>`));
  return false;
}
actions['ai-to-settings'] = () => { closeSheet(); nav.go('settings'); };

actions['food-photo'] = () => {
  if (!aiReady()) return;
  beginAdd(null, foodNav.date);
  openSheet(wrapAi(`<div class="sheet-head"><h2 class="sheet-title">Snap your meal</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<span class="muted" style="line-height:1.5">Take a photo from above with the whole plate in view. You get an estimate you can adjust before it is logged.</span>
<label class="field"><span>Anything the photo can't show? (optional)</span><input type="text" id="ai-note" placeholder="e.g. cooked in olive oil, half portion" maxlength="200" autocomplete="off"></label>
<button class="btn primary block" data-action="ai-pick" data-src="meal-file">${icon.camera} Take a photo</button>
<button class="btn ghost block" data-action="ai-pick" data-src="meal-library">Choose from library</button>`));
};
actions['ai-pick'] = el => {
  const inp = document.getElementById(el.dataset.src), note = ($('#ai-note') || {}).value || '';
  inp.value = '';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    let img;
    try { img = await toJpeg(f, 1024, 0.8); } catch { return toast('Could not read that photo'); }
    runMealAi({ image: img.base64, text: note.trim() }, img.url);
  };
  inp.click();
};
actions['food-describe'] = () => {
  if (!aiReady()) return;
  beginAdd(null, foodNav.date);
  openSheet(wrapAi(`<div class="sheet-head"><h2 class="sheet-title">Describe it</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<form data-submit="ai-describe" class="col" style="gap:12px">
<textarea name="text" placeholder="e.g. two scrambled eggs, a slice of sourdough with butter and a latte" maxlength="600" aria-label="Describe what you ate"></textarea>
<button class="btn primary block" type="submit">Estimate</button></form>`));
  setTimeout(() => { const t = document.querySelector('#ai-wrap textarea'); if (t) t.focus(); }, 320);
};
submits['ai-describe'] = v => {
  const text = (v.text || '').trim();
  if (text.length < 3) return toast('Describe what you ate');
  runMealAi({ text }, null);
};

function toJpeg(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      const ctx = c.getContext('2d'); if (!ctx) { URL.revokeObjectURL(url); return reject(new Error('canvas')); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(url);
      resolve({ base64: data.slice(data.indexOf(',') + 1), url: data });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('read')); };
    img.src = url;
  });
}

async function runMealAi(payload, thumb) {
  setSheet(wrapAi(`<div class="col center" style="padding:36px 0;gap:14px"><span class="spinner"></span>
<span class="hand">${payload.image ? 'looking at your plate…' : 'working it out…'}</span><span class="muted">This takes a few seconds.</span></div>`));
  try {
    const { body } = await api('/ai/meal', { method: 'POST', body: JSON.stringify(payload) });
    ai = { items: (body.items || []).map(i => ({ ...i, on: true })), note: body.note || '', thumb };
  } catch (e) {
    if (!document.getElementById('ai-wrap')) return toast(e.message);
    return setSheet(wrapAi(`<h2 class="sheet-title">That didn't work</h2><p class="muted" style="font-size:15px;line-height:1.5">${esc(e.message)}</p>
<button class="btn ghost block" data-action="sheet-close">Close</button>`));
  }
  if (!document.getElementById('ai-wrap')) openSheet(aiHtml()); else setSheet(aiHtml());
}
function aiHtml() {
  const on = ai.items.filter(i => i.on), sum = k => on.reduce((a, i) => a + (i[k] || 0), 0);
  if (!ai.items.length) {
    return wrapAi(`<h2 class="sheet-title">Couldn't spot any food</h2><p class="muted" style="font-size:15px;line-height:1.5">${esc(ai.note || 'Try another photo with the plate in clear view, or describe the meal instead.')}</p>
<button class="btn ghost block" data-action="sheet-close">Close</button>`);
  }
  return wrapAi(`<div class="sheet-head"><h2 class="sheet-title">Here's my estimate</h2><button class="link" data-action="sheet-close">Cancel</button></div>
${ai.thumb ? `<img class="ai-thumb" src="${ai.thumb}" alt="Your meal photo">` : ''}
<div class="list">${ai.items.map((i, n) => `<div class="todo${i.on ? ' done' : ''}" style="border-bottom:1.5px dotted var(--line2)">
<button class="tick" data-action="ai-toggle" data-i="${n}" aria-label="Include ${esc(i.name)}" aria-pressed="${i.on}" style="border-color:var(--pink-d);${i.on ? 'background:var(--pink-d)' : ''}">${icon.check}</button>
<span class="col grow" style="gap:2px"><span class="sub" style="${i.on ? '' : 'opacity:.5'}">${esc(i.name)}</span><span class="muted small">${esc(i.serving)} · ${macroLine(i, 1)}</span></span>
<span class="sub" style="${i.on ? '' : 'opacity:.5'}">${fmt(i.kcal, 0)}</span></div>`).join('')}</div>
<section class="card pink" style="flex-direction:row;align-items:center;justify-content:space-between"><span class="mid">${fmt(sum('kcal'), 0)}<span class="unit"> kcal</span></span>
<span class="muted" style="font-weight:700">P ${fmt(sum('p'), 0)} · C ${fmt(sum('c'), 0)} · F ${fmt(sum('f'), 0)}</span></section>
${ai.note ? `<span class="muted" style="line-height:1.5">${esc(ai.note)}</span>` : ''}
${mealChips('ai-meal', add.meal)}
<button class="btn primary block" data-action="ai-add"${on.length ? '' : ' disabled'}>Add ${on.length} ${on.length === 1 ? 'item' : 'items'} to ${add.meal}</button>
<span class="muted small" style="text-align:center">An AI estimate, so treat it as a good guess. Tap any entry afterwards to adjust it.</span>`);
}
actions['ai-toggle'] = el => { const i = ai.items[+el.dataset.i]; if (i) { i.on = !i.on; setSheet(aiHtml()); } };
actions['ai-meal'] = el => { add.meal = el.dataset.m; setSheet(aiHtml()); };
actions['ai-add'] = () => {
  const on = ai.items.filter(i => i.on); if (!on.length) return;
  for (const i of on) logFood(i, add.meal, add.date, 1);
  save('foodLog'); closeSheet(); buzz(); nav.render();
  toast(`Added ${on.length} ${on.length === 1 ? 'item' : 'items'} to ${add.meal}`);
  ai = null;
};

// ---------- edit and delete log entries ----------
let editMeal = 'Breakfast';
const editHtml = e => `<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col" id="edit-wrap"><div class="sheet-head"><h2 class="sheet-title">Edit entry</h2><button class="link" data-action="sheet-close">Cancel</button></div>
${mealChips('edit-meal', editMeal)}
${foodForm({ submit: 'food-update', cta: 'Save', v: e, qty: true, id: e.id })}
<button class="btn danger block" data-action="food-del" data-id="${e.id}" data-close="1">Delete entry</button></div>`;
actions['food-edit'] = el => { const e = state.foodLog.find(x => x.id === el.dataset.id); if (!e) return; editMeal = e.meal; openSheet(editHtml(e)); };
actions['edit-meal'] = el => {
  editMeal = el.dataset.m;
  for (const c of document.querySelectorAll('#edit-wrap [data-action="edit-meal"]')) c.classList.toggle('on', c.dataset.m === editMeal);
};
submits['food-update'] = (v, form) => {
  const e = state.foodLog.find(x => x.id === form.dataset.id); if (!e) return closeSheet();
  const f = readFood(v), q = num(v.qty);
  Object.assign(e, f, { name: f.name || e.name, qty: q && q > 0 ? q : 1, meal: editMeal });
  save('foodLog'); closeSheet(); nav.render();
};
actions['food-del'] = el => {
  state.foodLog = state.foodLog.filter(e => e.id !== el.dataset.id);
  save('foodLog'); if (el.dataset.close) closeSheet(); nav.render(); toast('Entry deleted');
};

// ---------- save a logged meal for reuse ----------
let mealDraft = null;
actions['meal-save'] = el => {
  const items = state.foodLog.filter(e => e.date === foodNav.date && e.meal === el.dataset.meal);
  mealDraft = items.map(e => ({ name: e.name, serving: e.serving, kcal: e.kcal, p: e.p, c: e.c, f: e.f, qty: e.qty ?? 1 }));
  openSheet(`<div style="--accent:var(--pink-d);--soft:var(--pink-soft)" class="col"><h2 class="sheet-title">Save as a meal</h2>
<span class="muted">${items.length} items. Log them all again later in one tap.</span>
<form data-submit="meal-create" class="col" style="gap:12px"><label class="field"><span>Meal name</span><input type="text" name="name" placeholder="e.g. Usual breakfast" autocomplete="off"></label>
<button class="btn primary block" type="submit">Save meal</button></form>
<button class="btn ghost block" data-action="sheet-close">Cancel</button></div>`);
};
submits['meal-create'] = v => {
  const name = (v.name || '').trim();
  if (!name) return toast('Give the meal a name');
  state.meals.push({ id: uid(), name, items: mealDraft || [] }); save('meals');
  closeSheet(); toast('Meal saved');
};
