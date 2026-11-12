// Settings: profile, account, connections, units, targets, home cards, backup, and (for the
// app owner) the one-time setup of the AI and Oura keys.
import { state, save, exportData, importData, wipe } from './store.js';
import { $, esc, fmt, num, ymd } from './util.js';
import { actions, inputs, submits, nav, openSheet, closeSheet, confirmSheet, toast, icon } from './ui.js';
import { account, config, api, isSignedIn, isOwner, signup, login, signOut, pushNow, pullIfNewer, keepThisPhone, useCloudCopy, loadConfig } from './sync.js';
import { oura, connectOura, disconnectOura, forgetOura, refreshOura } from './oura.js';

const CARDS = [['nutrition', 'Nutrition'], ['steps', 'Steps'], ['readiness', 'Readiness'], ['weight', 'Weight'], ['week', 'Workouts this week'], ['workout', "Today's workout"], ['todo', 'To-do'], ['coach', 'Coach'], ['calendar', 'Week dots']];
let admin = null; // owner-only setup info, loaded when Settings opens

export function renderSettings() {
  const s = state.settings, t = s.targets, u = s.units;
  const numField = (label, key, val, ph = 'not set', mode = 'decimal') => `<label class="field"><span>${label}</span>
<input type="text" inputmode="${mode}" data-input="set-num" data-k="${key}" value="${val ?? ''}" placeholder="${ph}" autocomplete="off"></label>`;
  const macroKcal = (t.p || 0) * 4 + (t.c || 0) * 4 + (t.f || 0) * 9;
  if (isOwner() && !admin) loadAdmin();
  return `<header class="head"><div class="row"><button class="icon-btn" data-action="tab" data-tab="home" aria-label="Back">${icon.chevL}</button><h1>settings</h1></div></header>

<section class="card"><span class="label">Profile</span>
<label class="field"><span>Name</span><input type="text" data-input="set-text" data-k="name" value="${esc(s.name)}" autocomplete="off"></label></section>

${accountHtml()}
${ouraHtml()}
${isOwner() ? ownerHtml() : ''}

<section class="card" style="--accent:var(--pink-d);--soft:var(--pink-soft)"><span class="label">Daily goals</span>
${numField('Calories', 'targets.kcal', t.kcal)}
<div class="grid3">${numField('Protein g', 'targets.p', t.p, '–')}${numField('Carbs g', 'targets.c', t.c, '–')}${numField('Fat g', 'targets.f', t.f, '–')}</div>
<span class="muted small" id="macro-note">${macroKcal ? `These macros add up to ${fmt(macroKcal, 0)} kcal.` : 'Leave any goal empty to track without one.'}</span>
${numField('Steps', 'stepGoal', s.stepGoal, 'not set', 'numeric')}</section>

<section class="card"><span class="label">Units</span>
<div class="field"><span>Weight</span><div class="seg"><button class="${u === 'lb' ? 'on' : ''}" data-action="set-unit" data-k="units" data-v="lb">Pounds (lb)</button><button class="${u === 'kg' ? 'on' : ''}" data-action="set-unit" data-k="units" data-v="kg">Kilograms (kg)</button></div></div>
<div class="field"><span>Measurements</span><div class="seg"><button class="${s.lenUnits === 'in' ? 'on' : ''}" data-action="set-unit" data-k="lenUnits" data-v="in">Inches</button><button class="${s.lenUnits === 'cm' ? 'on' : ''}" data-action="set-unit" data-k="lenUnits" data-v="cm">Centimeters</button></div></div>
<span class="muted small">Switching units converts everything already logged.</span></section>

<section class="card"><span class="label">Training</span>
<div class="grid3">${numField('Rest (sec)', 'rest', s.rest, '120', 'numeric')}${numField(`Bar (${u})`, 'bar.' + u, s.bar[u], '', 'decimal')}${numField(`Step (${u})`, 'inc.' + u, s.inc[u], '', 'decimal')}</div>
<span class="muted small">Step is the weight increase suggested once you hit all your target reps.</span></section>

<section class="card"><span class="label">Home screen cards</span>
<div class="chips">${CARDS.map(([k, l]) => `<button class="chip${s.hide[k] ? '' : ' on'}" data-action="set-card" data-k="${k}" aria-pressed="${!s.hide[k]}">${l}</button>`).join('')}</div>
<span class="muted small">Tap to show or hide a card on Home.</span></section>

<section class="card"><span class="label">Your data</span>
<span class="muted" style="line-height:1.5">${isSignedIn() ? 'Your account backs everything up except progress photos, which stay on this phone.' : 'Everything is stored on this phone.'} You can also save a backup file any time.</span>
<button class="btn ghost block" data-action="export">Export a backup file</button>
<button class="btn ghost block" data-action="import">Restore from a backup file</button>
<span class="muted small">${s.lastBackup ? 'Last backup file: ' + new Date(s.lastBackup).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No backup file made yet.'}</span>
<button class="btn danger block" data-action="erase">Erase all data on this phone</button></section>

<section class="card"><span class="label">About</span>
<button class="btn ghost block" data-action="intro-replay">Replay the welcome tour</button>
<span class="muted small">Nina Fit · version 2.0 · Food product data from Open Food Facts.</span></section>`;
}

// ---------- account & cloud sync ----------
function lastSyncedLabel() {
  if (!account.baseUpdatedAt) return 'Not synced yet';
  return 'Last synced ' + new Date(account.baseUpdatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function accountHtml() {
  if (isSignedIn()) {
    return `<section class="card tint" id="account-card"><span class="label">Account</span>
<div class="row between"><span class="title">${esc(account.name)}</span>${isOwner() ? '<span class="pill">owner</span>' : ''}</div>
<span class="muted small">${account.syncing ? 'Syncing…' : lastSyncedLabel()}</span>
<span class="muted" style="line-height:1.5">Food, workouts, to-dos, calendar and goals back up here. Progress photos always stay on this phone only.</span>
<button class="btn ghost block" data-action="sync-now">${icon.cloud} Sync now</button>
<button class="btn danger block" data-action="sign-out">Sign out</button></section>`;
  }
  return `<section class="card tint" id="account-card"><span class="label">Account</span>
<span class="muted" style="line-height:1.5">An account backs up your data and switches on the coach, meal photos and Oura. Progress photos always stay on this phone only.</span>
<button class="btn primary block" data-action="account-signup">Create account</button>
<button class="btn ghost block" data-action="account-login">I already have an account</button></section>`;
}
function refreshAccountCard() { const el = document.getElementById('account-card'); if (el) el.outerHTML = accountHtml(); }

const accountForm = (title, submit, cta, invite) => `<div class="col"><div class="sheet-head"><h2 class="sheet-title">${title}</h2><button class="link" data-action="sheet-close">Cancel</button></div>
<form data-submit="${submit}" class="col" style="gap:12px">
<label class="field"><span>Name</span><input type="text" name="name" placeholder="e.g. Nina" autocomplete="off" autocapitalize="words"></label>
<label class="field"><span>Passcode</span><input type="password" name="passcode" placeholder="At least 4 characters" autocomplete="off"></label>
${invite ? `<label class="field"><span>Invite code</span><input type="text" name="invite" placeholder="From the app owner" autocomplete="off" autocapitalize="none"></label>` : ''}
<button class="btn primary block" type="submit">${cta}</button></form>
${submit === 'account-signup-go' ? `<span class="muted small" style="line-height:1.5">${invite ? 'There is no passcode reset, so pick one you will remember.' : 'This is the first account on this app, so it becomes the owner account that can switch on the coach and Oura. There is no passcode reset, so pick one you will remember.'}</span>` : ''}</div>`;

actions['account-signup'] = async () => {
  await loadConfig();
  openSheet(accountForm('Create account', 'account-signup-go', 'Create account', !config.firstRun));
};
actions['account-login'] = () => openSheet(accountForm('Log in', 'account-login-go', 'Log in', false));

let pendingCloudData = null;
submits['account-signup-go'] = async (v, form) => {
  const name = (v.name || '').trim(), passcode = v.passcode || '';
  if (!name) return toast('Enter a name');
  if (passcode.length < 4) return toast('Passcode must be at least 4 characters');
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Creating…';
  try { await signup(name, passcode, (v.invite || '').trim()); admin = null; closeSheet(); nav.render(); toast('Account created. Your data is backed up.'); }
  catch (e) { btn.disabled = false; btn.textContent = 'Create account'; toast(e.message); }
};
submits['account-login-go'] = async (v, form) => {
  const name = (v.name || '').trim(), passcode = v.passcode || '';
  if (!name || !passcode) return toast('Enter your name and passcode');
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const r = await login(name, passcode);
    admin = null;
    if (r.choice) {
      closeSheet();
      openSheet(`<div class="col"><h2 class="sheet-title">Which data should win?</h2>
<p class="muted" style="font-size:15px;line-height:1.5">This phone already has data on it, and so does ${esc(name)}'s account. Keeping this phone's data overwrites the account copy. Using the account copy replaces what is on this phone.</p>
<button class="btn primary block" data-action="account-use-cloud" data-updated-at="${r.cloudUpdatedAt}">Use the account copy</button>
<button class="btn ghost block" data-action="account-keep-phone">Keep this phone's data</button></div>`);
      pendingCloudData = r.cloudData;
      return;
    }
    closeSheet(); nav.render(); toast('Logged in'); refreshOura(true).then(c => c && nav.render());
  } catch (e) { btn.disabled = false; btn.textContent = 'Log in'; toast(e.message); }
};
actions['account-keep-phone'] = async () => { closeSheet(); try { await keepThisPhone(); toast('Kept this phone’s data'); } catch (e) { toast(e.message); } nav.render(); };
actions['account-use-cloud'] = el => {
  useCloudCopy(pendingCloudData, Number(el.dataset.updatedAt)); pendingCloudData = null;
  closeSheet(); nav.go('home'); toast('Restored from your account');
};
actions['sync-now'] = async () => {
  account.syncing = true; refreshAccountCard();
  try { const pulled = await pullIfNewer(); await pushNow(); toast('Synced'); if (pulled) return nav.render(); } catch (e) { toast(e.message); }
  account.syncing = false; refreshAccountCard();
};
actions['sign-out'] = () => confirmSheet({ title: 'Sign out?', text: 'Your data stays on this phone. Sign back in any time to pick up syncing again.', ok: 'Sign out' }, () => {
  signOut(); forgetOura(); admin = null; nav.render(); toast('Signed out');
});

// ---------- Oura ----------
function ouraHtml() {
  if (!isSignedIn()) return '';
  if (!config.oura) {
    return isOwner() ? '' : `<section class="card"><span class="label">Oura ring</span><span class="muted" style="line-height:1.5">Not switched on yet. The app owner can set it up.</span></section>`;
  }
  if (oura.connected) {
    return `<section class="card sage" id="oura-card" style="--accent:var(--sage-d)"><span class="label">Oura ring</span>
<div class="row"><span style="color:var(--sage-d)">${icon.check}</span><span class="sub">Connected</span></div>
<span class="muted" style="line-height:1.5">Steps, readiness and sleep scores show on Home. They stay in those cards and are never shared with the coach.</span>
<button class="btn ghost block" data-action="oura-disconnect">Disconnect Oura</button></section>`;
  }
  return `<section class="card" id="oura-card"><span class="label">Oura ring</span>
<span class="muted" style="line-height:1.5">${oura.expired ? 'The connection expired. Connect again to bring your scores back.' : 'Bring your steps, readiness and sleep scores onto Home. You approve it on Oura\'s own page, and can disconnect any time.'}</span>
<button class="btn primary block" data-action="oura-connect">Connect Oura</button></section>`;
}
actions['oura-connect'] = async el => {
  el.disabled = true; el.textContent = 'Opening Oura…';
  try { await connectOura(); } catch (e) { el.disabled = false; el.textContent = 'Connect Oura'; toast(e.message); }
};
actions['oura-disconnect'] = () => confirmSheet({ title: 'Disconnect Oura?', text: 'The steps and readiness cards go back to empty. You can reconnect any time.', ok: 'Disconnect' }, async () => {
  try { await disconnectOura(); toast('Oura disconnected'); } catch (e) { toast(e.message); }
  nav.render();
});

// ---------- owner setup ----------
async function loadAdmin() {
  try { const { body } = await api('/admin'); admin = body; if (nav.tab === 'settings') nav.render(); }
  catch { admin = { failed: true }; }
}
function ownerHtml() {
  if (!admin || admin.failed) {
    return `<section class="card butter"><span class="label" style="color:var(--butter-d)">App setup (owner)</span><span class="muted">${admin ? 'Could not load. Check your connection.' : 'Loading…'}</span></section>`;
  }
  const state1 = (on, fromSecret) => on ? `<span class="pill" style="--accent:var(--sage-d);--soft:var(--sage-soft)">${fromSecret ? 'on (set in Cloudflare)' : 'on'}</span>` : `<span class="pill" style="--accent:var(--butter-d);--soft:#F1E4BC">not set</span>`;
  return `<section class="card butter" id="owner-card"><span class="label" style="color:var(--butter-d)">App setup (owner)</span>
<span class="muted" style="line-height:1.5">Only you see this card. Keys are stored on the server and never shown again after saving.</span>

<div class="row between"><span class="sub">Coach and meal photos</span>${state1(admin.ai, admin.aiFromSecret)}</div>
<span class="muted small" style="line-height:1.5">Needs an Anthropic API key from console.anthropic.com (pay-as-you-go, usually a few dollars a month for one person).</span>
${admin.aiFromSecret ? '' : `<form data-submit="admin-ai" class="add-row"><input type="password" name="key" placeholder="${admin.ai ? 'Paste a new key to replace' : 'Paste the API key'}" autocomplete="off" aria-label="Anthropic API key"><button class="btn primary" type="submit" style="width:auto;padding:0 16px">Save</button></form>
${admin.ai ? '<button class="link" data-action="admin-clear" data-k="anthropicKey" style="color:var(--danger)">Remove the key</button>' : ''}`}

<div class="row between" style="margin-top:6px"><span class="sub">Oura</span>${state1(admin.oura, admin.ouraFromSecret)}</div>
<span class="muted small" style="line-height:1.5">Create an application at cloud.ouraring.com/oauth/applications and give it this redirect address:</span>
<button class="chip" data-action="copy" data-t="${esc(admin.ouraRedirect)}" style="white-space:normal;text-align:left;min-height:40px;padding:8px 12px;overflow-wrap:anywhere">${esc(admin.ouraRedirect)}</button>
${admin.ouraFromSecret ? '' : `<form data-submit="admin-oura" class="col" style="gap:8px">
<input type="text" name="id" placeholder="Client ID" autocomplete="off" autocapitalize="none" aria-label="Oura client ID">
<input type="password" name="secret" placeholder="Client secret" autocomplete="off" aria-label="Oura client secret">
<button class="btn primary block" type="submit">Save Oura keys</button></form>
${admin.oura ? '<button class="link" data-action="admin-clear" data-k="oura" style="color:var(--danger)">Remove the Oura keys</button>' : ''}`}

<div class="row between" style="margin-top:6px"><span class="sub">Invite code</span>${admin.invite ? `<span class="pill" style="--accent:var(--sage-d);--soft:var(--sage-soft)">${esc(admin.invite)}</span>` : `<span class="pill" style="--accent:var(--butter-d);--soft:#F1E4BC">sign-ups closed</span>`}</div>
<span class="muted small" style="line-height:1.5">Anyone creating another account needs this code. Leave it empty to keep new sign-ups closed.</span>
<form data-submit="admin-invite" class="add-row"><input type="text" name="invite" value="${esc(admin.invite)}" placeholder="e.g. peony-42" maxlength="40" autocomplete="off" autocapitalize="none" aria-label="Invite code"><button class="btn primary" type="submit" style="width:auto;padding:0 16px">Save</button></form>
<span class="muted small">Accounts: ${admin.users.map(x => esc(x.name) + (x.role === 'owner' ? ' (owner)' : '')).join(', ')}</span></section>`;
}
async function putAdmin(body, okMsg) {
  try { await api('/admin', { method: 'PUT', body: JSON.stringify(body) }); toast(okMsg); }
  catch (e) { return toast(e.message); }
  await loadConfig(); admin = null; nav.render();
}
submits['admin-ai'] = v => { const key = (v.key || '').trim(); if (key.length < 20) return toast('That does not look like a full key'); putAdmin({ anthropicKey: key }, 'Saved. The coach is on.'); };
submits['admin-oura'] = v => { const id = (v.id || '').trim(), secret = (v.secret || '').trim(); if (!id || !secret) return toast('Enter both the client ID and the secret'); putAdmin({ ouraClientId: id, ouraClientSecret: secret }, 'Saved. Oura is on.'); };
submits['admin-invite'] = v => putAdmin({ invite: (v.invite || '').trim() }, (v.invite || '').trim() ? 'Invite code saved' : 'Sign-ups closed');
actions['admin-clear'] = el => confirmSheet({ title: 'Remove it?', text: 'That feature switches off until a new key is saved.', ok: 'Remove', danger: true }, () => {
  putAdmin(el.dataset.k === 'oura' ? { ouraClientId: '', ouraClientSecret: '' } : { anthropicKey: '' }, 'Removed');
});
actions['copy'] = async el => { try { await navigator.clipboard.writeText(el.dataset.t); toast('Copied'); } catch { toast('Press and hold to copy'); } };

function setPath(key, val) {
  const parts = key.split('.'); let o = state.settings;
  while (parts.length > 1) o = o[parts.shift()];
  o[parts[0]] = val;
}
inputs['set-text'] = el => { setPath(el.dataset.k, el.value.trim()); save('settings'); };
inputs['set-num'] = el => {
  const k = el.dataset.k; let n = num(el.value);
  if (n != null && n < 0) n = null;
  if (k === 'rest') n = n == null ? 120 : Math.min(900, Math.max(5, Math.round(n)));
  else if (k.startsWith('bar.') || k.startsWith('inc.')) { if (n == null) return; }
  else if (n === 0) n = null;
  if (k === 'stepGoal' && n != null) n = Math.round(n);
  setPath(k, n); save('settings');
  const t = state.settings.targets, note = $('#macro-note'), mk = (t.p || 0) * 4 + (t.c || 0) * 4 + (t.f || 0) * 9;
  if (note) note.textContent = mk ? `These macros add up to ${fmt(mk, 0)} kcal.` : 'Leave any goal empty to track without one.';
};
actions['set-unit'] = el => { state.settings[el.dataset.k] = el.dataset.v; save('settings'); nav.render(); };
actions['set-card'] = el => { const k = el.dataset.k; if (state.settings.hide[k]) delete state.settings.hide[k]; else state.settings.hide[k] = true; save('settings'); nav.render(); };

// ---------- backup ----------
actions['export'] = async () => {
  const json = JSON.stringify(exportData(), null, 2), name = `nina-fit-backup-${ymd()}.json`;
  const done = () => { state.settings.lastBackup = new Date().toISOString(); save('settings'); nav.render(); toast('Backup exported'); };
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Nina Fit backup' });
      return done();
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // share sheet dismissed
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  done();
};
actions['import'] = () => {
  const inp = $('#import-file');
  inp.value = '';
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      let obj;
      try { obj = JSON.parse(r.result); } catch { return toast('That file could not be read'); }
      if (!obj || obj.app !== 'nina-fit' || !obj.data) return toast('That is not a Nina Fit backup');
      const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'unknown date';
      confirmSheet({ title: 'Restore this backup?', text: `Backup from ${when}. It replaces everything currently on this phone${isSignedIn() ? ' and in your account' : ''}.`, ok: 'Restore', danger: true }, () => {
        try { importData(obj); nav.go('home'); toast('Backup restored'); } catch (e) { toast(e.message || 'Restore failed'); }
      });
    };
    r.readAsText(f);
  };
  inp.click();
};
actions['erase'] = () => confirmSheet({ title: 'Erase all data?', text: `This removes every log, list and setting from this phone${isSignedIn() ? ', and from your account at the next sync' : ''}. Export a backup first if you might want it back.`, ok: 'Erase everything', danger: true }, () => {
  wipe(); state.settings.onboarded = true; save('settings'); nav.go('home'); toast('All data erased');
});
