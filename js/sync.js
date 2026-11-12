// Account + cloud sync + the shared API helper. Everything here is optional: the app works
// fully offline and local-only if nobody signs in. Photos are never part of the synced
// payload (see store.js). The coach, meal scan and Oura need an account because the keys
// for those services live on the server.
import { onSave, exportData, importData, hasData } from './store.js';

const TOKEN_KEY = 'ninafit:token', NAME_KEY = 'ninafit:account', BASE_KEY = 'ninafit:baseUpdatedAt', ROLE_KEY = 'ninafit:role', CFG_KEY = 'ninafit:config';
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* private mode */ } }
};

export const account = {
  name: ls.get(NAME_KEY) || null,
  token: ls.get(TOKEN_KEY) || null,
  role: ls.get(ROLE_KEY) || null,
  baseUpdatedAt: Number(ls.get(BASE_KEY)) || 0,
  syncing: false,
  lastError: null
};
export const isSignedIn = () => !!account.token;
export const isOwner = () => account.role === 'owner';

// What the server has switched on. Cached so the app knows offline too.
export const config = Object.assign({ ai: false, oura: false, firstRun: false, loaded: false }, (() => { try { return JSON.parse(ls.get(CFG_KEY)) || {}; } catch { return {}; } })());
export async function loadConfig() {
  try {
    const { body } = await api('/config');
    if (body) {
      Object.assign(config, { ai: !!body.ai, oura: !!body.oura, firstRun: !!body.firstRun, loaded: true });
      if (body.role && body.role !== account.role) { account.role = body.role; ls.set(ROLE_KEY, body.role); }
      ls.set(CFG_KEY, JSON.stringify({ ai: config.ai, oura: config.oura }));
    }
  } catch { /* offline: keep the cached answer */ }
  return config;
}

export async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json' };
  if (account.token) headers.authorization = 'Bearer ' + account.token;
  let res;
  try {
    res = await fetch('/api' + path, { ...opts, headers });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  let body = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (res.status === 401 && account.token && path !== '/login') {
    // The saved session is no longer valid (expired after 90 days, or the server was reset).
    signOut();
    throw new Error('Please log in again in Settings.');
  }
  if (!res.ok && res.status !== 409) {
    const err = new Error((body && body.error) || 'Something went wrong.');
    err.status = res.status; err.body = body;
    throw err;
  }
  return { status: res.status, body };
}

function setSession(token, name, role) {
  account.token = token; account.name = name; account.role = role || 'member'; account.baseUpdatedAt = 0;
  ls.set(TOKEN_KEY, token); ls.set(NAME_KEY, name); ls.set(ROLE_KEY, account.role); ls.set(BASE_KEY, '0');
}
export function signOut() {
  account.token = null; account.name = null; account.role = null; account.baseUpdatedAt = 0;
  ls.del(TOKEN_KEY); ls.del(NAME_KEY); ls.del(ROLE_KEY); ls.del(BASE_KEY);
}

function setBase(updatedAt) { account.baseUpdatedAt = updatedAt; ls.set(BASE_KEY, String(updatedAt)); }

function syncablePayload() { return exportData().data; }
function applyCloudData(data, updatedAt) {
  importData({ app: 'nina-fit', version: 2, data });
  setBase(updatedAt);
}

export async function pushNow() {
  if (!isSignedIn()) return;
  account.syncing = true; account.lastError = null;
  try {
    const { status, body } = await api('/sync', { method: 'PUT', body: JSON.stringify({ data: syncablePayload(), baseUpdatedAt: account.baseUpdatedAt }) });
    if (status === 409) { applyCloudData(body.data, body.updatedAt); return { conflict: true }; }
    setBase(body.updatedAt);
    return { pushed: true };
  } catch (e) {
    account.lastError = e.message; throw e;
  } finally {
    account.syncing = false;
  }
}

// Silent pull used on app open/foreground — only applies if the cloud actually has something newer.
export async function pullIfNewer() {
  if (!isSignedIn()) return false;
  try {
    const { body } = await api('/sync', { method: 'GET' });
    if (body && body.data && body.updatedAt > account.baseUpdatedAt) { applyCloudData(body.data, body.updatedAt); return true; }
  } catch { /* offline — fine, local data still works */ }
  return false;
}

export async function signup(name, passcode, invite) {
  const { body } = await api('/signup', { method: 'POST', body: JSON.stringify({ name, passcode, invite }) });
  setSession(body.token, body.name, body.role);
  await pushNow(); // this device's existing local data becomes the first cloud copy
  loadConfig();
}

// Returns { done:true } once signed in with nothing left to resolve, or
// { choice:true, cloudData, cloudUpdatedAt } when both this phone and the cloud already
// have data, so the caller (Settings UI) can ask which one to keep.
export async function login(name, passcode) {
  const { body } = await api('/login', { method: 'POST', body: JSON.stringify({ name, passcode }) });
  setSession(body.token, body.name, body.role);
  loadConfig();
  const { body: syncBody } = await api('/sync', { method: 'GET' });
  if (syncBody && syncBody.data) {
    if (hasData()) return { choice: true, cloudData: syncBody.data, cloudUpdatedAt: syncBody.updatedAt };
    applyCloudData(syncBody.data, syncBody.updatedAt);
    return { done: true };
  }
  await pushNow();
  return { done: true };
}
export function keepThisPhone() {
  // Deliberately overwrite the cloud copy with this phone's data.
  return api('/sync', { method: 'GET' }).then(({ body }) => { if (body && body.updatedAt) setBase(body.updatedAt); return pushNow(); });
}
export function useCloudCopy(cloudData, cloudUpdatedAt) { applyCloudData(cloudData, cloudUpdatedAt); }

// Debounced auto-push: any save() to a synced key schedules a push a couple seconds later,
// so a flurry of edits (typing in Settings, finishing a workout) becomes one network call.
let pushTimer = null;
onSave(keys => {
  if (!isSignedIn()) return;
  if (!keys.some(k => k !== 'activeWorkout' && k !== 'photos')) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushNow().catch(() => {}); }, 2500);
});
