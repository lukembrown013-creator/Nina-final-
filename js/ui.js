// Shared UI plumbing: action registry, navigation, bottom sheets, toast, confetti, gestures.
import { $, $$, esc, fmt } from './util.js';

export const actions = {};   // click handlers by data-action name: fn(element, event)
export const inputs = {};    // input handlers by data-input name: fn(element, event)
export const submits = {};   // form handlers by data-submit name: fn(valuesObject, form)

export const nav = {
  tab: 'home',
  render() {},
  go(tab) { this.tab = tab; this.render(true); }
};

// ---------- bottom sheets (stackable) ----------
const root = () => $('#sheet-root');
const liveSheets = () => [...root().children].filter(w => !w.classList.contains('closing'));

export function openSheet(html) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-action="sheet-close"></div>
<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab"></div><div class="sheet-content">${html}</div></div>`;
  root().appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  return wrap;
}
export function setSheet(html) {
  const w = liveSheets().pop();
  if (!w) return;
  const sheet = $('.sheet', w), top = sheet.scrollTop;
  $('.sheet-content', w).innerHTML = html;
  sheet.scrollTop = top;
}
export function closeSheet() {
  const w = liveSheets().pop();
  if (!w) return;
  if (document.activeElement && w.contains(document.activeElement)) document.activeElement.blur();
  w.classList.remove('open');
  w.classList.add('closing');
  setTimeout(() => w.remove(), 240);
}
export function closeAllSheets() { while (liveSheets().length) closeSheet(); }
export const sheetOpen = () => liveSheets().length > 0;
actions['sheet-close'] = () => closeSheet();

let confirmCb = null;
export function confirmSheet({ title, text = '', ok = 'Confirm', danger = false }, cb) {
  confirmCb = cb;
  openSheet(`<h2 class="sheet-title">${esc(title)}</h2>
${text ? `<p class="muted" style="font-size:15px;line-height:1.5">${esc(text)}</p>` : ''}
<button class="btn ${danger ? 'danger' : 'primary'} block" data-action="confirm-ok">${esc(ok)}</button>
<button class="btn ghost block" data-action="sheet-close">Cancel</button>`);
}
actions['confirm-ok'] = () => { const cb = confirmCb; confirmCb = null; closeSheet(); if (cb) cb(); };

// ---------- toast ----------
let toastTimer = null;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

export const buzz = (ms = 10) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not supported on iOS */ } };

// ---------- sound ----------
let audio = null;
export function primeAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}
export function beep() {
  try {
    if (!audio) return;
    [0, 0.22].forEach((t, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = i ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.2);
      o.connect(g); g.connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.22);
    });
  } catch { /* no audio */ }
}

// ---------- celebration ----------
export function celebrate() {
  const cv = $('#confetti');
  if (!cv || !cv.getContext) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.width = window.innerWidth * dpr, H = cv.height = window.innerHeight * dpr;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const colors = ['#6E89A8', '#E3B6B0', '#A9BFA0', '#EAD9A8', '#B9C9DC'];
  const parts = Array.from({ length: 110 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = (7 + Math.random() * 11) * dpr;
    return { x: W / 2, y: H * 0.62, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: (4 + Math.random() * 5) * dpr,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0] };
  });
  const start = performance.now(), dur = 1500;
  (function frame(now) {
    const t = (now - start) / dur;
    ctx.clearRect(0, 0, W, H);
    if (t >= 1) return;
    for (const p of parts) {
      p.vy += 0.32 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t * t); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    requestAnimationFrame(frame);
  })(start);
  buzz(30);
}

// ---------- entrance animation for rings, bars and numbers ----------
export function animateIn(scope, countUp) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const a of $$('.ring-arc', scope)) a.style.strokeDashoffset = a.dataset.offset;
    for (const b of $$('.bar > i[data-w]', scope)) b.style.width = b.dataset.w + '%';
  }));
  if (!countUp) return;
  for (const el of $$('[data-count]', scope)) {
    const target = Number(el.dataset.count), dp = Number(el.dataset.dp || 0);
    if (!isFinite(target) || target === 0) continue;
    const t0 = performance.now(), dur = 650;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(target * e, dp);
      if (t < 1 && el.isConnected) requestAnimationFrame(step); else if (el.isConnected) el.textContent = fmt(target, dp);
    };
    requestAnimationFrame(step);
  }
}

// ---------- gestures: swipe a row left to reveal Delete, swipe the Food screen to change day ----------
let justSwiped = false;
export const swipedRecently = () => justSwiped;

export function initGestures({ onPageSwipe }) {
  let g = null;
  const closeRows = except => {
    for (const b of $$('.swipe-body.open')) if (b !== except) { b.classList.remove('open'); b.style.transform = ''; }
  };
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0];
    const body = e.target.closest('.swipe-body');
    closeRows(body);
    g = { x: t.clientX, y: t.clientY, body, base: body && body.classList.contains('open') ? -88 : 0, dx: 0, dy: 0, lock: null,
      page: !body && !sheetOpen() && $('#workout').hidden && !!e.target.closest('#view') && !e.target.closest('.chips.scroll') };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!g) return;
    const t = e.touches[0];
    g.dx = t.clientX - g.x; g.dy = t.clientY - g.y;
    if (!g.lock && (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10)) g.lock = Math.abs(g.dx) > Math.abs(g.dy) ? 'x' : 'y';
    if (g.lock === 'x' && g.body) {
      const x = Math.max(-104, Math.min(0, g.base + g.dx));
      g.body.classList.add('dragging');
      g.body.style.transform = `translateX(${x}px)`;
    }
  }, { passive: true });
  const end = () => {
    if (!g) return;
    if (g.lock === 'x') {
      justSwiped = true; setTimeout(() => { justSwiped = false; }, 350);
      if (g.body) {
        const open = g.base + g.dx < -44;
        g.body.classList.remove('dragging');
        g.body.classList.toggle('open', open);
        g.body.style.transform = open ? 'translateX(-88px)' : '';
      } else if (g.page && Math.abs(g.dx) > 70 && Math.abs(g.dy) < 60) {
        onPageSwipe(g.dx < 0 ? 1 : -1);
      }
    }
    g = null;
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { if (g && g.body) { g.body.classList.remove('dragging'); g.body.style.transform = g.base ? 'translateX(-88px)' : ''; } g = null; }, { passive: true });
}

// Reusable bits of markup
export const icon = {
  chevL: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>',
  chevR: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 5 16 12 9 19"/></svg>',
  chevD: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 12 16 19 9"/></svg>',
  plus: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  check: '<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>',
  gear: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.5" fill="#fff"/><circle cx="15" cy="17" r="2.5" fill="#fff"/></svg>',
  dots: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  plates: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="12" x2="22" y2="12"/><line x1="7" y1="6" x2="7" y2="18"/><line x1="17" y1="6" x2="17" y2="18"/></svg>',
  food: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v7a2 2 0 0 0 4 0V3"/><line x1="9" y1="12" x2="9" y2="21"/><path d="M17 21V3c-2 1.5-3 4-3 7 0 1.5 1 2.5 3 2.5"/></svg>',
  scale: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 9a5 5 0 0 1 8 0"/><line x1="12" y1="9" x2="13.5" y2="6.5"/></svg>',
  lift: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="7" x2="7" y2="17"/><line x1="17" y1="7" x2="17" y2="17"/><line x1="3.5" y1="9.5" x2="3.5" y2="14.5"/><line x1="20.5" y1="9.5" x2="20.5" y2="14.5"/></svg>',
  tape: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="10" r="6"/><circle cx="9" cy="10" r="1.5"/><path d="M9 16h12v-4h-6"/></svg>',
  scan: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3"/><path d="M20 7V4h-3"/><path d="M4 17v3h3"/><path d="M20 17v3h-3"/><line x1="6" y1="9" x2="6" y2="15"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="13" y1="9" x2="13" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/></svg>',
  sparkle: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9z"/><path d="M19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9z"/></svg>',
  cal: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="4"/><line x1="3.5" y1="10" x2="20.5" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>',
  list: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="6" height="6" rx="2"/><polyline points="4.5 16.5 6 18 9 14.5"/><line x1="13" y1="7" x2="20.5" y2="7"/><line x1="13" y1="16.5" x2="20.5" y2="16.5"/></svg>',
  camera: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.500 19h-11A2.5 2.5 0 0 1 4 16.500z"/><circle cx="12" cy="12.5" r="3.4"/></svg>',
  search: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><line x1="16" y1="16" x2="20.5" y2="20.5"/></svg>',
  pencil: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.5L16.500 4a2.1 2.1 0 0 1 3 3L8 18.500z"/><line x1="14.5" y1="6" x2="17.500" y2="9"/></svg>',
  steps: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.500 14c-2 0-3-1.700-3-4.500S5.500 4 7.500 4s2.800 2.400 2.800 5-.8 5-2.800 5z"/><path d="M5.500 17h4c0 1.800-.8 3-2 3s-2-1.200-2-3z"/><path d="M16.500 17c2 0 3-1.700 3-4.500S18.500 7 16.500 7s-2.800 2.400-2.800 5 .8 5 2.800 5z"/><path d="M18.500 20h-4c0 1.200.8 2 2 2s2-.8 2-2z"/></svg>',
  moon: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z"/></svg>',
  heart: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.400A4 4 0 0 1 19 10c0 5.600-7 10-7 10z"/></svg>',
  star: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.500l2.600 5.300 5.900.9-4.300 4.100 1 5.800L12 16.900l-5.200 2.700 1-5.800L3.500 9.700l5.900-.9z" fill="currentColor"/></svg>',
  send: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><polyline points="12 5.500 18.500 12 12 18.500"/></svg>',
  trash: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14"/><path d="M9 7V4.500h6V7"/><path d="M7 7l1 13h8l1-13"/></svg>',
  x: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  flame: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-3.600 0-6-2.500-6-5.800 0-2.500 1.500-4 3-5.700C10.500 7.800 11 6 11 3.500c3 1.500 7 5 7 11.200 0 3.600-2.400 6.300-6 6.300z"/></svg>',
  home: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.500 11.500L12 4l8.500 7.500"/><path d="M5.500 10.500V20h13v-9.500"/></svg>',
  chart: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/></svg>',
  cloud: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.500a4.500 4.500 0 0 1-.6-8.960A6 6 0 0 1 18 10.500a4 4 0 0 1-.5 8z"/></svg>',
  ring: '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"/><path d="M9 5l1-2h4l1 2"/></svg>',
};
