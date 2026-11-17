// Plan tab: month calendar, the day's events and to-dos, an anytime list, weekly habits, day notes.
import { state, save } from './store.js';
import { esc, uid, ymd, addDays, weekStart, parseYmd, dow, DAYS, monthStart, addMonths, monthLabel, longDate, niceDate, niceTime, fmt, sprig } from './util.js';
import { dayTotals } from './calc.js';
import { actions, inputs, submits, nav, openSheet, setSheet, closeSheet, toast, buzz, celebrate, icon } from './ui.js';
import { plan, specialDay, dayType } from './program.js';
import { planDayCard, checkinSummary, phaseColor } from './road.js';

export const planNav = { date: ymd(), month: monthStart(ymd()) };

// ---------- to-dos ----------
const sortTodos = (a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (b.star ? 1 : 0) - (a.star ? 1 : 0) || (a.ts || 0) - (b.ts || 0);
// What belongs on a given day's list. Today also carries over anything unfinished from earlier days.
export function todosFor(date) {
  const t = ymd();
  return state.todos.filter(x => x.date && (x.date === date || (date === t && x.date < t && !x.done))).sort(sortTodos);
}
const anytime = () => state.todos.filter(x => !x.date).sort(sortTodos);

export function todoRow(t, viewDate) {
  const from = viewDate && t.date && t.date < viewDate ? `<span class="muted small">from ${niceDate(t.date)}</span>` : '';
  return `<div class="swipe"><button class="swipe-del" data-action="todo-del" data-id="${t.id}">Delete</button>
<div class="swipe-body todo${t.done ? ' done' : ''}">
<button class="tick" data-action="todo-toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.text)}" aria-pressed="${!!t.done}">${icon.check}</button>
<button class="col grow" data-action="todo-edit" data-id="${t.id}" style="gap:2px"><span class="todo-text">${esc(t.text)}</span>${from}</button>
<button class="star${t.star ? ' on' : ''}" data-action="todo-star" data-id="${t.id}" aria-label="${t.star ? 'Remove from top priorities' : 'Make a top priority'}" aria-pressed="${!!t.star}">${icon.star}</button>
</div></div>`;
}
export function addRow(date, key, placeholder) {
  return `<form data-submit="todo-add" class="add-row"><input type="hidden" name="date" value="${date || ''}">
<input type="text" name="text" id="todo-in-${key}" placeholder="${placeholder}" enterkeyhint="done" autocomplete="off" maxlength="140" aria-label="${placeholder}">
<button class="btn primary" type="submit" aria-label="Add to-do">${icon.plus}</button></form>`;
}
export function addTodo(text, date, star = false) {
  text = String(text || '').trim().slice(0, 140);
  if (!text) return null;
  const t = { id: uid(), text, done: false, doneAt: null, date: date || null, star: !!star, ts: Date.now() };
  state.todos.push(t); save('todos');
  return t;
}
submits['todo-add'] = (v, form) => {
  const inp = form.querySelector('input[name=text]'), id = inp && inp.id;
  if (!addTodo(v.text, v.date)) return;
  buzz(); nav.render();
  requestAnimationFrame(() => { const el = id && document.getElementById(id); if (el) el.focus(); }); // keep typing the next one
};
actions['todo-toggle'] = el => {
  const t = state.todos.find(x => x.id === el.dataset.id); if (!t) return;
  t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
  save('todos'); nav.render();
  if (!t.done) return;
  buzz(15);
  const list = todosFor(ymd());
  if (t.date && list.length >= 2 && list.every(x => x.done) && list.includes(t)) { celebrate(); toast('Everything ticked off today'); }
};
actions['todo-star'] = el => {
  const t = state.todos.find(x => x.id === el.dataset.id); if (!t) return;
  t.star = !t.star; save('todos'); nav.render();
};
actions['todo-del'] = el => {
  state.todos = state.todos.filter(x => x.id !== el.dataset.id);
  save('todos'); if (el.dataset.close) closeSheet(); nav.render(); toast('To-do deleted');
};

let editDate = null;
function todoEditHtml(t) {
  const today = ymd(), tom = addDays(today, 1);
  const chip = (label, val) => `<button type="button" class="chip${editDate === val ? ' on' : ''}" data-action="todo-edit-date" data-d="${val || ''}" data-id="${t.id}">${label}</button>`;
  return `<div class="col" id="todo-edit"><div class="sheet-head"><h2 class="sheet-title">Edit to-do</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<form data-submit="todo-save" data-id="${t.id}" class="col" style="gap:12px">
<label class="field"><span>To-do</span><input type="text" name="text" value="${esc(t.text)}" maxlength="140" autocomplete="off"></label>
<div class="field"><span>When</span><div class="chips">${chip('Today', today)}${chip('Tomorrow', tom)}${chip('Anytime', null)}</div></div>
<label class="field"><span>Or pick a day</span><input type="date" name="date" value="${editDate || ''}"></label>
<button class="btn primary block" type="submit">Save</button></form>
<button class="btn danger block" data-action="todo-del" data-id="${t.id}" data-close="1">Delete</button></div>`;
}
actions['todo-edit'] = el => { const t = state.todos.find(x => x.id === el.dataset.id); if (!t) return; editDate = t.date || null; openSheet(todoEditHtml(t)); };
actions['todo-edit-date'] = el => {
  const t = state.todos.find(x => x.id === el.dataset.id); if (!t) return;
  const form = document.querySelector('#todo-edit form'), text = form ? form.elements.text.value : t.text;
  editDate = el.dataset.d || null;
  setSheet(todoEditHtml({ ...t, text }));
};
submits['todo-save'] = (v, form) => {
  const t = state.todos.find(x => x.id === form.dataset.id); if (!t) return closeSheet();
  const text = (v.text || '').trim();
  if (!text) return toast('Write what needs doing');
  t.text = text.slice(0, 140); t.date = v.date || null;
  save('todos'); closeSheet(); nav.render();
};

// Used by the + button: a quick to-do for today without leaving the screen you are on.
let quickWhen = 'today';
export function openQuickTodo() {
  quickWhen = 'today';
  openSheet(`<div class="col"><div class="sheet-head"><h2 class="sheet-title">New to-do</h2><button class="link" data-action="sheet-close">Done</button></div>
<form data-submit="todo-quick" class="col" style="gap:12px">
<input type="text" name="text" placeholder="What needs doing?" maxlength="140" autocomplete="off" enterkeyhint="done" aria-label="To-do">
<div class="seg"><button type="button" class="on" data-action="quick-when" data-w="today">Today</button>
<button type="button" data-action="quick-when" data-w="tomorrow">Tomorrow</button><button type="button" data-action="quick-when" data-w="anytime">Anytime</button></div>
<button class="btn primary block" type="submit">Add</button></form></div>`);
  setTimeout(() => { const i = document.querySelector('[data-submit="todo-quick"] input[name=text]'); if (i) i.focus(); }, 320);
}
actions['quick-when'] = el => {
  quickWhen = el.dataset.w;
  for (const b of el.closest('.seg').querySelectorAll('button')) b.classList.toggle('on', b === el);
};
submits['todo-quick'] = (v, form) => {
  const date = quickWhen === 'today' ? ymd() : quickWhen === 'tomorrow' ? addDays(ymd(), 1) : null;
  if (!addTodo(v.text, date)) return toast('Write what needs doing');
  form.elements.text.value = ''; buzz(); nav.render(); toast('Added');
  form.elements.text.focus();
};

// ---------- calendar events ----------
const eventsOn = date => state.events.filter(e => e.date === date).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
export function addEvent(title, date, time = '') {
  title = String(title || '').trim().slice(0, 100);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const e = { id: uid(), title, date, time: /^\d{2}:\d{2}$/.test(time || '') ? time : '' };
  state.events.push(e); save('events');
  return e;
}
function eventSheet(e) {
  const isNew = !e.id;
  return `<div class="col"><div class="sheet-head"><h2 class="sheet-title">${isNew ? 'Add to calendar' : 'Edit event'}</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<form data-submit="event-save" data-id="${e.id || ''}" class="col" style="gap:12px">
<label class="field"><span>What</span><input type="text" name="title" value="${esc(e.title || '')}" placeholder="e.g. Pilates class" maxlength="100" autocomplete="off"></label>
<div class="grid2"><label class="field"><span>Day</span><input type="date" name="date" value="${e.date}"></label>
<label class="field"><span>Time (optional)</span><input type="time" name="time" value="${e.time || ''}"></label></div>
<button class="btn primary block" type="submit">${isNew ? 'Add' : 'Save'}</button></form>
${isNew ? '' : `<button class="btn danger block" data-action="event-del" data-id="${e.id}">Delete</button>`}</div>`;
}
export function openEventSheet(date) { openSheet(eventSheet({ date: date || planNav.date })); }
actions['event-add'] = el => openEventSheet(el.dataset.date);
actions['event-edit'] = el => { const e = state.events.find(x => x.id === el.dataset.id); if (e) openSheet(eventSheet(e)); };
submits['event-save'] = (v, form) => {
  const title = (v.title || '').trim();
  if (!title) return toast('Give it a name');
  if (!v.date) return toast('Pick a day');
  const e = state.events.find(x => x.id === form.dataset.id);
  if (e) { Object.assign(e, { title: title.slice(0, 100), date: v.date, time: v.time || '' }); save('events'); }
  else addEvent(title, v.date, v.time);
  planNav.date = v.date; planNav.month = monthStart(v.date);
  closeSheet(); nav.render(); toast(e ? 'Saved' : 'Added to your calendar');
};
actions['event-del'] = el => { state.events = state.events.filter(x => x.id !== el.dataset.id); save('events'); closeSheet(); nav.render(); toast('Event deleted'); };

// ---------- habits ----------
const HABIT_IDEAS = ['Hydrate', 'Move', 'Stretch', 'Read', 'Vitamins', 'Lights out by 11'];
const habitDone = (id, date) => state.habitLog.some(h => h.id === id && h.date === date);
actions['habit-toggle'] = el => {
  const { id, date } = el.dataset;
  if (habitDone(id, date)) state.habitLog = state.habitLog.filter(h => !(h.id === id && h.date === date));
  else { state.habitLog.push({ id, date }); buzz(12); }
  save('habitLog'); nav.render();
};
function habitManageHtml() {
  const have = new Set(state.habits.map(h => h.name.toLowerCase()));
  const ideas = HABIT_IDEAS.filter(n => !have.has(n.toLowerCase()));
  return `<div class="col"><div class="sheet-head"><h2 class="sheet-title">Habits</h2><button class="link" data-action="sheet-close">Done</button></div>
<span class="muted">Little things to tick off each day. Keep it to a handful.</span>
${state.habits.length ? `<div class="list">${state.habits.map(h => `<div class="item"><span class="sub ellip grow">${esc(h.name)}</span>
<button class="icon-btn" style="color:var(--danger)" data-action="habit-del" data-id="${h.id}" aria-label="Remove ${esc(h.name)}">${icon.trash}</button></div>`).join('')}</div>` : ''}
<form data-submit="habit-add" class="add-row"><input type="text" name="name" placeholder="New habit" maxlength="30" autocomplete="off" aria-label="New habit">
<button class="btn primary" type="submit" aria-label="Add habit">${icon.plus}</button></form>
${ideas.length ? `<div class="chips">${ideas.map(n => `<button class="chip" data-action="habit-idea" data-n="${esc(n)}">${icon.plus} ${esc(n)}</button>`).join('')}</div>` : ''}</div>`;
}
function addHabit(name) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) return;
  if (state.habits.some(h => h.name.toLowerCase() === name.toLowerCase())) return toast('You already have that one');
  if (state.habits.length >= 8) return toast('Eight habits is plenty. Remove one first.');
  state.habits.push({ id: uid(), name }); save('habits');
  setSheet(habitManageHtml()); nav.render();
}
actions['habit-manage'] = () => openSheet(habitManageHtml());
actions['habit-idea'] = el => addHabit(el.dataset.n);
submits['habit-add'] = v => addHabit(v.name);
actions['habit-del'] = el => {
  state.habits = state.habits.filter(h => h.id !== el.dataset.id);
  state.habitLog = state.habitLog.filter(h => h.id !== el.dataset.id);
  save('habits', 'habitLog'); setSheet(habitManageHtml()); nav.render();
};
export function habitsCard(date) {
  if (!state.habits.length) {
    return `<section class="card dashed center" style="gap:8px"><span class="hand">habits</span>
<span class="muted" style="max-width:260px;line-height:1.5">Track a few small daily things, like hydrate or stretch.</span>
<button class="btn soft sm" data-action="habit-manage">${icon.plus} Add habits</button></section>`;
  }
  const ws = weekStart(date), today = ymd();
  return `<section class="card"><div class="row between"><span class="hand">habits</span><button class="link" data-action="habit-manage">Edit</button></div>
<div class="habits">${state.habits.map(h => `<div class="habit"><span class="habit-name ellip">${esc(h.name)}</span><div class="habit-days">${DAYS.map((n, i) => {
    const d = addDays(ws, i), on = habitDone(h.id, d);
    return `<button class="${on ? 'on' : ''}${d === today ? ' now' : ''}" data-action="habit-toggle" data-id="${h.id}" data-date="${d}" aria-label="${esc(h.name)}, ${n}" aria-pressed="${on}"${d > today ? ' disabled' : ''}>${n[0]}</button>`;
  }).join('')}</div></div>`).join('')}</div></section>`;
}

// ---------- notes ----------
const noteFor = date => (state.notes.find(n => n.date === date) || {}).text || '';
inputs['note'] = el => {
  const date = el.dataset.date, text = el.value.slice(0, 2000);
  const n = state.notes.find(x => x.date === date);
  if (n) n.text = text; else state.notes.push({ date, text });
  state.notes = state.notes.filter(x => x.text.trim());
  save('notes');
};

// ---------- the screen ----------
function calendarHtml() {
  const m = planNav.month, today = ymd();
  const first = weekStart(m), last = addDays(addMonths(m, 1), -1), weeks = Math.ceil((dow(m) + parseYmd(last).getDate()) / 7);
  const ev = new Set(state.events.map(e => e.date)), wk = new Set(state.workouts.map(w => w.date));
  const td = new Set(state.todos.filter(t => t.date && !t.done).map(t => t.date));
  const hasPlan = !!plan();
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(first, i), out = d.slice(0, 7) !== m.slice(0, 7);
    const dots = (ev.has(d) ? '<i class="p"></i>' : '') + (td.has(d) ? '<i></i>' : '') + (wk.has(d) ? '<i class="s"></i>' : '');
    const pc = hasPlan && !out ? phaseColor(d) : null, sd = hasPlan ? specialDay(d) : null, ty = pc ? dayType(d) : 'track';
    const mark = ty === 'off' ? ' m-off' : ty === 'treat' ? ' m-treat' : sd && sd.type === 'checkin' ? ' m-check' : '';
    cells += `<button class="${out ? 'out ' : ''}${pc ? 'ph ph-' + pc + ' ' : ''}${mark} ${d === today ? 'today ' : ''}${d === planNav.date ? 'sel' : ''}" data-action="plan-day" data-d="${d}" aria-label="${longDate(d)}"${d === planNav.date ? ' aria-current="date"' : ''}>${parseYmd(d).getDate()}<span class="dots">${dots}</span></button>`;
  }
  return `<section class="card lg tape">
<div class="row between"><button class="icon-btn" data-action="plan-month" data-d="-1" aria-label="Previous month">${icon.chevL}</button>
<span class="hand" style="font-size:28px">${monthLabel(m)}</span>
<button class="icon-btn" data-action="plan-month" data-d="1" aria-label="Next month">${icon.chevR}</button></div>
<div class="mcal-head">${DAYS.map(d => `<span>${d}</span>`).join('')}</div>
<div class="mcal">${cells}</div>
<div class="row" style="gap:14px;justify-content:center;flex-wrap:wrap"><span class="muted small row" style="gap:5px"><i style="width:7px;height:7px;border-radius:4px;background:var(--pink-d)"></i>event</span>
<span class="muted small row" style="gap:5px"><i style="width:7px;height:7px;border-radius:4px;background:var(--blue)"></i>to-do</span>
<span class="muted small row" style="gap:5px"><i style="width:7px;height:7px;border-radius:4px;background:var(--sage-d)"></i>workout</span>${hasPlan ? `<span class="muted small row" style="gap:5px"><i class="key-off"></i>off</span><span class="muted small row" style="gap:5px"><i class="key-treat"></i>treat</span><span class="muted small row" style="gap:5px"><i class="key-check"></i>check-in</span>` : ''}</div></section>`;
}

export function renderPlan() {
  const date = planNav.date, today = ymd();
  const events = eventsOn(date), todos = todosFor(date), any = anytime();
  const done = state.workouts.filter(w => w.date === date), tot = dayTotals(date);
  const planned = date >= today ? state.templates.find(t => (t.days || []).includes(dow(date))) : null;
  const pills = [
    ...done.map(w => `<span class="pill" style="--accent:var(--sage-d);--soft:var(--sage-soft)">Workout: ${esc(w.name)}</span>`),
    !done.length && planned ? `<span class="pill">Planned: ${esc(planned.name)}</span>` : '',
    tot.n ? `<span class="pill" style="--accent:var(--pink-d);--soft:var(--pink-soft)">${fmt(tot.kcal, 0)} kcal logged</span>` : ''
  ].filter(Boolean).join('');
  const openCount = todos.filter(t => !t.done).length;

  return `<header class="head"><h1>plan</h1>
${date === today ? '' : `<button class="chip on" data-action="plan-today" style="min-height:44px">Back to today</button>`}
<span class="deco" style="right:${date === today ? 0 : 132}px;top:-4px">${sprig(58)}</span></header>
${calendarHtml()}
<div class="sec-head"><h2>${date === today ? 'today' : esc(longDate(date).toLowerCase())}</h2>
<button class="link" data-action="event-add" data-date="${date}">${icon.plus} Event</button></div>
${planDayCard(date)}
${pills ? `<div class="chips">${pills}</div>` : ''}
${events.length ? `<div class="list">${events.map(e => `<button class="event press" data-action="event-edit" data-id="${e.id}">
${e.time ? `<span class="event-time">${niceTime(e.time)}</span>` : `<span class="event-time" style="background:var(--tint);color:var(--blue-d)">all day</span>`}
<span class="sub ellip grow">${esc(e.title)}</span><span class="muted">${icon.chevR}</span></button>`).join('')}</div>` : ''}
<section class="card"><div class="row between"><span class="hand">to-do</span>
<span class="muted small">${todos.length ? (openCount ? `${openCount} to go` : 'all done') : 'nothing yet'}</span></div>
${todos.length ? `<div class="list" style="box-shadow:none">${todos.map(t => todoRow(t, date)).join('')}</div>` : ''}
${addRow(date, 'day', date === today ? 'Add a to-do for today' : 'Add a to-do for this day')}</section>
<section class="card"><div class="row between"><span class="hand">anytime list</span><span class="muted small">no date</span></div>
${any.length ? `<div class="list" style="box-shadow:none">${any.map(t => todoRow(t)).join('')}</div>` : ''}
${addRow('', 'any', 'Add something for whenever')}</section>
${habitsCard(date)}
${checkinSummary(date)}
<section class="card"><span class="hand">notes</span>
<textarea data-input="note" data-date="${date}" placeholder="Anything to remember about this day" maxlength="2000" aria-label="Notes for this day">${esc(noteFor(date))}</textarea></section>`;
}

actions['plan-day'] = el => { planNav.date = el.dataset.d; planNav.month = monthStart(el.dataset.d); nav.render(); };
actions['plan-month'] = el => { planNav.month = addMonths(planNav.month, +el.dataset.d); nav.render(); };
actions['plan-today'] = () => { planNav.date = ymd(); planNav.month = monthStart(ymd()); nav.render(); };
export function shiftPlanDay(d) { planNav.date = addDays(planNav.date, d); planNav.month = monthStart(planNav.date); nav.render(true); }
