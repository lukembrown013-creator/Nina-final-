// Nina Fit API. Everything that is not under /api/ is served as a static file.
//
// One Worker, one D1 database, no dependencies. The database tables are created
// automatically on first use, and the session signing secret is generated and kept in
// the database, so deploying needs no manual setup steps.
//
// Optional keys (AI coach + meal scan, Oura) can be set either as Cloudflare secrets
// (ANTHROPIC_API_KEY, OURA_CLIENT_ID, OURA_CLIENT_SECRET) or from the app itself in
// Settings > App setup, which stores them in the database. Secrets win if both exist.
//
// IMPORTANT: Oura's API agreement forbids sending Oura data to any AI model. Nothing in
// the /api/oura/* code path touches the AI code path, and the client never includes
// Oura data in what it sends to /api/ai/*. Keep it that way.

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }
});

const MODELS = ['claude-sonnet-5-5', 'claude-sonnet-4-5']; // tried in order if one is unavailable
const LIMITS = { chat: 120, meal: 40, loginfail: 15 };      // per user, per day
const NINETY_DAYS = 1000 * 60 * 60 * 24 * 90;
const UA = 'NinaFit/2.0 (personal single-household fitness app)';

// ---------- bytes <-> hex / base64url ----------
const enc = new TextEncoder(), dec = new TextDecoder();
const toHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; };
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; }
const today = () => new Date().toISOString().slice(0, 10);

// ---------- database ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, passcode_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_nocase ON users (name COLLATE NOCASE)`,
  `CREATE TABLE IF NOT EXISTS sync_state (user_id INTEGER PRIMARY KEY, data BLOB NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS oura_tokens (user_id INTEGER PRIMARY KEY, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS usage (user_id INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day, kind))`
];
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(e => { schemaReady = null; throw e; });
  }
  return schemaReady;
}
async function getMeta(env, key) {
  const row = await env.DB.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}
async function setMeta(env, key, value) {
  if (value == null || value === '') return env.DB.prepare('DELETE FROM meta WHERE key = ?').bind(key).run();
  return env.DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)).run();
}
// Counts one use and reports whether the daily limit has been passed.
async function overLimit(env, uid, kind) {
  const row = await env.DB.prepare(
    'INSERT INTO usage (user_id, day, kind, n) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, day, kind) DO UPDATE SET n = n + 1 RETURNING n'
  ).bind(uid, today(), kind).first();
  return (row ? row.n : 1) > LIMITS[kind];
}

// The sync payload is stored gzipped so years of logs stay far below D1's row size limit.
async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ---------- keys and settings ----------
let cachedSecret = null;
async function sessionSecret(env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  let s = await getMeta(env, 'session_secret');
  if (!s) {
    s = toHex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').bind('session_secret', s).run();
    s = await getMeta(env, 'session_secret'); // whichever request won the race
  }
  cachedSecret = s;
  return s;
}
const anthropicKey = async env => env.ANTHROPIC_API_KEY || await getMeta(env, 'anthropic_key');
async function ouraApp(env) {
  const id = env.OURA_CLIENT_ID || await getMeta(env, 'oura_client_id');
  const secret = env.OURA_CLIENT_SECRET || await getMeta(env, 'oura_client_secret');
  return id && secret ? { id, secret } : null;
}

// ---------- passcodes (PBKDF2-SHA256) and session tokens (HMAC-SHA256) ----------
async function hashPasscode(passcode, saltBytes) {
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}
async function hmacKey(env) {
  return crypto.subtle.importKey('raw', enc.encode(await sessionSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signToken(env, payloadObj) {
  const payload = b64url(enc.encode(JSON.stringify(payloadObj)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload));
  return payload + '.' + b64url(new Uint8Array(sig));
}
async function verifyToken(env, token) {
  const [payload, sigPart] = String(token || '').split('.');
  if (!payload || !sigPart) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(sigPart), enc.encode(payload)); } catch { return null; }
  if (!ok) return null;
  try {
    const obj = JSON.parse(dec.decode(fromB64url(payload)));
    if (!obj || !obj.exp || obj.exp < Date.now()) return null;
    return obj;
  } catch { return null; }
}
async function requireUser(request, env) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  const payload = await verifyToken(env, m[1]);
  if (!payload || payload.t) return null; // payload.t marks single-purpose tokens (e.g. the Oura connect state)
  const row = await env.DB.prepare('SELECT id, name, role FROM users WHERE id = ?').bind(payload.uid).first();
  return row || null;
}

// ---------- accounts ----------
async function config(request, env) {
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  const user = await requireUser(request, env);
  return json({
    version: '2.0',
    firstRun: !n || n.n === 0,          // the first account created becomes the owner
    ai: !!(await anthropicKey(env)),
    oura: !!(await ouraApp(env)),
    role: user ? user.role : null
  });
}

async function signup(request, env) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name || '').trim();
  const passcode = String(body?.passcode || '');
  if (!name || name.length > 40) return json({ error: 'Enter a name.' }, 400);
  if (passcode.length < 4) return json({ error: 'Passcode must be at least 4 characters.' }, 400);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  const first = !count || count.n === 0;
  if (!first) {
    // After the owner's account exists, new accounts need the invite code the owner set.
    const invite = await getMeta(env, 'invite_code');
    if (!invite) return json({ error: 'New accounts are closed. Ask the app owner to set an invite code in Settings.' }, 403);
    if (String(body?.invite || '').trim().toLowerCase() !== invite.toLowerCase()) return json({ error: 'That invite code is not right.', needInvite: true }, 403);
  }
  const existing = await env.DB.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').bind(name).first();
  if (existing) return json({ error: 'That name already has an account. Try logging in instead.' }, 409);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPasscode(passcode, salt);
  const now = Date.now(), role = first ? 'owner' : 'member';
  const res = await env.DB.prepare('INSERT INTO users (name, passcode_hash, salt, role, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(name, toHex(hash), toHex(salt), role, now).run();
  const token = await signToken(env, { uid: res.meta.last_row_id, exp: now + NINETY_DAYS });
  return json({ token, name, role }, 201);
}

async function login(request, env) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name || '').trim();
  const passcode = String(body?.passcode || '');
  const row = await env.DB.prepare('SELECT id, name, role, passcode_hash, salt FROM users WHERE name = ? COLLATE NOCASE').bind(name).first();
  if (!row) return json({ error: 'No account with that name. Check the spelling, or create one.' }, 401);
  const fails = await env.DB.prepare('SELECT n FROM usage WHERE user_id = ? AND day = ? AND kind = ?').bind(row.id, today(), 'loginfail').first();
  if (fails && fails.n >= LIMITS.loginfail) return json({ error: 'Too many wrong passcodes today. Try again tomorrow.' }, 429);
  const hash = await hashPasscode(passcode, fromHex(row.salt));
  if (!timingSafeEqual(hash, fromHex(row.passcode_hash))) {
    await overLimit(env, row.id, 'loginfail');
    return json({ error: 'Wrong passcode.' }, 401);
  }
  const token = await signToken(env, { uid: row.id, exp: Date.now() + NINETY_DAYS });
  return json({ token, name: row.name, role: row.role });
}

// ---------- owner setup ----------
async function getAdmin(request, env, user) {
  const users = await env.DB.prepare('SELECT name, role FROM users ORDER BY id').all();
  return json({
    ai: !!(await anthropicKey(env)), aiFromSecret: !!env.ANTHROPIC_API_KEY,
    oura: !!(await ouraApp(env)), ouraFromSecret: !!(env.OURA_CLIENT_ID && env.OURA_CLIENT_SECRET),
    ouraRedirect: new URL('/api/oura/callback', request.url).toString(),
    invite: (await getMeta(env, 'invite_code')) || '',
    users: (users.results || []).map(u => ({ name: u.name, role: u.role }))
  });
}
async function putAdmin(request, env) {
  const b = await request.json().catch(() => null);
  if (!b) return json({ error: 'Bad request.' }, 400);
  if (typeof b.anthropicKey === 'string') await setMeta(env, 'anthropic_key', b.anthropicKey.trim());
  if (typeof b.ouraClientId === 'string') await setMeta(env, 'oura_client_id', b.ouraClientId.trim());
  if (typeof b.ouraClientSecret === 'string') await setMeta(env, 'oura_client_secret', b.ouraClientSecret.trim());
  if (typeof b.invite === 'string') await setMeta(env, 'invite_code', b.invite.trim().slice(0, 40));
  return json({ ok: true });
}

// ---------- cloud sync (whole-state, last write wins, with a conflict check) ----------
async function getSync(env, user) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM sync_state WHERE user_id = ?').bind(user.id).first();
  if (!row) return json({ data: null, updatedAt: 0 });
  return json({ data: JSON.parse(await gunzip(row.data)), updatedAt: row.updated_at });
}
async function putSync(request, env, user) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.data !== 'object' || body.data === null) return json({ error: 'Bad request.' }, 400);
  const baseUpdatedAt = Number(body.baseUpdatedAt) || 0;
  const row = await env.DB.prepare('SELECT updated_at, data FROM sync_state WHERE user_id = ?').bind(user.id).first();
  const serverUpdatedAt = row ? row.updated_at : 0;
  // Another device pushed a newer copy than the one this device last saw.
  if (row && serverUpdatedAt > baseUpdatedAt) return json({ conflict: true, data: JSON.parse(await gunzip(row.data)), updatedAt: serverUpdatedAt }, 409);
  const packed = await gzip(JSON.stringify(body.data));
  if (packed.length > 1_800_000) return json({ error: 'Your data is too large to sync. Export a backup and tell the app owner.' }, 413);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sync_state (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
    .bind(user.id, packed, now).run();
  return json({ updatedAt: now });
}

// ---------- food database (Open Food Facts, proxied so we can identify ourselves) ----------
const round1 = n => Math.round((Number(n) || 0) * 10) / 10;
function offFood(p) {
  const n = p.nutriments || {};
  const perServing = n['energy-kcal_serving'] != null && p.serving_size;
  const pick = k => (perServing ? n[k + '_serving'] : n[k + '_100g']) ?? 0;
  const name = String(p.product_name || p.product_name_en || '').trim();
  if (!name) return null;
  const kcal = pick('energy-kcal');
  const brand = String(Array.isArray(p.brands) ? p.brands[0] || '' : p.brands || '').split(',')[0].trim();
  return {
    code: p.code || '', name, brand,
    serving: perServing ? String(p.serving_size) : '100 g',
    kcal: Math.round(Number(kcal) || 0), p: round1(pick('proteins')), c: round1(pick('carbohydrates')), f: round1(pick('fat'))
  };
}
async function offFetch(env, url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw new Error('off ' + res.status);
  return res.json();
}
const OFF_FIELDS = 'code,product_name,brands,serving_size,nutriments';
async function foodLookup(env, barcode) {
  if (!/^[0-9]{6,14}$/.test(barcode)) return json({ error: 'That is not a valid barcode.' }, 400);
  let body;
  try { body = await offFetch(env, `${env.OFF_BASE || 'https://world.openfoodfacts.org'}/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`); }
  catch (e) {
    if (String(e.message).includes('404')) return json({ found: false });
    return json({ error: "Couldn't reach the food database." }, 502);
  }
  if (!body || body.status !== 1 || !body.product) return json({ found: false });
  const f = offFood({ ...body.product, code: barcode });
  return f ? json({ found: true, ...f }) : json({ found: false });
}
async function foodSearch(env, q) {
  q = q.trim().slice(0, 80);
  if (q.length < 2) return json({ foods: [] });
  let products = null;
  // The newer full-text search service first, then the legacy search endpoint.
  try {
    const b = await offFetch(env, `${env.OFF_SEARCH_BASE || 'https://search.openfoodfacts.org'}/search?q=${encodeURIComponent(q)}&page_size=24&fields=${OFF_FIELDS}`);
    if (b && Array.isArray(b.hits)) products = b.hits;
  } catch { /* fall through */ }
  if (!products || !products.length) {
    try {
      const b = await offFetch(env, `${env.OFF_BASE || 'https://world.openfoodfacts.org'}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${OFF_FIELDS}`);
      if (b && Array.isArray(b.products)) products = b.products;
    } catch { /* fall through */ }
  }
  if (!products) return json({ error: "Couldn't reach the food database." }, 502);
  const seen = new Set(), foods = [];
  for (const p of products) {
    const f = offFood(p);
    if (!f || !f.kcal) continue;
    const k = (f.name + '|' + f.brand).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); foods.push(f);
  }
  return json({ foods });
}

// ---------- AI (Anthropic) ----------
async function callClaude(env, payload) {
  const key = await anthropicKey(env);
  if (!key) return { error: 'The AI features are not set up yet. The app owner can add a key in Settings.', status: 503 };
  const models = env.AI_MODEL ? [env.AI_MODEL] : MODELS;
  let last = null;
  for (const model of models) {
    let res;
    try {
      res = await fetch((env.ANTHROPIC_BASE || 'https://api.anthropic.com') + '/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, ...payload })
      });
    } catch { return { error: "Couldn't reach the AI service. Try again in a moment.", status: 502 }; }
    const body = await res.json().catch(() => null);
    if (res.ok && body) return { body };
    last = { res, body };
    if (res.status === 404) continue; // model name not available on this account: try the next one
    break;
  }
  const s = last ? last.res.status : 502;
  if (s === 401 || s === 403) return { error: 'The AI key was rejected. The app owner should check it in Settings.', status: 502 };
  if (s === 429 || s === 529) return { error: 'The AI service is busy right now. Try again in a minute.', status: 503 };
  if (s === 400 && last.body?.error?.message?.includes('credit')) return { error: 'The AI account is out of credit. The app owner can top it up at console.anthropic.com.', status: 503 };
  return { error: 'The AI service had a problem. Try again in a moment.', status: 502 };
}

const MEAL_TOOL = {
  name: 'report_meal',
  description: 'Report the foods identified in the meal with estimated nutrition.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Short food name, e.g. "Grilled chicken breast"' },
            serving: { type: 'string', description: 'Estimated portion in everyday terms, e.g. "1 cup", "150 g", "2 slices"' },
            kcal: { type: 'number' }, p: { type: 'number', description: 'protein grams' },
            c: { type: 'number', description: 'carbohydrate grams' }, f: { type: 'number', description: 'fat grams' }
          },
          required: ['name', 'serving', 'kcal', 'p', 'c', 'f']
        }
      },
      note: { type: 'string', description: 'One short sentence on what was assumed or is uncertain (portion sizes, hidden oils, sauces). Empty if nothing notable.' }
    },
    required: ['items', 'note']
  }
};
async function aiMeal(request, env, user) {
  const b = await request.json().catch(() => null);
  const text = String(b?.text || '').trim().slice(0, 600);
  const image = typeof b?.image === 'string' ? b.image : '';
  if (!text && !image) return json({ error: 'Add a photo or describe the meal.' }, 400);
  if (image.length > 4_000_000) return json({ error: 'That photo is too large.' }, 413);
  if (await overLimit(env, user.id, 'meal')) return json({ error: 'You have reached today\'s limit for meal scans. It resets tomorrow.' }, 429);
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } });
  content.push({ type: 'text', text: text ? `The person describes this meal as: "${text}"` : 'Identify the foods in this photo.' });
  const r = await callClaude(env, {
    max_tokens: 1200,
    system: 'You estimate the nutrition of meals for a food diary. List each distinct food as its own item with a realistic portion and calories, protein, carbs and fat for that portion. Use the photo for portion size when there is one, and standard reference values for the nutrition. Be realistic rather than conservative: include cooking oil, dressings and sauces when they are likely. If the input is not food, return an empty items list and say so in the note.',
    tools: [MEAL_TOOL], tool_choice: { type: 'tool', name: 'report_meal' },
    messages: [{ role: 'user', content }]
  });
  if (r.error) return json({ error: r.error }, r.status);
  const call = (r.body.content || []).find(c => c.type === 'tool_use');
  const items = Array.isArray(call?.input?.items) ? call.input.items : [];
  return json({
    items: items.slice(0, 12).map(i => ({
      name: String(i.name || 'Food').slice(0, 80), serving: String(i.serving || '1 serving').slice(0, 40),
      kcal: Math.max(0, Math.round(Number(i.kcal) || 0)), p: round1(i.p), c: round1(i.c), f: round1(i.f)
    })),
    note: String(call?.input?.note || '').slice(0, 300)
  });
}

const COACH_TOOLS = [
  { name: 'add_todo', description: 'Add an item to her to-do list. Use when she asks you to remember or add a task.',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD the task is for. Omit for an anytime task.' }, star: { type: 'boolean', description: 'true if it is a top priority' } }, required: ['text'] } },
  { name: 'add_event', description: 'Add something to her calendar on a specific day.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM in 24-hour time, optional' } }, required: ['title', 'date'] } },
  { name: 'log_food', description: 'Log a food she says she ate, with your best nutrition estimate for the portion.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, serving: { type: 'string' }, meal: { type: 'string', enum: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] }, kcal: { type: 'number' }, p: { type: 'number' }, c: { type: 'number' }, f: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' } }, required: ['name', 'serving', 'meal', 'kcal', 'p', 'c', 'f'] } },
  { name: 'log_weight', description: 'Log a body weight she tells you.',
    input_schema: { type: 'object', properties: { value: { type: 'number' }, unit: { type: 'string', enum: ['lb', 'kg'] }, date: { type: 'string', description: 'YYYY-MM-DD, defaults to today' } }, required: ['value', 'unit'] } },
  { name: 'create_workout', description: 'Save a reusable workout template to her Train tab. Only when she asks you to build or save one.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: 'Usual weekdays, Monday = 0. Optional.' },
      exercises: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, sets: { type: 'integer' }, reps: { type: 'string', description: 'e.g. "8-10"' } }, required: ['name', 'sets'] } } }, required: ['name', 'exercises'] } }
];
function coachSystem(ctx) {
  return `You are the coach inside ${ctx?.name ? ctx.name + "'s" : 'a'} personal fitness and planner app. You are warm, encouraging and practical, like a knowledgeable friend, and you keep replies short: a few sentences, or a short list when she asks for a plan. Plain text only, no markdown headings or tables.

You help with training, nutrition, habits and planning her days. Use the snapshot of her app data below when it is relevant, and use the tools to actually do things in the app (add a to-do, put something on the calendar, log food or weight, save a workout) when she asks. After using a tool, confirm in one short line. Ask before logging anything she did not clearly ask you to log.

Stay evidence-based and moderate. Never suggest very low calorie intakes, rapid weight loss, skipping meals to compensate, or training through pain. You are not a medical professional: for injuries, symptoms, medication or anything clinical, say so briefly and suggest she check with one. If she seems to be struggling with food or body image, respond with care and without numbers.

You cannot see her wearable or sleep data, so do not guess at it; if she asks about it, tell her that information stays private to the app's own cards.

Her app data right now (JSON):
${JSON.stringify(ctx || {}).slice(0, 9000)}`;
}
async function aiChat(request, env, user) {
  const b = await request.json().catch(() => null);
  if (!b || !Array.isArray(b.messages) || !b.messages.length) return json({ error: 'Bad request.' }, 400);
  if (JSON.stringify(b.messages).length > 60000) return json({ error: 'That conversation is too long. Start a new chat.' }, 413);
  if (await overLimit(env, user.id, 'chat')) return json({ error: 'You have reached today\'s limit for coach messages. It resets tomorrow.' }, 429);
  const r = await callClaude(env, { max_tokens: 1000, system: coachSystem(b.context), tools: COACH_TOOLS, messages: b.messages.slice(-40) });
  if (r.error) return json({ error: r.error }, r.status);
  return json({ content: r.body.content || [], stop_reason: r.body.stop_reason });
}

// ---------- Oura (steps, readiness, sleep). Never passed to the AI. ----------
const OURA_API = env => env.OURA_API_BASE || 'https://api.ouraring.com';
const OURA_AUTH = env => env.OURA_AUTH_BASE || 'https://cloud.ouraring.com';
async function ouraToken(env, app, params) {
  const res = await fetch(OURA_API(env) + '/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: app.id, client_secret: app.secret }).toString()
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) throw new Error('oura token ' + res.status);
  return body;
}
async function saveOuraTokens(env, uid, t, oldRefresh) {
  await env.DB.prepare('INSERT INTO oura_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at')
    .bind(uid, t.access_token, t.refresh_token || oldRefresh || null, Date.now() + (Number(t.expires_in) || 86400) * 1000).run();
}
async function ouraConnect(request, env, user) {
  const app = await ouraApp(env);
  if (!app) return json({ error: 'Oura is not set up yet. The app owner can add it in Settings.' }, 503);
  const state = await signToken(env, { uid: user.id, t: 'oura', exp: Date.now() + 15 * 60 * 1000 });
  const u = new URL(OURA_AUTH(env) + '/oauth/authorize');
  u.search = new URLSearchParams({ response_type: 'code', client_id: app.id, redirect_uri: new URL('/api/oura/callback', request.url).toString(), scope: 'daily', state }).toString();
  return json({ url: u.toString() });
}
async function ouraCallback(request, env) {
  const url = new URL(request.url), back = status => Response.redirect(new URL('/?oura=' + status, request.url).toString(), 302);
  const st = await verifyToken(env, url.searchParams.get('state'));
  const code = url.searchParams.get('code');
  if (!st || st.t !== 'oura' || !code) return back(url.searchParams.get('error') ? 'denied' : 'error');
  const app = await ouraApp(env);
  if (!app) return back('error');
  try {
    const t = await ouraToken(env, app, { grant_type: 'authorization_code', code, redirect_uri: new URL('/api/oura/callback', request.url).toString() });
    await saveOuraTokens(env, st.uid, t);
  } catch { return back('error'); }
  return back('connected');
}
async function ouraAccess(env, uid) {
  const row = await env.DB.prepare('SELECT access_token, refresh_token, expires_at FROM oura_tokens WHERE user_id = ?').bind(uid).first();
  if (!row) return null;
  if (row.expires_at - Date.now() > 5 * 60 * 1000) return row.access_token;
  const app = await ouraApp(env);
  if (!app || !row.refresh_token) return null;
  try {
    const t = await ouraToken(env, app, { grant_type: 'refresh_token', refresh_token: row.refresh_token });
    await saveOuraTokens(env, uid, t, row.refresh_token);
    return t.access_token;
  } catch { return null; }
}
async function ouraDaily(request, env, user) {
  const url = new URL(request.url);
  const start = url.searchParams.get('start') || '', end = url.searchParams.get('end') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return json({ error: 'Bad dates.' }, 400);
  const has = await env.DB.prepare('SELECT 1 AS x FROM oura_tokens WHERE user_id = ?').bind(user.id).first();
  if (!has) return json({ connected: false, days: {} });
  const access = await ouraAccess(env, user.id);
  if (!access) return json({ connected: false, expired: true, days: {} });
  // Oura's activity endpoint treats end_date as exclusive, so ask for one day more and filter.
  const endPlus = new Date(Date.parse(end + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
  const get = async kind => {
    const res = await fetch(`${OURA_API(env)}/v2/usercollection/${kind}?start_date=${start}&end_date=${endPlus}`, { headers: { authorization: 'Bearer ' + access } });
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) return [];
    const b = await res.json().catch(() => null);
    return Array.isArray(b?.data) ? b.data : [];
  };
  let act, ready, sleep;
  try { [act, ready, sleep] = await Promise.all([get('daily_activity'), get('daily_readiness'), get('daily_sleep')]); }
  catch { return json({ connected: false, expired: true, days: {} }); }
  const days = {}, at = d => (days[d] = days[d] || {});
  for (const a of act) if (a.day >= start && a.day <= end) Object.assign(at(a.day), { steps: a.steps ?? null, activeKcal: a.active_calories ?? null, activity: a.score ?? null });
  for (const r of ready) if (r.day >= start && r.day <= end) Object.assign(at(r.day), { readiness: r.score ?? null });
  for (const s of sleep) if (s.day >= start && s.day <= end) Object.assign(at(s.day), { sleep: s.score ?? null });
  return json({ connected: true, days });
}
async function ouraDisconnect(env, user) {
  await env.DB.prepare('DELETE FROM oura_tokens WHERE user_id = ?').bind(user.id).run();
  return json({ ok: true });
}

// ---------- router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname, m = request.method;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (!env.DB) return json({ error: 'The database is not connected yet.' }, 503);
      await ensureSchema(env);
      // public
      if (m === 'GET' && path === '/api/config') return await config(request, env);
      if (m === 'POST' && path === '/api/signup') return await signup(request, env);
      if (m === 'POST' && path === '/api/login') return await login(request, env);
      if (m === 'GET' && path === '/api/oura/callback') return await ouraCallback(request, env);
      const foodMatch = path.match(/^\/api\/food\/([0-9A-Za-z]+)$/);
      if (m === 'GET' && foodMatch) return await foodLookup(env, foodMatch[1]);
      if (m === 'GET' && path === '/api/foods') return await foodSearch(env, url.searchParams.get('q') || '');
      // signed in
      const user = await requireUser(request, env);
      if (!user) return json({ error: 'Not signed in.' }, 401);
      if (m === 'GET' && path === '/api/sync') return await getSync(env, user);
      if (m === 'PUT' && path === '/api/sync') return await putSync(request, env, user);
      if (m === 'POST' && path === '/api/ai/meal') return await aiMeal(request, env, user);
      if (m === 'POST' && path === '/api/ai/chat') return await aiChat(request, env, user);
      if (m === 'GET' && path === '/api/oura/connect') return await ouraConnect(request, env, user);
      if (m === 'GET' && path === '/api/oura/daily') return await ouraDaily(request, env, user);
      if (m === 'POST' && path === '/api/oura/disconnect') return await ouraDisconnect(env, user);
      if (path === '/api/admin') {
        if (user.role !== 'owner') return json({ error: 'Only the app owner can do that.' }, 403);
        if (m === 'GET') return await getAdmin(request, env, user);
        if (m === 'PUT') return await putAdmin(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.error(e && e.stack || e);
      return json({ error: 'Server error' }, 500);
    }
  }
};
