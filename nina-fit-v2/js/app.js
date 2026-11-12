// App entry: boot, navigation, global event wiring, quick-add menu, welcome tour.
import { state, load, save } from './store.js';
import { $, $$, esc, ymd, sprig } from './util.js';
import { actions, inputs, submits, nav, openSheet, closeSheet, closeAllSheets, sheetOpen, initGestures, animateIn, swipedRecently, toast, icon } from './ui.js';
import { renderHome } from './home.js';
import { renderPlan, openQuickTodo, openEventSheet, planNav } from './plan.js';
import { renderTrain } from './train.js';
import { renderFood, openAddFood, shiftFoodDay, foodNav } from './food.js';
import { renderProgress } from './progress.js';
import { renderSettings } from './settings.js';
import { renderWorkout, initWorkout } from './workout.js';
import { openCoach } from './coach.js';
import { pullIfNewer, loadConfig } from './sync.js';
import { refreshOura } from './oura.js';

const views = { home: renderHome, plan: renderPlan, train: renderTrain, food: renderFood, progress: renderProgress, settings: renderSettings };

nav.render = (enter = false) => {
  const v = $('#view');
  if (!views[nav.tab]) nav.tab = 'home';
  const top = v.scrollTop;
  // Keep what is being typed (and the cursor) when a screen redraws underneath it.
  const act = document.activeElement, keep = act && v.contains(act) && act.id ? { id: act.id, value: act.value } : null;
  document.body.dataset.area = nav.tab;
  v.innerHTML = views[nav.tab]();
  if (enter) {
    v.scrollTop = 0; document.body.classList.remove('fab-away');
    v.classList.remove('view-in'); void v.offsetWidth; v.classList.add('view-in');
  } else {
    v.scrollTop = top;
    if (keep) { const el = document.getElementById(keep.id); if (el && !enter) { el.value = keep.value; el.focus(); } }
  }
  for (const t of $$('#tabbar .tab')) {
    const on = t.dataset.tab === nav.tab;
    t.classList.toggle('on', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  }
  animateIn(v, enter);
};

actions['tab'] = el => {
  const tab = el.dataset.tab;
  closeAllSheets();
  if (tab === 'food' && nav.tab !== 'food') foodNav.date = ymd();
  if (tab === 'plan' && nav.tab !== 'plan') { planNav.date = ymd(); planNav.month = ymd().slice(0, 8) + '01'; }
  if (tab === nav.tab) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; }
  nav.go(tab);
};

// ---------- quick add (the + button) ----------
actions['quick'] = () => {
  if (sheetOpen()) return closeAllSheets();
  const aw = state.activeWorkout;
  openSheet(`<h2 class="sheet-title">quick add</h2>
<div class="quick">
<button data-action="q-food"><span class="p">${icon.food}</span>Log food</button>
<button data-action="q-todo"><span>${icon.list}</span>To-do</button>
<button data-action="q-workout"><span class="s">${icon.lift}</span>${aw ? 'Resume workout' : 'Start workout'}</button>
<button data-action="q-event"><span class="p">${icon.cal}</span>Calendar event</button>
<button data-action="q-weight"><span class="b">${icon.scale}</span>Log weight</button>
<button data-action="q-coach"><span>${icon.sparkle}</span>Ask coach</button>
</div>
<button class="link" data-action="q-meas" style="align-self:center">Log body measurements</button>`);
};
actions['q-food'] = () => { closeSheet(); openAddFood(); };
actions['q-todo'] = () => { closeSheet(); openQuickTodo(); };
actions['q-event'] = () => { closeSheet(); openEventSheet(nav.tab === 'plan' ? planNav.date : ymd()); };
actions['q-coach'] = () => { closeSheet(); openCoach(); };
actions['q-weight'] = () => { closeSheet(); actions['weight-log']({ dataset: {} }); };
actions['q-meas'] = () => { closeSheet(); actions['meas-log'](); };
actions['q-workout'] = () => {
  closeSheet();
  if (state.activeWorkout) return actions['wk-resume']();
  if (!state.templates.length) return actions['wk-start']({ dataset: {} });
  openSheet(`<h2 class="sheet-title">start workout</h2>
<div class="list">${state.templates.map(t => `<button class="item press" data-action="wk-start" data-id="${t.id}"><span class="col grow"><span class="sub ellip">${esc(t.name)}</span>
<span class="muted small">${t.exercises.length} exercises</span></span><span class="c-violet">${icon.chevR}</span></button>`).join('')}</div>
<button class="btn ghost block" data-action="wk-start">Empty workout</button>`);
};

// ---------- welcome tour ----------
const STEPS = [
  { h: 'welcome', p: 'Your planner, food diary, training log and progress in one place, made just for you.', art: 'sprig' },
  { h: 'one button adds anything', p: 'Tap the round + to log food, add a to-do, start a workout or put something on your calendar. Most things take three taps or fewer.', art: 'plus' },
  { h: 'a coach in your pocket', p: 'Ask for a meal idea, a plan for the week or a new workout. Snap a photo of your plate and it estimates the calories for you.', art: 'sparkle' },
  { h: 'yours to shape', p: 'Goals, units and what shows on your home screen are all in Settings. Nothing is fixed, and there are no streaks to break.', art: 'heart' }
];
const ART = {
  sprig: () => `<span style="display:flex;gap:6px;align-items:flex-end">${sprig(120)}${sprig(150, true)}</span>`,
  plus: () => `<span style="width:132px;height:132px;border-radius:66px;background:var(--btn);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 0 #435B7A,0 22px 40px rgba(79,102,130,.3)"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>`,
  sparkle: () => `<span style="width:150px;height:150px;border-radius:44px;background:var(--tint);border:2px solid var(--tint2);display:flex;align-items:center;justify-content:center;transform:rotate(-4deg);box-shadow:0 6px 0 var(--tint2)"><span style="display:flex;transform:scale(3.4);color:var(--blue-d)">${icon.sparkle}</span></span>`,
  heart: () => `<span style="width:150px;height:150px;border-radius:75px;background:var(--pink-soft);border:2px dashed var(--pink);display:flex;align-items:center;justify-content:center"><span style="display:flex;transform:scale(3.4);color:var(--pink-d)">${icon.heart}</span></span>`
};
let step = 0;
function renderIntro() {
  const el = $('#intro'), s = STEPS[step], last = step === STEPS.length - 1;
  el.hidden = false;
  el.innerHTML = `<div class="intro-art">${ART[s.art]()}</div>
<div class="intro-body">
<div class="dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
<h1>${s.h}${step === 0 && state.settings.name ? ', ' + esc(state.settings.name.toLowerCase()) : ''}</h1><p>${s.p}</p>
<button class="btn primary block" data-action="intro-next" style="margin-top:10px">${last ? 'Get started' : 'Next'}</button>
${last ? '' : '<button class="link" data-action="intro-skip" style="align-self:center;color:var(--muted)">Skip</button>'}</div>`;
}
function endIntro() { $('#intro').hidden = true; $('#intro').innerHTML = ''; state.settings.onboarded = true; save('settings'); }
actions['intro-next'] = () => { if (step < STEPS.length - 1) { step++; renderIntro(); } else endIntro(); };
actions['intro-skip'] = endIntro;
actions['intro-replay'] = () => { step = 0; renderIntro(); };

// ---------- global event wiring ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (swipedRecently() && el.closest('.swipe-body')) return; // a swipe just ended on this row
  const fn = actions[el.dataset.action];
  if (fn) fn(el, e);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el, e);
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target, fn = submits[form.dataset.submit];
  if (fn) fn(Object.fromEntries(new FormData(form)), form);
});
// Select the whole number when a numeric field is focused, so typing replaces it.
document.addEventListener('focusin', e => {
  const el = e.target;
  if (el.matches && el.matches('input[inputmode=decimal],input[inputmode=numeric]')) setTimeout(() => { try { el.select(); } catch { /* ignore */ } }, 0);
});
// Keep bottom sheets and the coach above the on-screen keyboard.
if (window.visualViewport) {
  const setVvh = () => document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
  window.visualViewport.addEventListener('resize', setVvh); setVvh();
}

// The + button tucks away while scrolling down or typing, so it never sits on top of a button.
let lastTop = 0;
$('#view').addEventListener('scroll', () => {
  const top = $('#view').scrollTop, d = top - lastTop;
  if (Math.abs(d) < 6) return;
  document.body.classList.toggle('fab-away', d > 0 && top > 40);
  lastTop = top;
}, { passive: true });
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches('#view input, #view textarea')) document.body.classList.add('fab-away'); });
document.addEventListener('focusout', e => { if (e.target.matches && e.target.matches('#view input, #view textarea')) document.body.classList.remove('fab-away'); });

const quiet = () => !sheetOpen() && $('#coach').hidden; // nothing open that a redraw would disturb
async function refreshRemote(forceOura = false) {
  const applied = await pullIfNewer().catch(() => false);
  await loadConfig();
  const changed = await refreshOura(forceOura);
  if ((applied || changed) && quiet()) nav.render();
}
// Refresh when the app comes back to the foreground.
let lastDay = ymd();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (ymd() !== lastDay) { lastDay = ymd(); foodNav.date = lastDay; planNav.date = lastDay; if (quiet()) nav.render(); }
  refreshRemote();
});

async function boot() {
  await load();
  initGestures({ onPageSwipe: d => { if (nav.tab === 'food') shiftFoodDay(d); } });
  nav.render(true);
  renderWorkout();
  $('#workout').hidden = true; // an unfinished workout stays minimized until resumed
  initWorkout();
  if (!state.settings.onboarded) { step = 0; renderIntro(); }
  // Coming back from Oura's sign-in page.
  const back = new URLSearchParams(location.search).get('oura');
  if (back) {
    history.replaceState(null, '', location.pathname);
    toast(back === 'connected' ? 'Oura connected' : back === 'denied' ? 'Oura was not connected' : 'Oura could not be connected. Try again.');
  }
  refreshRemote(!!back); // account sync, feature switches and Oura, without holding up the first screen
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When an updated version takes over, reload once so the new screens show straight away.
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded && quiet() && !state.activeWorkout) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot().catch(err => {
  console.error(err);
  $('#view').innerHTML = `<section class="card"><span class="sub">Something went wrong starting the app</span><span class="muted">${esc(err && err.message)}</span></section>`;
});
