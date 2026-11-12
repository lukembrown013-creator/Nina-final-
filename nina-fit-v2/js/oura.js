// Oura: steps, readiness and sleep scores for the Home cards.
//
// PRIVACY RULE: Oura's API agreement does not allow its data to be sent to any AI model.
// So this module is deliberately isolated: the data is kept in its own local cache (never
// in `state`, so it is not synced, not exported, and not visible to the coach), the advice
// below is plain if/else rules, and coach.js must never import from this file.
import { api, isSignedIn, config } from './sync.js';
import { ymd, addDays } from './util.js';

const KEY = 'ninafit:oura';
export const oura = { connected: false, expired: false, days: {}, fetchedAt: 0 };
try { Object.assign(oura, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* nothing cached */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(oura)); } catch { /* private mode */ } };

let inflight = null;
// Fetches the last two weeks. Returns true when something changed and screens should redraw.
export function refreshOura(force = false) {
  if (!isSignedIn() || !config.oura) return Promise.resolve(false);
  if (!force && Date.now() - oura.fetchedAt < 10 * 60 * 1000) return Promise.resolve(false);
  if (inflight) return inflight;
  const end = ymd(), start = addDays(end, -13);
  inflight = api(`/oura/daily?start=${start}&end=${end}`).then(({ body }) => {
    const before = JSON.stringify([oura.connected, oura.days]);
    oura.connected = !!body.connected; oura.expired = !!body.expired; oura.fetchedAt = Date.now();
    if (body.connected) {
      const keep = {};
      for (const [d, v] of Object.entries({ ...oura.days, ...body.days })) if (d >= start) keep[d] = v;
      oura.days = keep;
    } else oura.days = {};
    persist();
    return before !== JSON.stringify([oura.connected, oura.days]);
  }).catch(() => false).finally(() => { inflight = null; });
  return inflight;
}

export async function connectOura() {
  const { body } = await api('/oura/connect');
  location.href = body.url; // Oura's own sign-in page; it sends her back here when done
}
export async function disconnectOura() {
  await api('/oura/disconnect', { method: 'POST' });
  oura.connected = false; oura.days = {}; oura.fetchedAt = 0; persist();
}
export function forgetOura() { oura.connected = false; oura.expired = false; oura.days = {}; oura.fetchedAt = 0; persist(); }

export const ouraDay = date => (oura.connected && oura.days[date]) || null;

// Plain rules, no AI. Wording stays gentle: a score is a nudge, not an instruction.
export function readinessAdvice(score) {
  if (score == null) return null;
  if (score >= 85) return { word: 'Strong', text: 'Feeling recovered. A good day to push if you want to.', tone: 'sage' };
  if (score >= 70) return { word: 'Steady', text: 'Solid recovery. Train as planned.', tone: 'tint' };
  if (score >= 60) return { word: 'Easy does it', text: 'A little under. Keep it lighter or shorter today.', tone: 'butter' };
  return { word: 'Rest up', text: 'Recovery first today. Gentle movement and an early night.', tone: 'pink' };
}
