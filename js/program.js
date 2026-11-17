// A loaded training plan (e.g. "Road to 120"): dated phases, weekly targets, special days,
// the weekly split, check-in questions and personal rules. The plan arrives as a file she
// loads in Settings and is stored in her own data, so nothing personal ships with the app.
//
// PRIVACY RULE: this file must not import oura.js. coach.js imports this file, and Oura data
// may never reach the AI. Callers that want Oura steps pass them in (see weekStats).
import { state, save } from './store.js';
import { ymd, addDays, weekStart, dow, uid, KG_LB } from './util.js';

export const plan = () => (state.plan && Array.isArray(state.plan.phases) ? state.plan : null);
export const lbToKg = lb => (lb == null ? null : lb / KG_LB);
const kgToLb = kg => (kg == null ? null : kg * KG_LB);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);

export function phaseOn(date) {
  const p = plan(); if (!p) return null;
  return p.phases.find(x => date >= x.start && (!x.end || date <= x.end)) || null;
}
export const weekOn = date => { const p = plan(); return p ? (p.weeks || []).find(w => w.start === weekStart(date)) || null : null; };
export function weekNumber(date) {
  const p = plan(); if (!p || date < p.start) return null;
  return Math.floor(daysBetween(weekStart(p.start), weekStart(date)) / 7) + 1;
}
export const specialDay = date => { const p = plan(); return p ? (p.days || []).find(d => d.date === date) || null : null; };
// 'track' (a normal tracked day), 'off' (not tracked, left out of averages) or 'treat' (tracked, higher calories).
export function dayType(date) {
  const o = (state.dayTypes || []).find(d => d.date === date);
  if (o) return o.type;
  const s = specialDay(date);
  return s && (s.type === 'off' || s.type === 'treat') ? s.type : 'track';
}
export function setDayType(date, type) {
  state.dayTypes = (state.dayTypes || []).filter(d => d.date !== date);
  const s = specialDay(date), def = s && (s.type === 'off' || s.type === 'treat') ? s.type : 'track';
  if (type !== def) state.dayTypes.push({ date, type });
  save('dayTypes');
}
export const isOff = date => !!plan() && dayType(date) === 'off';

function phaseKcal(ph, date) {
  if (ph.kcal) return ph.kcal;
  if (ph.reverse) { // add calories each week from the phase start, up to a ceiling
    const wk = Math.floor(daysBetween(ph.start, date) / 7) + 1;
    return Math.min(ph.reverse.max, ph.reverse.from + ph.reverse.step * wk);
  }
  return null;
}
// Everything the plan says about one day. Null outside the plan's dates.
export function planDay(date) {
  const p = plan(); if (!p || date < p.start) return null;
  const ph = phaseOn(date); if (!ph) return null;
  const wk = weekOn(date), sd = specialDay(date), type = dayType(date);
  const kcal = type === 'off' ? (sd && sd.kcal) || p.maintenance || null
    : type === 'treat' ? (sd && sd.type === 'treat' && sd.kcal) || p.treatKcal || null
    : phaseKcal(ph, date);
  const pr = ph.p ?? p.rules?.protein ?? null, fat = ph.f ?? p.rules?.fatMin ?? null;
  const carbs = kcal && pr != null && fat != null ? Math.max(0, Math.round((kcal - pr * 4 - fat * 9) / 4)) : null;
  return {
    date, type, special: sd, phase: ph, week: wk, weekN: weekNumber(date),
    kcal, p: pr, f: fat, c: carbs, fatMin: p.rules?.fatMin ?? null,
    steps: (wk && wk.steps) || ph.steps || null, cardioGoal: wk && wk.cardio != null ? wk.cardio : ph.cardio ?? null,
    session: (p.split || []).find(s => s.dow === dow(date)) || null
  };
}
// Daily nutrition goals: from the plan when one covers the day, otherwise from Settings.
export function targetsFor(date) {
  const d = planDay(date);
  if (d && d.kcal) return { kcal: d.kcal, p: d.p, c: d.c, f: d.f, fatMin: d.fatMin, fromPlan: true, type: d.type };
  const t = state.settings.targets || {};
  return { kcal: t.kcal, p: t.p, c: t.c, f: t.f, fatMin: null, fromPlan: false, type: 'track' };
}
export const stepGoalFor = date => { const d = planDay(date); return (d && d.steps) || state.settings.stepGoal || null; };

// ---------- cardio ----------
export const CARDIO_KINDS = ['Zone 2', 'Incline walk', 'Other cardio', 'Hot yoga'];
const countsAsCardio = c => c.kind !== 'Hot yoga'; // her rule: hot yoga doesn't count as cardio
export const cardioOn = date => (state.cardio || []).filter(c => c.date === date);
export function cardioMinutes(ws) {
  const end = addDays(ws, 6);
  return (state.cardio || []).filter(c => c.date >= ws && c.date <= end && countsAsCardio(c)).reduce((a, c) => a + (c.min || 0), 0);
}
export function logCardio(date, min, kind) {
  min = Math.round(Number(min) || 0);
  if (min <= 0 || min > 600) return null;
  const c = { id: uid(), date, min, kind: CARDIO_KINDS.includes(kind) ? kind : 'Zone 2' };
  state.cardio.push(c); save('cardio');
  return c;
}

// ---------- averages (off days never count) ----------
export function weightAvgKg(endDate, days = 7) {
  const start = addDays(endDate, -(days - 1));
  const ws = state.weights.filter(w => w.date >= start && w.date <= endDate && !isOff(w.date));
  return ws.length ? ws.reduce((a, w) => a + w.kg, 0) / ws.length : null;
}
// One plan week, so far. stepsOf(date) lets the caller supply steps (e.g. from Oura).
export function weekStats(ws, { totals, stepsOf } = {}) {
  const today = ymd(), end = addDays(ws, 6), last = end < today ? end : today;
  const weights = [], kcals = [], steps = [];
  for (let d = ws; d <= last; d = addDays(d, 1)) {
    if (isOff(d)) continue;
    const w = state.weights.find(x => x.date === d); if (w) weights.push(w.kg);
    if (totals) { const t = totals(d); if (t.n) kcals.push(t.kcal); }
    const st = stepsOf ? stepsOf(d) : null; if (st != null) steps.push(st);
  }
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { start: ws, end, done: end < today, avgKg: avg(weights), weighIns: weights.length, avgKcal: avg(kcals), kcalDays: kcals.length, avgSteps: avg(steps), cardio: cardioMinutes(ws) };
}

// ---------- gentle nudges from her own adjustment rules ----------
export function planNudges(totals) {
  const p = plan(); if (!p) return [];
  const out = [], today = ymd();
  const done = (p.weeks || []).filter(w => w.target != null && addDays(w.start, 6) < today).slice(-2);
  const behind = w => { const s = weekStats(w.start, { totals }); return s.weighIns >= 3 && kgToLb(s.avgKg) > w.target + 0.3; };
  if (done.length === 2 && done.every(behind)) out.push({ tone: 'butter', title: 'Two weeks behind target', text: (p.adjust && p.adjust.behind) || 'Cut about 100 calories OR add about 20 minutes of zone 2 a week. Not both.' });
  const late = p.adjust && p.adjust.late;
  if (late && today >= late.date && today <= addDays(late.date, 6)) {
    const avg = kgToLb(weightAvgKg(today));
    if (avg != null && avg >= late.weight) out.push({ tone: 'butter', title: 'Check-in: push the date, not the diet', text: late.text });
  }
  // Two Sundays in a row with a "no" on period or on mood/energy: her rule is to eat more, not less.
  const sundays = (state.checkins || []).filter(c => c.sunday).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  if (sundays.length === 2 && sundays.every(c => c.sunday.period === 'no' || c.sunday.steady === 'no')) {
    out.push({ tone: 'pink', title: 'Time to eat a bit more', text: (p.adjust && p.adjust.raise) || 'Raise calories toward maintenance for now.' });
  }
  return out;
}

// ---------- loading a plan file ----------
export function validPlan(obj) {
  const p = obj && obj.plan;
  return !!(obj && obj.app === 'nina-fit' && obj.kind === 'plan' && p && p.name && p.start && Array.isArray(p.phases) && p.phases.length);
}
export function loadPlan(obj) {
  const p = obj.plan;
  state.plan = p;
  if (p.profile && p.profile.name && (!state.settings.name || state.settings.name === 'Nina')) state.settings.name = p.profile.name;
  if (p.weightUnit === 'lb' || p.weightUnit === 'kg') state.settings.units = p.weightUnit;
  // Days she logged before she had the app.
  for (const l of p.log || []) {
    if (l.weight && !state.weights.some(w => w.date === l.date)) state.weights.push({ id: uid(), date: l.date, kg: p.weightUnit === 'kg' ? l.weight : lbToKg(l.weight) });
    if (l.steps && !state.steps.some(s => s.date === l.date)) state.steps.push({ date: l.date, n: l.steps });
    if (l.kcal && !state.foodLog.some(e => e.date === l.date)) {
      state.foodLog.push({ id: uid(), date: l.date, meal: 'Snacks', name: 'Day total (logged before the app)', serving: '1 day', kcal: l.kcal, p: 0, c: 0, f: 0, qty: 1, unit: 'serving', amt: 1, ts: Date.parse(l.date + 'T20:00:00') });
    }
  }
  save('plan', 'settings', 'weights', 'steps', 'foodLog');
}
export function removePlan() { state.plan = null; save('plan'); }

// ---------- what the coach is told ----------
export function planContext(date = ymd()) {
  const p = plan(); if (!p) return null;
  const d = planDay(date), ws = weekStart(date), avg = weightAvgKg(date);
  return {
    name: p.name, goal: { weight: p.goalWeight, date: p.goalDate, unit: p.weightUnit, winRange: p.winRange },
    today: d ? { phase: d.phase.name, week: d.weekN, dayType: d.type, special: d.special ? d.special.label : null, targets: { kcal: d.kcal, protein: d.p, carbs: d.c, fat: d.f }, session: d.session ? d.session.session + (d.session.cardio ? ' + ' + d.session.cardio : '') : null } : 'before the plan starts',
    thisWeek: d && d.week ? { targetAvgWeight: d.week.target, cardioGoalMin: d.cardioGoal, cardioDoneMin: cardioMinutes(ws), note: d.week.note || null } : null,
    sevenDayAvgWeight: avg == null ? null : +(p.weightUnit === 'kg' ? avg : kgToLb(avg)).toFixed(1),
    upcoming: (p.days || []).filter(x => x.date >= date && x.date <= addDays(date, 21)).map(x => `${x.date}: ${x.label}`),
    planNotes: p.coachNotes || ''
  };
}
