// Home: today at a glance.
import { state, save, hasData } from './store.js';
import { esc, fmt, ymd, addDays, weekStart, ring, spark, DAYS, sprig, num } from './util.js';
import { dayTotals, weightSeries, weeklyTrendChange, weekWorkouts, workoutSets, todaysTemplate, activityMap, toDisp, wu } from './calc.js';
import { actions, submits, nav, openSheet, closeSheet, toast, icon } from './ui.js';
import { todosFor, todoRow, addRow } from './plan.js';
import { ouraDay, readinessAdvice, oura } from './oura.js';
import { isSignedIn, config } from './sync.js';
import { plan, targetsFor, stepGoalFor, planDay, weightAvgKg, lbToKg } from './program.js';
import { planBanner, sessionCard, cardioTile, yogaMorningCard, checkinPrompt } from './road.js';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '');
const isStandalone = () => navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

function nutritionCard(t) {
  const tot = dayTotals(t), tg = targetsFor(t);
  if (tg.type === 'off') return '';
  const pct = tg.kcal ? tot.kcal / tg.kcal : 0, left = tg.kcal ? tg.kcal - tot.kcal : null;
  const macro = (label, val, target, color) => `<div class="col">
<span class="muted small" style="font-weight:700">${label}</span>
<span class="sub"><span data-count="${Math.round(val)}">${fmt(val, 0)}</span><span class="unit"> ${target ? '/ ' + fmt(target, 0) + ' g' : 'g'}</span></span>
<div class="bar"><i data-w="${target ? Math.min(100, (val / target) * 100).toFixed(1) : val ? 100 : 0}" style="background:${color}"></i></div></div>`;
  return `<section class="card lg tint tape press" data-action="tab" data-tab="food">
<div class="row" style="gap:18px">
${ring({ size: 124, pct, main: tg.kcal ? Math.round(pct * 100) + '%' : fmt(tot.kcal, 0), sub: tg.kcal ? 'of goal' : 'kcal', label: 'Calories today' })}
<div class="col grow" style="gap:4px">
<span class="label">Nutrition</span>
<span class="big" data-count="${Math.round(tot.kcal)}">${fmt(tot.kcal, 0)}</span>
${tg.kcal
    ? `<span class="muted">of ${fmt(tg.kcal, 0)} kcal</span><span style="font-size:13px;font-weight:700;color:var(--blue-d)">${left >= 0 ? fmt(left, 0) + ' left' : fmt(-left, 0) + ' over'}</span>`
    : `<span class="muted">kcal today</span><button class="link" data-action="tab" data-tab="settings">Set a goal</button>`}
</div></div>
<div class="grid3">${macro('Protein', tot.p, tg.p, '#6E89A8')}${macro('Carbs', tot.c, tg.c, '#D9A29A')}${macro(tg.fatMin ? `Fat (min ${tg.fatMin})` : 'Fat', tot.f, tg.f, '#D9BC6A')}</div></section>`;
}

// Steps come from Oura when it is connected, otherwise from what she types in.
function stepsCard(t) {
  const o = ouraDay(t), manual = state.steps.find(s => s.date === t);
  const n = o && o.steps != null ? o.steps : manual ? manual.n : null, goal = stepGoalFor(t);
  const fromOura = !!(o && o.steps != null);
  return `<section class="card stat press" data-action="${fromOura ? 'steps-info' : 'steps-log'}" style="--accent:var(--sage-d);--soft:var(--sage-soft)">
<div class="row between"><span class="ico">${icon.steps}</span><span class="muted small" style="font-weight:700">${fromOura ? 'Oura' : n != null ? 'typed in' : ''}</span></div>
<span class="label">Steps</span>
<span class="mid">${n != null ? `<span data-count="${n}">${fmt(n, 0)}</span>` : '–'}</span>
${goal ? `<div class="bar"><i data-w="${n ? Math.min(100, (n / goal) * 100).toFixed(1) : 0}" style="background:var(--sage)"></i></div><span class="muted small">of ${fmt(goal, 0)}</span>`
    : `<span class="muted small">${n != null ? 'today' : fromOura ? 'syncing' : 'Tap to add'}</span>`}</section>`;
}
function readinessCard(t) {
  // Shows the most recent score from the last two days (Oura posts it after she opens its app).
  const day = [t, addDays(t, -1)].map(d => ({ d, o: ouraDay(d) })).find(x => x.o && x.o.readiness != null);
  if (!day) {
    return `<section class="card stat"><div class="row between"><span class="ico">${icon.moon}</span><span class="muted small" style="font-weight:700">Oura</span></div>
<span class="label">Readiness</span><span class="mid">–</span><span class="muted small">Open the Oura app to sync</span></section>`;
  }
  const a = readinessAdvice(day.o.readiness);
  return `<section class="card stat ${a.tone} press" data-action="readiness-info" data-d="${day.d}">
<div class="row between"><span class="ico" style="background:var(--card)">${icon.moon}</span><span class="muted small" style="font-weight:700">${day.d === t ? 'Oura' : 'yesterday'}</span></div>
<span class="label">Readiness</span>
<span class="mid"><span data-count="${day.o.readiness}">${day.o.readiness}</span></span>
<span class="muted small" style="font-weight:700">${a.word}</span></section>`;
}
function weekCard() {
  const ws = weekWorkouts(), sets = ws.reduce((a, w) => a + workoutSets(w), 0);
  return `<section class="card stat press" data-action="tab" data-tab="train"><div class="row between"><span class="ico">${icon.lift}</span></div>
<span class="label">This week</span>
<span class="mid"><span data-count="${ws.length}">${ws.length}</span><span class="unit"> ${ws.length === 1 ? 'workout' : 'workouts'}</span></span>
<span class="muted small">${sets ? fmt(sets, 0) + ' sets logged' : 'Nothing logged yet'}</span></section>`;
}
function weightCard() {
  const s = weightSeries();
  if (!s.length) {
    return `<section class="card stat press" data-action="weight-log" style="--accent:var(--pink-d);--soft:var(--pink-soft)"><div class="row between"><span class="ico">${icon.scale}</span></div>
<span class="label">Weight</span><span class="mid">–</span><span class="muted small">Tap to log</span></section>`;
  }
  const last = s[s.length - 1], ch = weeklyTrendChange(s);
  const pd = planDay(ymd());
  if (pd) { // her plan counts the 7-day average (off days left out), against this week's target
    const avg = weightAvgKg(ymd()), tgt = pd.week && pd.week.target != null ? toDisp(lbToKg(pd.week.target)) : null;
    return `<section class="card stat press" data-action="road-open" style="--accent:var(--pink-d);--soft:var(--pink-soft)"><div class="row between"><span class="ico">${icon.scale}</span>
<button class="link" data-action="weight-log" style="min-height:34px">${icon.plus} Log</button></div>
<span class="label">7-day average</span>
<span class="mid">${avg == null ? '–' : `<span data-count="${toDisp(avg).toFixed(1)}" data-dp="1">${fmt(toDisp(avg), 1)}</span>`}<span class="unit"> ${wu()}</span></span>
<span class="muted small">${tgt != null ? `target ${fmt(tgt, 1)} this week` : 'skip the scale this week'}</span></section>`;
  }
  const chTxt = ch == null ? 'Trend builds as you log' : `${ch > 0 ? '+' : ch < 0 ? '−' : ''}${fmt(Math.abs(toDisp(ch)), 1)} this week`;
  return `<section class="card stat press" data-action="tab" data-tab="progress" style="--accent:var(--pink-d);--soft:var(--pink-soft)"><div class="row between"><span class="ico">${icon.scale}</span>
<span style="width:74px">${spark(s.slice(-30).map(x => x.trend), '#C98F87')}</span></div>
<span class="label">Weight trend</span>
<span class="mid"><span data-count="${toDisp(last.trend).toFixed(1)}" data-dp="1">${fmt(toDisp(last.trend), 1)}</span><span class="unit"> ${wu()}</span></span>
<span class="muted small">${chTxt}</span></section>`;
}

function workoutCard(t) {
  const aw = state.activeWorkout;
  let body;
  if (aw) {
    body = `<div class="col grow"><span class="label">Workout in progress</span><span class="title ellip">${esc(aw.name)}</span></div>
<button class="btn primary" data-action="wk-resume">Resume</button>`;
  } else {
    const done = state.workouts.filter(w => w.date === t), tpl = todaysTemplate();
    if (done.length) {
      const w = done[done.length - 1];
      body = `<div class="col grow"><span class="label c-teal">Done today</span><span class="title ellip">${esc(w.name)}</span>
<span class="muted">${workoutSets(w)} sets logged</span></div>
<button class="btn ghost" data-action="tab" data-tab="train">View</button>`;
    } else if (tpl) {
      body = `<div class="col grow"><span class="label">Today's workout</span><span class="title ellip">${esc(tpl.name)}</span>
<span class="muted">${tpl.exercises.length} ${tpl.exercises.length === 1 ? 'exercise' : 'exercises'}</span></div>
<button class="btn primary" data-action="wk-start" data-id="${tpl.id}">Start</button>`;
    } else if (state.templates.length) {
      body = `<div class="col grow"><span class="label">Training</span><span class="title">Nothing planned today</span>
<span class="muted">Pick any workout, or rest.</span></div>
<button class="btn ghost" data-action="tab" data-tab="train">Choose</button>`;
    } else {
      body = `<div class="col grow"><span class="label">Training</span><span class="title">Build your first workout</span>
<span class="muted">Save it once, start it in one tap.</span></div>
<button class="btn primary" data-action="tpl-new">Create</button>`;
    }
  }
  return `<section class="card" style="flex-direction:row;align-items:center;justify-content:space-between">${body}</section>`;
}

function todoCard(t) {
  const list = todosFor(t), open = list.filter(x => !x.done).length, show = list.slice(0, 5);
  return `<section class="card dashed"><div class="row between"><span class="hand">to-do today</span>
<button class="link" data-action="tab" data-tab="plan">${list.length > show.length ? `All ${list.length}` : 'Plan'} ${icon.chevR}</button></div>
${show.length ? `<div class="list" style="box-shadow:none">${show.map(x => todoRow(x, t)).join('')}</div>` : ''}
${list.length && !open ? `<span class="muted" style="font-weight:700;color:var(--sage-d)">All done for today.</span>` : ''}
${addRow(t, 'home', 'Add a to-do')}</section>`;
}

function coachCard() {
  return `<button class="card tint coach-card press" data-action="coach-open"><span class="coach-face">${icon.sparkle}</span>
<span class="col grow" style="gap:2px"><span class="sub">Ask your coach</span><span class="muted">Meal ideas, a plan for the week, a new workout</span></span>
<span style="color:var(--blue-d)">${icon.chevR}</span></button>`;
}

function weekDots(t) {
  const act = activityMap(), ws = weekStart(t);
  let active = 0;
  const cells = DAYS.map((n, i) => {
    const d = addDays(ws, i), lvl = act[d] || 0;
    if (d <= t && lvl) active++;
    return `<span class="${d > t ? 'future' : lvl ? 'l' + lvl : ''}${d === t ? ' today' : ''}">${n[0]}<i>${lvl && d <= t ? icon.check : ''}</i></span>`;
  }).join('');
  return `<section class="card"><div class="row between"><span class="hand">this week</span><span class="muted small">${active} active ${active === 1 ? 'day' : 'days'}</span></div>
<div class="week-dots" role="img" aria-label="${active} active days this week">${cells}</div></section>`;
}

function nudges() {
  const s = state.settings;
  let out = '';
  if (isIos() && !isStandalone() && !s.installDismissed) {
    out += `<section class="card butter"><span class="sub">Add to your Home Screen</span>
<span class="muted" style="line-height:1.5">In Safari, tap the Share button, then “Add to Home Screen”. The app then opens full screen like any other app.</span>
<button class="link" data-action="install-dismiss">Got it</button></section>`;
  }
  if (!isSignedIn() && hasData() && state.foodLog.length + state.workouts.length + state.weights.length + state.todos.length >= 8) {
    out += `<section class="card butter"><span class="sub">Keep your data safe</span>
<span class="muted" style="line-height:1.5">Right now everything lives only on this phone. Create an account in Settings to back it up automatically.</span>
<button class="btn ghost sm" data-action="tab" data-tab="settings">Open Settings</button></section>`;
  }
  return out;
}

export function renderHome() {
  const s = state.settings, t = ymd(), hide = s.hide || {}, now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const hr = now.getHours(), greet = hr < 12 ? 'good morning' : hr < 18 ? 'good afternoon' : 'good evening';
  const showReady = oura.connected && config.oura && !hide.readiness;
  const hasPlan = !!planDay(t);
  const tiles = [hide.steps ? '' : stepsCard(t), showReady ? readinessCard(t) : '', hide.weight ? '' : weightCard(), hasPlan ? cardioTile(t) : '', hide.week || hasPlan ? '' : weekCard()].filter(Boolean);
  let grid = '';
  for (let i = 0; i < tiles.length; i += 2) grid += tiles[i + 1] ? `<div class="grid2">${tiles[i]}${tiles[i + 1]}</div>` : tiles[i];
  return `<header class="head"><div class="col" style="gap:4px"><span class="eyebrow">${esc(dateStr)}</span><h1>${greet}${s.name ? ', ' + esc(s.name.toLowerCase()) : ''}</h1></div>
<div class="row" style="gap:8px"><button class="icon-btn" data-action="coach-open" aria-label="Ask your coach">${icon.sparkle}</button>
<button class="icon-btn" data-action="tab" data-tab="settings" aria-label="Settings">${icon.gear}</button></div></header>
${planBanner(t)}
${yogaMorningCard(t)}
${hide.nutrition ? '' : nutritionCard(t)}
${grid}
${hide.workout ? '' : sessionCard(t) || workoutCard(t)}
${checkinPrompt(t)}
${hide.todo ? '' : todoCard(t)}
${hide.coach ? '' : coachCard()}
${hide.calendar ? '' : weekDots(t)}
${nudges()}`;
}

actions['install-dismiss'] = () => { state.settings.installDismissed = true; save('settings'); nav.render(); };

// ---------- steps ----------
actions['steps-log'] = () => {
  const t = ymd(), cur = state.steps.find(s => s.date === t);
  openSheet(`<div class="col" style="--accent:var(--sage-d);--soft:var(--sage-soft)"><div class="sheet-head"><h2 class="sheet-title">Steps today</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<span class="muted" style="line-height:1.5">${config.oura && isSignedIn() ? 'Connect your Oura ring in Settings and this fills in by itself.' : 'Type in today\'s count from your watch or phone. Once Oura is connected in Settings, this fills in by itself.'}</span>
<form data-submit="steps-save" class="col" style="gap:12px">
<label class="field"><span>Steps</span><input type="text" name="n" inputmode="numeric" value="${cur ? cur.n : ''}" placeholder="0" autocomplete="off" style="height:64px;font-size:28px;font-weight:700;text-align:center"></label>
<button class="btn primary block" type="submit">Save</button></form></div>`);
};
submits['steps-save'] = v => {
  const n = num(String(v.n || '').replace(/[,\s]/g, '')), t = ymd();
  if (n == null || n < 0 || n > 200000) return toast('Enter a step count');
  state.steps = state.steps.filter(s => s.date !== t);
  if (n > 0) state.steps.push({ date: t, n: Math.round(n) });
  save('steps'); closeSheet(); nav.render(); toast('Steps saved');
};
actions['steps-info'] = () => {
  const t = ymd(), rows = [];
  for (let i = 0; i < 7; i++) { const d = addDays(t, -i), o = ouraDay(d); if (o && o.steps != null) rows.push([d, o.steps]); }
  const max = Math.max(1, ...rows.map(r => r[1]), state.settings.stepGoal || 0);
  openSheet(`<div class="col" style="--accent:var(--sage-d);--soft:var(--sage-soft)"><div class="sheet-head"><h2 class="sheet-title">Steps this week</h2><button class="link" data-action="sheet-close">Close</button></div>
<section class="card">${rows.map(([d, n]) => `<div class="row"><span class="muted" style="width:44px;font-weight:700">${d === t ? 'Today' : DAYS[(new Date(d + 'T12:00').getDay() + 6) % 7]}</span>
<div class="bar grow" style="height:10px;border-radius:5px"><i data-w="${((n / max) * 100).toFixed(0)}" style="background:var(--sage);border-radius:5px"></i></div><span class="sub" style="width:58px;text-align:right">${fmt(n, 0)}</span></div>`).join('')}</section>
<span class="muted small">From your Oura ring. It updates when the Oura app syncs.</span></div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const b of document.querySelectorAll('#sheet-root .bar > i[data-w]')) b.style.width = b.dataset.w + '%'; }));
};
actions['readiness-info'] = el => {
  const o = ouraDay(el.dataset.d); if (!o) return;
  const a = readinessAdvice(o.readiness);
  openSheet(`<div class="col"><div class="sheet-head"><h2 class="sheet-title">Readiness</h2><button class="link" data-action="sheet-close">Close</button></div>
<section class="card ${a.tone}"><div class="row" style="gap:16px"><span class="big">${o.readiness}</span><div class="col"><span class="title">${a.word}</span><span class="muted" style="line-height:1.45">${a.text}</span></div></div></section>
<div class="grid2"><section class="card stat"><span class="label">Sleep score</span><span class="mid">${o.sleep ?? '–'}</span></section>
<section class="card stat"><span class="label">Activity score</span><span class="mid">${o.activity ?? '–'}</span></section></div>
<span class="muted small" style="line-height:1.5">Scores come straight from your Oura ring. The note above is a simple rule of thumb based on the score, a nudge rather than an instruction. How you feel counts for more.</span></div>`);
};
