// Screens and sheets for a loaded plan: the Today cards, the Progress "Plan" tab, cardio
// logging, the evening check-in, day types, the pre-workout glucose reminder and Settings.
//
// This file may read Oura steps for the Plan tab, so coach.js must never import it.
import { state, save } from './store.js';
import { esc, fmt, num, ymd, addDays, weekStart, dow, shortDate, niceDate, lineChart, DAYS } from './util.js';
import { dayTotals, toDisp, wu } from './calc.js';
import { actions, submits, nav, openSheet, setSheet, closeSheet, toast, buzz, celebrate, icon } from './ui.js';
import { plan, planDay, phaseOn, weekOn, weekNumber, dayType, setDayType, targetsFor, cardioMinutes, cardioOn, logCardio, CARDIO_KINDS,
  weightAvgKg, weekStats, planNudges, lbToKg, validPlan, loadPlan, removePlan } from './program.js';
import { ouraDay } from './oura.js';

const planW = lb => toDisp(lbToKg(lb));            // plan weights are stored in the plan's unit (lb)
const daysTo = d => Math.round((Date.parse(d + 'T12:00:00') - Date.parse(ymd() + 'T12:00:00')) / 864e5);
const TYPE = { track: ['Tracking', ''], off: ['Off day', 'Not tracked. Enjoy it, and it stays out of your averages.'], treat: ['Treat day', 'Tracked at about 2,000. Dose for the extra carbs as normal.'] };
const stepsOn = d => { const o = ouraDay(d); if (o && o.steps != null) return o.steps; const m = state.steps.find(s => s.date === d); return m ? m.n : null; };

// ---------- Today ----------
export function planBanner(t) {
  const p = plan(), d = planDay(t);
  if (!p) return '';
  if (!d) {
    return `<section class="card lg phase ph-blue tape press" data-action="road-open"><span class="eyebrow">${esc(p.name)}</span>
<span class="hand" style="font-size:30px">starts ${esc(niceDate(p.start).toLowerCase())}</span></section>`;
  }
  const avg = weightAvgKg(t), left = daysTo(p.goalDate), wk = d.week;
  const type = d.type, sp = d.special;
  return `<section class="card lg phase ph-${esc(d.phase.color || 'blue')} tape press" data-action="road-open">
<div class="row between"><span class="eyebrow">${esc(p.name)} · week ${d.weekN}</span>${type !== 'track' ? `<span class="pill" style="--accent:var(--text);--soft:rgba(255,255,255,.7)">${TYPE[type][0]}</span>` : ''}</div>
<span class="hand" style="font-size:30px">${esc(d.phase.name.toLowerCase())}</span>
${sp ? `<span class="sub">${esc(sp.label)}</span>` : ''}
${type !== 'track' ? `<span class="muted" style="line-height:1.45">${TYPE[type][1]}</span>` : ''}
<div class="grid3">
<div class="col"><span class="muted small" style="font-weight:700">${type === 'off' ? 'Guide' : 'Calories'}</span><span class="sub">${d.kcal ? fmt(d.kcal, 0) : '–'}</span></div>
<div class="col"><span class="muted small" style="font-weight:700">7-day avg</span><span class="sub">${avg == null ? '–' : fmt(toDisp(avg), 1)}${wk && wk.target ? `<span class="unit"> / ${fmt(planW(wk.target), 1)}</span>` : ''}</span></div>
<div class="col"><span class="muted small" style="font-weight:700">${left > 0 ? 'Days to go' : 'Goal date'}</span><span class="sub">${left > 0 ? left : shortDate(p.goalDate)}</span></div></div></section>`;
}

export function sessionCard(t) {
  const d = planDay(t);
  if (!d || !d.session || state.activeWorkout) return null;
  const s = d.session, done = state.workouts.filter(w => w.date === t), cardio = cardioOn(t);
  const doneLine = [done.length ? `Workout: ${esc(done[done.length - 1].name)}` : '', ...cardio.map(c => `${c.min} min ${esc(c.kind.toLowerCase())}`)].filter(Boolean).join(' · ');
  const lift = !s.yoga && !/^rest/i.test(s.session);
  return `<section class="card"><div class="row between"><span class="label">Today's session</span><span class="muted small" style="font-weight:700">${DAYS[dow(t)]}</span></div>
<span class="title">${esc(s.session)}</span>
${s.cardio ? `<span class="muted">+ ${esc(s.cardio)}</span>` : ''}
${doneLine ? `<span class="row" style="gap:6px;color:var(--sage-d);font-weight:700;font-size:13px">${icon.check}${doneLine}</span>` : ''}
${plan().safety ? `<button class="link" data-action="safety-info" data-yoga="${s.yoga ? 1 : ''}" style="align-self:flex-start;min-height:36px">${icon.heart} Check glucose before you start</button>` : ''}
<div class="row" style="gap:8px;flex-wrap:wrap">
${lift && !done.length ? `<button class="btn primary sm" data-action="q-workout">Start workout</button>` : ''}
${s.yoga ? `<button class="btn primary sm" data-action="cardio-log" data-kind="Hot yoga">Log hot yoga</button>` : ''}
<button class="btn ${lift && !done.length || s.yoga ? 'ghost' : 'primary'} sm" data-action="cardio-log">Log cardio</button></div></section>`;
}

export function cardioTile(t) {
  const d = planDay(t); if (!d) return '';
  const ws = weekStart(t), min = cardioMinutes(ws), goal = d.cardioGoal;
  return `<section class="card stat press" data-action="cardio-log" style="--accent:var(--blue-d);--soft:var(--tint)">
<div class="row between"><span class="ico">${icon.flame}</span></div>
<span class="label">Cardio</span>
<span class="mid"><span data-count="${min}">${min}</span><span class="unit">${goal ? ' / ' + goal : ''} min</span></span>
${goal ? `<div class="bar"><i data-w="${Math.min(100, (min / goal) * 100).toFixed(1)}" style="background:var(--blue)"></i></div>` : ''}
<span class="muted small">this week</span></section>`;
}

export function yogaMorningCard(t) {
  const p = plan(), d = planDay(t);
  if (!p || !d || !d.session || !d.session.yoga || !p.yogaMorning || new Date().getHours() >= 13) return '';
  return `<section class="card butter"><span class="hand">hot yoga morning</span>
${p.safety && p.safety.yoga ? `<span class="muted" style="line-height:1.45;font-weight:600">${esc(p.safety.yoga)}</span>` : ''}
<div class="col" style="gap:8px">${p.yogaMorning.slice(0, 3).map(x => `<div class="row" style="align-items:flex-start;gap:10px"><span class="event-time" style="background:var(--card);flex:none">${esc(x.time)}</span><span style="font-size:14px;line-height:1.45">${esc(x.text)}</span></div>`).join('')}</div>
<button class="link" data-action="yoga-day" style="align-self:flex-start">The rest of the day</button></section>`;
}
actions['yoga-day'] = () => {
  const p = plan();
  openSheet(`<div class="col"><div class="sheet-head"><h2 class="sheet-title">hot yoga days</h2><button class="link" data-action="sheet-close">Close</button></div>
<div class="list">${p.yogaMorning.map(x => `<div class="item" style="align-items:flex-start"><span class="event-time" style="flex:none">${esc(x.time)}</span><span class="grow" style="font-size:14px;line-height:1.45">${esc(x.text)}</span></div>`).join('')}</div></div>`);
};

export function checkinPrompt(t) {
  const p = plan(); if (!p || !p.checkin || new Date().getHours() < 17) return '';
  const done = (state.checkins || []).some(c => c.date === t);
  const d = planDay(t), leg = d && d.session && d.session.leg && p.safety && p.safety.legDay;
  if (done && !leg) return '';
  return `<section class="card pink"><div class="row between"><span class="hand">${done ? 'before bed' : 'evening check-in'}</span>${done ? `<span class="pill" style="--accent:var(--sage-d);--soft:var(--card)">done</span>` : ''}</div>
${leg ? `<span style="font-size:14px;font-weight:700;line-height:1.45">${esc(p.safety.legDay)}</span>` : ''}
${done ? '' : `<span class="muted">${p.checkin.daily.length} quick questions${dow(t) === 6 ? ', plus the Sunday ones' : ''}.</span>
<button class="btn primary sm" data-action="checkin-open" data-date="${t}" style="align-self:flex-start">Check in</button>`}</section>`;
}

// ---------- the plan tab in Progress ----------
export function roadHtml() {
  const p = plan(), t = ymd();
  if (!p) return `<section class="card empty"><span class="hand">no plan loaded</span><span class="muted">Load a plan file in Settings to see your weekly targets here.</span>
<button class="btn primary" data-action="tab" data-tab="settings">Open Settings</button></section>`;
  const avgNow = weightAvgKg(t), startKg = lbToKg(p.startWeight), goalKg = lbToKg(p.goalWeight);
  const lost = avgNow == null ? null : startKg - avgNow, total = startKg - goalKg;
  const pct = lost == null ? 0 : Math.max(0, Math.min(1, lost / total));
  const left = daysTo(p.goalDate), weeksLeft = Math.max(1, left / 7);
  const need = avgNow == null ? null : (avgNow - goalKg) / weeksLeft;
  const curN = weekNumber(t);

  // chart: weekly targets against her weekly averages
  const weeks = (p.weeks || []).filter(w => w.target != null);
  const targetPts = weeks.map(w => ({ x: w.n, y: planW(w.target) }));
  const actualPts = (p.weeks || []).filter(w => w.start <= t).map(w => { const s = weekStats(w.start); return s.avgKg == null ? null : { x: w.n, y: toDisp(s.avgKg) }; }).filter(Boolean);
  const chart = lineChart([{ pts: targetPts, color: '#D6CCB8', width: 2 }, { pts: actualPts, color: '#6E89A8' }], { label: 'Weekly average weight against target' });

  const nudges = planNudges(dayTotals).map(n => `<section class="card ${n.tone}"><span class="sub">${esc(n.title)}</span><span class="muted" style="line-height:1.5">${esc(n.text)}</span></section>`).join('');

  const wk = weekOn(t), d = planDay(t);
  const cur = wk ? weekStats(wk.start, { totals: dayTotals, stepsOf: stepsOn }) : null;
  const row = (label, val, goal, ok) => `<div class="row between" style="min-height:30px"><span class="muted" style="font-weight:700">${label}</span><span class="sub"${ok === true ? ' style="color:var(--sage-d)"' : ''}>${val}${goal ? `<span class="unit"> / ${goal}</span>` : ''}</span></div>`;
  const thisWeek = wk && cur ? `<section class="card tint"><div class="row between"><span class="hand">week ${wk.n}</span><span class="muted small" style="font-weight:700">${shortDate(wk.start)} – ${shortDate(addDays(wk.start, 6))}</span></div>
${row('Average weight', cur.avgKg == null ? '–' : fmt(toDisp(cur.avgKg), 1), wk.target ? fmt(planW(wk.target), 1) + ' ' + wu() : 'skip the scale', cur.avgKg != null && wk.target && toDisp(cur.avgKg) <= planW(wk.target) + 0.05)}
${row('Calories (tracked days)', cur.avgKcal == null ? '–' : fmt(cur.avgKcal, 0), d && d.type === 'track' ? fmt(d.kcal, 0) : wk.kcal ? fmt(wk.kcal, 0) : '')}
${row('Cardio', cur.cardio + ' min', (d ? d.cardioGoal : wk.cardio) + ' min', cur.cardio >= (d ? d.cardioGoal : wk.cardio))}
${row('Steps (daily avg)', cur.avgSteps == null ? '–' : fmt(cur.avgSteps, 0), fmt(wk.steps, 0), cur.avgSteps != null && cur.avgSteps >= wk.steps)}
${wk.note ? `<span class="muted" style="line-height:1.45">${esc(wk.note)}</span>` : ''}</section>` : '';

  const list = (p.weeks || []).map(w => {
    const past = w.start <= t, s = past ? weekStats(w.start) : null;
    const avg = s && s.avgKg != null ? toDisp(s.avgKg) : null, tgt = w.target != null ? planW(w.target) : null;
    const ok = avg != null && tgt != null ? avg <= tgt + 0.05 : null;
    return `<div class="item" style="${w.n === curN ? 'background:var(--tint);' : ''}${w.checkpoint ? 'font-weight:700;' : ''}">
<span class="col grow" style="gap:1px"><span class="sub">Week ${w.n}${w.checkpoint ? ' · checkpoint' : ''}</span><span class="muted small">${shortDate(w.start)}${w.kcal ? ' · ' + fmt(w.kcal, 0) + ' kcal' : ''} · ${w.cardio} min cardio</span></span>
<span class="col" style="align-items:flex-end;gap:1px"><span class="v">${tgt != null ? fmt(tgt, 1) : 'skip'}</span>
${avg != null ? `<span class="small" style="font-weight:700;color:${ok ? 'var(--sage-d)' : 'var(--pink-d)'}">${fmt(avg, 1)}${ok ? ' ✓' : ''}</span>` : ''}</span></div>`;
  }).join('');

  const textCard = (title, lines) => lines && lines.length ? `<section class="card"><span class="hand">${esc(title)}</span>${lines.map(l => `<span style="font-size:14px;line-height:1.5">• ${esc(l)}</span>`).join('')}</section>` : '';
  return `<section class="card lg tape">
<span class="eyebrow">${esc(p.name)}</span>
<div class="row" style="gap:10px;align-items:baseline"><span class="big">${avgNow == null ? '–' : fmt(toDisp(avgNow), 1)}</span><span class="unit">${wu()} · 7-day average</span></div>
<div class="bar" style="height:10px;border-radius:5px"><i data-w="${(pct * 100).toFixed(1)}" style="background:linear-gradient(90deg,var(--pink),var(--blue));border-radius:5px"></i></div>
<div class="row between"><span class="muted small" style="font-weight:700">Start ${fmt(planW(p.startWeight), 1)}</span><span class="muted small" style="font-weight:700">Goal ${fmt(planW(p.goalWeight), 1)} by ${shortDate(p.goalDate)}</span></div>
<span class="muted" style="line-height:1.5">${lost == null ? 'Weigh in each morning; the 7-day average is what counts.' : `${lost >= 0 ? 'Down' : 'Up'} ${fmt(toDisp(Math.abs(lost)), 1)} ${wu()} so far.`}${left > 0 && need != null && need > 0 ? ` About ${fmt(toDisp(need), 2)} ${wu()} a week from here reaches the goal${p.winRange ? `, and ${fmt(planW(p.winRange[0]), 0)}–${fmt(planW(p.winRange[1]), 0)} counts as a win` : ''}.` : ''}</span>
${chart ? `${chart}<span class="muted small">Blue: your weekly average. Beige: the plan's target.</span>` : ''}</section>
${nudges}
${thisWeek}
<div class="sec-head"><h2>every week</h2></div>
<div class="list">${list}</div>
<div class="sec-head"><h2>phases</h2></div>
<div class="list">${p.phases.map(ph => `<div class="item" style="align-items:flex-start"><span class="phase-dot ph-${esc(ph.color || 'blue')}"></span><span class="col grow" style="gap:2px">
<span class="sub">${esc(ph.name)}</span><span class="muted small">${shortDate(ph.start)}${ph.end ? ' – ' + shortDate(ph.end) : ' onward'} · ${esc(ph.kcalText || fmt(ph.kcal, 0))} kcal · ${ph.p} g protein · ${ph.f} g fat</span>
<span class="muted small">${ph.cardio} min cardio a week · ${fmt(ph.steps, 0)} steps · ${esc(ph.target || '')}</span></span></div>`).join('')}</div>
${textCard('daily rules', p.rules && p.rules.lines)}
${textCard('training', p.training)}
${textCard('if things change', p.adjust && p.adjust.lines)}
${textCard('look after yourself', p.wellbeing)}`;
}
actions['road-open'] = async () => { const { progNav } = await import('./progress.js'); progNav.tab = 'plan'; nav.go('progress'); };

// ---------- cardio ----------
let cardioDraft = { min: 20, kind: 'Zone 2', date: ymd() };
function cardioHtml() {
  const c = cardioDraft;
  return `<div class="col" id="cardio-wrap"><div class="sheet-head"><h2 class="sheet-title">log ${c.kind === 'Hot yoga' ? 'hot yoga' : 'cardio'}</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<div class="chips">${CARDIO_KINDS.map(k => `<button class="chip${c.kind === k ? ' on' : ''}" data-action="cardio-kind" data-k="${k}">${k}</button>`).join('')}</div>
${c.kind === 'Hot yoga' ? '<span class="muted small" style="line-height:1.45">Logged for your records. It doesn\'t count toward your cardio minutes.</span>' : ''}
<div class="row" style="justify-content:center;gap:14px">
<button class="icon-btn" data-action="cardio-step" data-d="-5" aria-label="5 minutes less" style="width:52px;height:52px;border-radius:26px">−</button>
<div class="col center" style="gap:2px"><input type="text" inputmode="numeric" id="cardio-min" value="${c.min}" aria-label="Minutes" style="width:120px;height:64px;font-size:28px;font-weight:700;text-align:center"><span class="muted small" style="font-weight:700">minutes</span></div>
<button class="icon-btn" data-action="cardio-step" data-d="5" aria-label="5 minutes more" style="width:52px;height:52px;border-radius:26px">${icon.plus}</button></div>
<div class="chips" style="justify-content:center">${[15, 20, 30, 40, 60].map(m => `<button class="chip" data-action="cardio-set" data-m="${m}">${m} min</button>`).join('')}</div>
<button class="btn primary block" data-action="cardio-save">Save</button>
${cardioList(c.date)}</div>`;
}
const cardioList = date => {
  const l = cardioOn(date);
  return l.length ? `<span class="label">Logged ${date === ymd() ? 'today' : niceDate(date)}</span><div class="list">${l.map(c => `<div class="swipe"><button class="swipe-del" data-action="cardio-del" data-id="${c.id}">Delete</button>
<div class="swipe-body"><span class="sub">${esc(c.kind)}</span><span class="v">${c.min} min</span></div></div>`).join('')}</div>` : '';
};
const readMin = () => { const v = num((document.getElementById('cardio-min') || {}).value); if (v != null) cardioDraft.min = Math.round(v); };
actions['cardio-log'] = el => {
  const t = ymd(), d = planDay(t), s = d && d.session;
  const guess = s && s.cardio ? (s.cardio.match(/(\d+)\s*min\s*(.*)/i) || []) : [];
  const kind = el && el.dataset && el.dataset.kind ? el.dataset.kind : /incline/i.test(guess[2] || '') ? 'Incline walk' : 'Zone 2';
  cardioDraft = { min: kind === 'Hot yoga' ? 60 : +guess[1] || 20, kind, date: nav.tab === 'plan' && el.dataset.date ? el.dataset.date : t };
  openSheet(cardioHtml());
};
actions['cardio-kind'] = el => { readMin(); cardioDraft.kind = el.dataset.k; if (el.dataset.k === 'Hot yoga' && cardioDraft.min < 45) cardioDraft.min = 60; setSheet(cardioHtml()); };
actions['cardio-step'] = el => { readMin(); cardioDraft.min = Math.max(5, (cardioDraft.min || 0) + +el.dataset.d); setSheet(cardioHtml()); };
actions['cardio-set'] = el => { cardioDraft.min = +el.dataset.m; setSheet(cardioHtml()); };
actions['cardio-save'] = () => {
  readMin();
  if (!logCardio(cardioDraft.date, cardioDraft.min, cardioDraft.kind)) return toast('Enter the minutes');
  closeSheet(); buzz(); nav.render();
  const d = planDay(cardioDraft.date), ws = weekStart(cardioDraft.date), done = cardioMinutes(ws);
  if (d && d.cardioGoal && cardioDraft.kind !== 'Hot yoga' && done >= d.cardioGoal && done - cardioDraft.min < d.cardioGoal) { celebrate(); toast('Cardio goal done for the week'); }
  else toast(cardioDraft.kind === 'Hot yoga' ? 'Hot yoga logged' : `${cardioDraft.min} min logged`);
};
actions['cardio-del'] = el => { state.cardio = state.cardio.filter(c => c.id !== el.dataset.id); save('cardio'); setSheet(cardioHtml()); nav.render(); };

// ---------- evening check-in ----------
let ci = null; // { date, answers, sunday }
function checkinHtml() {
  const p = plan(), t = ci.date, d = planDay(t), sunday = dow(t) === 6;
  const tot = dayTotals(t), tg = targetsFor(t);
  const auto = {
    protein: tot.n ? `${fmt(tot.p, 0)} g logged${tg.p ? ' of ' + fmt(tg.p, 0) : ''}` : 'No food logged',
    trend: (() => { const a = weightAvgKg(t), b = weightAvgKg(addDays(t, -7)); return a != null && b != null ? `7-day average ${fmt(toDisp(a), 1)}, last week ${fmt(toDisp(b), 1)}` : ''; })()
  };
  const q = (x, bag) => {
    const v = (bag || {})[x.id];
    let input;
    if (x.kind === 'yesno') input = `<div class="seg" style="max-width:220px">${[['yes', 'Yes'], ['no', 'No']].map(([k, l]) => `<button type="button" class="${v === k ? 'on' : ''}" data-action="ci-pick" data-id="${x.id}" data-v="${k}" data-sun="${bag === ci.sunday ? 1 : ''}">${l}</button>`).join('')}</div>`;
    else if (x.kind === 'scale') input = `<div class="scale10">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button type="button" class="${v === n ? 'on' : ''}" data-action="ci-pick" data-id="${x.id}" data-v="${n}" aria-label="${n} out of 10">${n}</button>`).join('')}</div>`;
    else input = `<input type="text" id="ci-${x.id}" value="${esc(v || '')}" maxlength="200" autocomplete="off" placeholder="A few words">`;
    return `<div class="col" style="gap:8px;padding:12px 0;border-bottom:1.5px dotted var(--line2)"><span class="sub" style="line-height:1.35">${esc(x.q)}</span>
${auto[x.id] ? `<span class="muted small" style="font-weight:700">${esc(auto[x.id])}</span>` : ''}${input}</div>`;
  };
  return `<div class="col" id="ci-wrap"><div class="sheet-head"><h2 class="sheet-title">check-in</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<span class="muted">${esc(niceDate(t))}${d && d.type !== 'track' ? ' · ' + TYPE[d.type][0] : ''}</span>
${d && d.session && d.session.leg && p.safety && p.safety.legDay ? `<section class="card pink" style="padding:12px 14px"><span style="font-size:14px;font-weight:700;line-height:1.45">${esc(p.safety.legDay)}</span></section>` : ''}
<div class="col" style="gap:0">${p.checkin.daily.map(x => q(x, ci.answers)).join('')}</div>
${sunday && p.checkin.sunday ? `<span class="hand" style="margin-top:6px">sunday</span><div class="col" style="gap:0">${p.checkin.sunday.map(x => q(x, ci.sunday)).join('')}</div>` : ''}
<button class="btn primary block" data-action="ci-save">Save check-in</button>
${p.wellbeing && p.wellbeing.length ? `<span class="muted small" style="text-align:center;line-height:1.5">${esc(p.wellbeing[p.wellbeing.length - 1])}</span>` : ''}</div>`;
}
const readTexts = () => { for (const el of document.querySelectorAll('#ci-wrap input[id^="ci-"]')) ci.answers[el.id.slice(3)] = el.value.trim(); };
actions['checkin-open'] = el => {
  const date = (el && el.dataset.date) || ymd(), old = (state.checkins || []).find(c => c.date === date);
  ci = { date, answers: { ...(old ? old.answers : {}) }, sunday: dow(date) === 6 ? { ...((old && old.sunday) || {}) } : null };
  const tot = dayTotals(date), tg = targetsFor(date);
  if (!ci.answers.protein && tot.n && tg.p) ci.answers.protein = tot.p >= tg.p * 0.95 ? 'yes' : 'no';
  if (ci.sunday && !ci.sunday.trend) { const a = weightAvgKg(date), b = weightAvgKg(addDays(date, -7)); if (a != null && b != null) ci.sunday.trend = a < b ? 'yes' : 'no'; }
  openSheet(checkinHtml());
};
actions['ci-pick'] = el => {
  readTexts();
  const bag = el.dataset.sun ? ci.sunday : ci.answers, v = isNaN(+el.dataset.v) ? el.dataset.v : +el.dataset.v;
  bag[el.dataset.id] = bag[el.dataset.id] === v ? undefined : v;
  const sc = document.querySelector('#sheet-root .sheet'), top = sc ? sc.scrollTop : 0;
  setSheet(checkinHtml());
  const sc2 = document.querySelector('#sheet-root .sheet'); if (sc2) sc2.scrollTop = top;
};
actions['ci-save'] = () => {
  readTexts();
  state.checkins = (state.checkins || []).filter(c => c.date !== ci.date);
  state.checkins.push({ date: ci.date, answers: ci.answers, sunday: ci.sunday });
  save('checkins'); closeSheet(); buzz(); nav.render(); toast('Checked in. Sleep well');
};
export function checkinSummary(date) {
  const p = plan(); if (!p || !p.checkin) return '';
  const c = (state.checkins || []).find(x => x.date === date);
  if (!c) return date <= ymd() ? `<section class="card"><div class="row between"><span class="hand">check-in</span><button class="btn soft sm" data-action="checkin-open" data-date="${date}">Check in</button></div></section>` : '';
  const yes = p.checkin.daily.filter(x => x.kind === 'yesno' && c.answers[x.id] === 'yes').length, yn = p.checkin.daily.filter(x => x.kind === 'yesno').length;
  return `<button class="card press" data-action="checkin-open" data-date="${date}" style="text-align:left"><div class="row between"><span class="hand">check-in</span><span class="pill" style="--accent:var(--sage-d);--soft:var(--sage-soft)">done</span></div>
<span class="muted" style="font-weight:700">${yes} of ${yn} yes${c.answers.energy ? ` · energy ${c.answers.energy}/10` : ''}</span>
${c.answers.proud ? `<span style="font-size:14px;line-height:1.45">Proud of: ${esc(c.answers.proud)}</span>` : ''}</button>`;
}

// ---------- day type and the Plan tab's day header ----------
export function dayTypeChips(date) {
  if (!planDay(date)) return '';
  const cur = dayType(date);
  return `<div class="seg" role="group" aria-label="Day type">${Object.entries(TYPE).map(([k, [l]]) => `<button class="${cur === k ? 'on' : ''}" data-action="day-type" data-d="${date}" data-t="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
}
actions['day-type'] = el => { setDayType(el.dataset.d, el.dataset.t); nav.render(); toast(TYPE[el.dataset.t][0]); };
export function planDayCard(date) {
  const d = planDay(date); if (!d) return '';
  return `<section class="card phase ph-${esc(d.phase.color || 'blue')}" style="gap:8px">
<div class="row between"><span class="eyebrow">${esc(d.phase.name)} · week ${d.weekN}</span></div>
${d.special ? `<span class="sub">${esc(d.special.label)}</span>` : ''}
<span style="font-size:14px;font-weight:600;line-height:1.45">${d.type === 'off' ? `Off day${d.kcal ? ', about ' + fmt(d.kcal, 0) + ' as a guide' : ''}` : `${fmt(d.kcal, 0)} kcal · ${d.p} g protein · ${d.f} g fat · ${d.c} g carbs`}</span>
${d.session ? `<span style="font-size:14px;line-height:1.45">${esc(d.session.session)}${d.session.cardio ? ' + ' + esc(d.session.cardio) : ''}</span>` : ''}
${dayTypeChips(date)}</section>`;
}
export const phaseColor = date => { const ph = phaseOn(date); return ph ? ph.color || 'blue' : null; };

// ---------- the glucose check before a workout ----------
function safetyHtml(startId, yoga) {
  const s = plan().safety;
  return `<div class="col"><div class="sheet-head"><h2 class="sheet-title">${esc(s.title.toLowerCase())}</h2><button class="link" data-action="sheet-close">${startId == null ? 'Close' : 'Cancel'}</button></div>
<div class="list">${s.ranges.map(r => `<div class="item" style="align-items:flex-start"><span class="sub" style="width:42%;flex:none;line-height:1.35">${esc(r.range)}</span><span class="grow" style="font-size:14px;line-height:1.45">${esc(r.do)}</span></div>`).join('')}</div>
${yoga && s.yoga ? `<span style="font-size:14px;line-height:1.5">${esc(s.yoga)}</span>` : ''}
${(s.notes || []).map(n => `<span class="muted" style="line-height:1.5">• ${esc(n)}</span>`).join('')}
${startId != null ? `<button class="btn primary block" data-action="wk-start" data-id="${esc(startId)}" data-ok="1">Checked, start workout</button>` : ''}
${s.source ? `<span class="muted small">From your plan (${esc(s.source)}).</span>` : ''}</div>`;
}
actions['safety-info'] = el => openSheet(safetyHtml(null, !!(el && el.dataset.yoga)));
// Wraps the workout start so the reminder shows first (app.js calls this once at boot).
export function guardWorkoutStart() {
  const start = actions['wk-start'];
  actions['wk-start'] = (el, e) => {
    const p = plan();
    if (!p || !p.safety || (el && el.dataset && el.dataset.ok) || state.activeWorkout) { if (el && el.dataset && el.dataset.ok) closeSheet(); return start(el, e); }
    openSheet(safetyHtml(el && el.dataset ? el.dataset.id || '' : ''));
  };
}

// ---------- Settings ----------
export function planSettingsCard() {
  const p = plan();
  if (!p) {
    return `<section class="card"><span class="label">Your plan</span>
<span class="muted" style="line-height:1.5">Load a plan file to set your daily goals by phase, mark off days and treat days, and track weekly targets.</span>
<button class="btn ghost block" data-action="plan-import">Load a plan file</button></section>`;
  }
  const d = planDay(ymd());
  return `<section class="card tint"><span class="label">Your plan</span><span class="title">${esc(p.name)}</span>
<span class="muted">${shortDate(p.start)} to ${shortDate(p.goalDate)}${d ? ' · now: ' + esc(d.phase.name) : ''}</span>
<span class="muted" style="line-height:1.5">While the plan runs, it sets your daily calories and macros. The goals below are used before and after it.</span>
<button class="btn ghost block" data-action="plan-import">Load an updated plan file</button>
<button class="link" data-action="plan-remove" style="color:var(--danger);align-self:flex-start">Remove the plan</button></section>`;
}
actions['plan-import'] = () => {
  const inp = document.getElementById('import-file');
  inp.value = '';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let obj; try { obj = JSON.parse(r.result); } catch { return toast('That file could not be read'); }
      if (!validPlan(obj)) return toast('That is not a Nina Fit plan file');
      loadPlan(obj); celebrate(); nav.go('home'); toast(`${obj.plan.name} loaded`);
    };
    r.readAsText(f);
  };
  inp.click();
};
actions['plan-remove'] = async () => {
  const { confirmSheet } = await import('./ui.js');
  confirmSheet({ title: 'Remove the plan?', text: 'Your logs stay. Daily goals go back to the ones in Settings. You can load the file again any time.', ok: 'Remove', danger: true }, () => { removePlan(); nav.render(); toast('Plan removed'); });
};

// ---------- her plan's staple foods, for Add food ----------
export const planStaples = () => { const p = plan(); return p && Array.isArray(p.staples) ? p.staples : []; };
