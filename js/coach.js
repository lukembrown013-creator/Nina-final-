// Coach: a chat with an AI helper that knows what is logged in the app and can do things
// in it (add a to-do, a calendar event, log food or weight, save a workout).
//
// PRIVACY RULE: this file must never import from oura.js or read its cache. Oura's API
// agreement does not allow Oura data to be sent to an AI model, so the snapshot built in
// buildContext() only ever contains things she typed or logged in this app herself.
import { state, save } from './store.js';
import { $, esc, uid, ymd, addDays, weekStart, fmt, KG_LB, sprig } from './util.js';
import { dayTotals, weightSeries, weeklyTrendChange, workoutSets, toDisp, wu, MEALS } from './calc.js';
import { LIBRARY } from './exercises.js';
import { actions, submits, nav, buzz, confirmSheet, icon } from './ui.js';
import { api, isSignedIn, config } from './sync.js';
import { addTodo, addEvent, todosFor } from './plan.js';
import { logFood } from './food.js';
import { planContext, targetsFor, logCardio, CARDIO_KINDS } from './program.js';

let busy = false, liveDid = [];
const IDEAS = ['Plan my week with me', 'What should I eat to hit my protein today?', 'Build me a 45-minute leg day', 'Add a to-do for tomorrow', 'How is my week going?'];
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// ---------- what the coach is told about her (never Oura data) ----------
function buildContext() {
  const s = state.settings, t = ymd(), now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = addDays(t, -i), x = dayTotals(d); if (x.n) days.push({ date: d, kcal: Math.round(x.kcal), protein: Math.round(x.p), carbs: Math.round(x.c), fat: Math.round(x.f) }); }
  const ws = weightSeries(), last = ws[ws.length - 1], ch = weeklyTrendChange(ws);
  const lifts = ex => ex.sets.length ? `${ex.name} ${ex.sets.map(x => `${x.kg ? fmt(toDisp(x.kg), 1) + 'x' : ''}${x.reps}`).join(', ')}` : ex.name;
  return {
    name: s.name || null,
    now: `${t} ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${now.toTimeString().slice(0, 5)}`,
    units: { weight: s.units, length: s.lenUnits },
    dailyTargets: (({ kcal, p, c, f }) => ({ kcal, protein: p, carbs: c, fat: f }))(targetsFor(t)),
    plan: planContext(t),
    cardioToday: state.cardio.filter(c => c.date === t).map(c => `${c.min} min ${c.kind}`),
    foodToday: state.foodLog.filter(e => e.date === t).map(e => ({ meal: e.meal, name: e.name, kcal: Math.round((e.kcal || 0) * (e.qty ?? 1)), protein: Math.round((e.p || 0) * (e.qty ?? 1)) })),
    nutritionLast7Days: days,
    weight: last ? { latest: +toDisp(last.kg).toFixed(1), trend: +toDisp(last.trend).toFixed(1), weeklyChange: ch == null ? null : +toDisp(ch).toFixed(1), unit: wu(), on: last.date } : null,
    workoutTemplates: state.templates.map(x => ({ name: x.name, days: x.days, exercises: x.exercises.map(e => e.name) })),
    recentWorkouts: [...state.workouts].sort((a, b) => b.start - a.start).slice(0, 5).map(w => ({ date: w.date, name: w.name, sets: workoutSets(w), lifts: w.exercises.slice(0, 8).map(lifts) })),
    workoutsThisWeek: state.workouts.filter(w => w.date >= weekStart()).length,
    todosToday: todosFor(t).map(x => ({ text: x.text, done: !!x.done, priority: !!x.star })),
    todosAnytime: state.todos.filter(x => !x.date && !x.done).slice(0, 15).map(x => x.text),
    upcomingEvents: state.events.filter(e => e.date >= t && e.date <= addDays(t, 14)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 15).map(e => ({ date: e.date, time: e.time || null, title: e.title })),
    habits: state.habits.map(h => ({ name: h.name, doneToday: state.habitLog.some(l => l.id === h.id && l.date === t) }))
  };
}

// ---------- things the coach can do in the app ----------
const TOOLS = {
  add_todo(a) {
    const t = addTodo(a.text, isDate(a.date) ? a.date : null, a.star);
    if (!t) throw new Error('The to-do text was empty.');
    return { say: `Added to-do: ${t.text}`, result: `Added${t.date ? ' for ' + t.date : ' to the anytime list'}.` };
  },
  add_event(a) {
    const e = addEvent(a.title, a.date, a.time);
    if (!e) throw new Error('An event needs a title and a date in YYYY-MM-DD form.');
    return { say: `Added to calendar: ${e.title}`, result: `Added on ${e.date}${e.time ? ' at ' + e.time : ''}.` };
  },
  log_food(a) {
    if (!a.name || !(a.kcal >= 0)) throw new Error('Food needs a name and calories.');
    const meal = MEALS.includes(a.meal) ? a.meal : 'Snacks', date = isDate(a.date) ? a.date : ymd();
    logFood({ name: String(a.name).slice(0, 80), serving: String(a.serving || '1 serving').slice(0, 40), kcal: Math.round(a.kcal), p: +a.p || 0, c: +a.c || 0, f: +a.f || 0 }, meal, date, 1);
    save('foodLog');
    return { say: `Logged ${a.name} (${Math.round(a.kcal)} kcal) to ${meal}`, result: `Logged to ${meal} on ${date}.` };
  },
  log_weight(a) {
    const v = Number(a.value);
    if (!(v > 0)) throw new Error('Weight must be a positive number.');
    const kg = a.unit === 'lb' ? v / KG_LB : v, date = isDate(a.date) ? a.date : ymd();
    if (kg < 25 || kg > 300) throw new Error('That weight looks out of range, so it was not saved.');
    const i = state.weights.findIndex(x => x.date === date);
    if (i >= 0) state.weights[i].kg = kg; else state.weights.push({ id: uid(), date, kg });
    save('weights');
    return { say: `Logged weight: ${fmt(v, 1)} ${a.unit}`, result: `Saved for ${date}.` };
  },
  log_cardio(a) {
    const kind = CARDIO_KINDS.includes(a.kind) ? a.kind : 'Zone 2', date = isDate(a.date) ? a.date : ymd();
    if (!logCardio(date, a.minutes, kind)) throw new Error('Cardio needs a number of minutes.');
    return { say: `Logged ${Math.round(a.minutes)} min ${kind.toLowerCase()}`, result: `Logged on ${date}.` };
  },
  create_workout(a) {
    const name = String(a.name || '').trim().slice(0, 40), list = Array.isArray(a.exercises) ? a.exercises : [];
    if (!name || !list.length) throw new Error('A workout needs a name and at least one exercise.');
    const known = [...LIBRARY, ...state.customExercises];
    const exercises = list.slice(0, 14).map(e => {
      const want = String(e.name || '').trim().slice(0, 50);
      const hit = known.find(k => k.name.toLowerCase() === want.toLowerCase());
      if (!hit && want) { const c = { name: want, muscle: 'Other', equip: 'Custom' }; state.customExercises.push(c); known.push(c); }
      const reps = parseInt(String(e.reps || '').split(/[^0-9]/).filter(Boolean).pop(), 10); // "8-10" -> 10
      return { name: hit ? hit.name : want, sets: Math.min(8, Math.max(1, Math.round(e.sets) || 3)), reps: reps > 0 ? reps : null };
    }).filter(e => e.name);
    const days = (Array.isArray(a.days) ? a.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    state.templates.push({ id: uid(), name, days, exercises });
    save('templates', 'customExercises');
    return { say: `Saved workout: ${name}`, result: `Saved "${name}" with ${exercises.length} exercises to the Train tab.` };
  }
};

// ---------- conversation ----------
// The stored chat is plain text. For the API it becomes alternating user/assistant turns.
function history() {
  const out = [];
  for (const m of state.chat.slice(-16)) {
    const role = m.role === 'me' ? 'user' : 'assistant';
    const text = m.text + (m.did && m.did.length ? `\n(Done in the app: ${m.did.join('; ')})` : '');
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + text;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
async function ask() {
  let msgs = history();
  const texts = []; liveDid = [];
  for (let turn = 0; turn < 6; turn++) {
    const { body } = await api('/ai/chat', { method: 'POST', body: JSON.stringify({ messages: msgs, context: buildContext() }) });
    const content = body.content || [];
    for (const c of content) if (c.type === 'text' && c.text.trim()) texts.push(c.text.trim());
    const calls = content.filter(c => c.type === 'tool_use');
    if (!calls.length || body.stop_reason !== 'tool_use') break;
    const results = calls.map(c => {
      try {
        const fn = TOOLS[c.name]; if (!fn) throw new Error('Unknown action.');
        const r = fn(c.input || {});
        liveDid.push(r.say);
        return { type: 'tool_result', tool_use_id: c.id, content: r.result };
      } catch (e) { return { type: 'tool_result', tool_use_id: c.id, content: e.message || 'That did not work.', is_error: true }; }
    });
    msgs = [...msgs, { role: 'assistant', content }, { role: 'user', content: results }];
    paint(); // show the "done" chips as they happen
  }
  return { text: texts.join('\n\n') || (liveDid.length ? 'Done.' : 'Sorry, I lost my train of thought. Try again?'), did: liveDid };
}

async function send(text) {
  text = String(text || '').trim().slice(0, 1500);
  if (!text || busy) return;
  state.chat.push({ role: 'me', text, ts: Date.now() });
  busy = true; paint(true);
  try {
    const r = await ask();
    state.chat.push({ role: 'ai', text: r.text, did: r.did, ts: Date.now() });
    if (r.did.length) { buzz(15); nav.render(); }
  } catch (e) {
    state.chat.push({ role: 'ai', text: e.message || 'Something went wrong.', err: true, ts: Date.now() });
  }
  state.chat = state.chat.filter(m => !m.err || m === state.chat[state.chat.length - 1]).slice(-80);
  busy = false; liveDid = [];
  save('chat'); paint(true);
}

// ---------- screen ----------
function bodyHtml() {
  if (!isSignedIn() || !config.ai) {
    return `<div class="msgs"><section class="card tint center" style="margin-top:8vh;gap:12px;padding:26px 18px">
<span style="color:var(--blue)">${sprig(72)}</span><span class="hand" style="font-size:30px">${isSignedIn() ? 'almost ready' : 'say hello to your coach'}</span>
<span class="muted" style="line-height:1.55;max-width:280px">${isSignedIn()
      ? 'The coach uses an AI service that the app owner switches on in Settings, under App setup.'
      : 'Ask for a plan, a meal idea or a workout, and have it add things to your lists. It runs through your account, so create one or log in first.'}</span>
<button class="btn primary" data-action="coach-settings">Open Settings</button></section></div>`;
  }
  const msgs = state.chat.map(m => m.role === 'me' ? `<div class="msg me">${esc(m.text)}</div>`
    : `${(m.did || []).map(d => `<span class="did">${icon.check}${esc(d)}</span>`).join('')}<div class="msg ${m.err ? 'err' : 'ai'}">${esc(m.text)}</div>`).join('');
  const empty = `<section class="card tint center" style="margin-top:4vh;gap:10px;padding:24px 18px">
<span style="color:var(--blue)">${sprig(64)}</span><span class="hand" style="font-size:30px">hi${state.settings.name ? ' ' + esc(state.settings.name.toLowerCase()) : ''}, what's up?</span>
<span class="muted" style="line-height:1.55;max-width:290px">I can see what you've logged here and help you plan, eat and train. I can also add to-dos, calendar events, food and workouts for you.</span></section>
<div class="col" style="gap:8px;align-items:flex-start;margin-top:6px">${IDEAS.map(i => `<button class="chip" data-action="coach-idea" style="white-space:normal;text-align:left;min-height:40px;padding:8px 14px">${esc(i)}</button>`).join('')}</div>`;
  return `<div class="msgs" id="coach-msgs">${state.chat.length ? msgs : empty}
${busy ? `${liveDid.map(d => `<span class="did">${icon.check}${esc(d)}</span>`).join('')}<div class="msg ai typing" aria-label="Coach is typing"><i></i><i></i><i></i></div>` : ''}</div>
<div class="coach-foot"><form data-submit="coach-send" class="add-row">
<textarea name="text" id="coach-in" rows="1" placeholder="Ask your coach" maxlength="1500" enterkeyhint="send" aria-label="Message your coach"></textarea>
<button class="btn primary" type="submit" aria-label="Send"${busy ? ' disabled' : ''}>${icon.send}</button></form>
<span class="muted small" style="text-align:center">AI can get things wrong. Not medical advice.</span></div>`;
}
function paint(scroll) {
  const el = $('#coach'); if (!el || el.hidden) return;
  const draft = ($('#coach-in') || {}).value || '', focused = document.activeElement && document.activeElement.id === 'coach-in';
  el.innerHTML = `<header class="coach-head"><button class="icon-btn" data-action="coach-close" aria-label="Close coach">${icon.chevD}</button>
<h2 class="grow">coach</h2>
${state.chat.length ? `<button class="icon-btn" data-action="coach-clear" aria-label="Clear conversation">${icon.trash}</button>` : ''}</header>${bodyHtml()}`;
  const inp = $('#coach-in'); if (inp) { inp.value = draft; if (focused) inp.focus(); }
  const m = $('#coach-msgs'); if (m && (scroll || busy)) m.scrollTop = m.scrollHeight;
}
export function openCoach(prefill) {
  $('#coach').hidden = false; paint(true);
  if (prefill) send(prefill);
}
actions['coach-open'] = () => openCoach();
actions['coach-close'] = () => { $('#coach').hidden = true; $('#coach').innerHTML = ''; nav.render(); };
actions['coach-settings'] = () => { actions['coach-close'](); nav.go('settings'); };
actions['coach-idea'] = el => send(el.textContent);
actions['coach-clear'] = () => confirmSheet({ title: 'Clear this conversation?', text: 'The coach starts fresh. Anything it added to your lists stays.', ok: 'Clear' }, () => { state.chat = []; save('chat'); paint(true); });
submits['coach-send'] = (v, form) => { if (busy) return; const t = (v.text || '').trim(); if (!t) return; form.elements.text.value = ''; send(t); };
// Enter sends, Shift+Enter makes a new line (on a hardware keyboard).
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.id === 'coach-in' && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); }
});
