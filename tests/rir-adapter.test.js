// Adaptador de Supabase: columna sets.rir (opcional) y estado de la app en el servidor (opcional).
// La app debe seguir guardando series si el SQL todavía no se ha ejecutado.
//   npm test
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'js', 'api-supabase.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8') + "\nconst SUPABASE_URL='https://x.supabase.co';const SUPABASE_KEY='sb_publishable_test';";
const store = {};
global.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.window = global;
global.supabase = require('@supabase/supabase-js');
const jwt = (() => { const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'); const p = Buffer.from(JSON.stringify({ sub: 'u1', email: 'x@y.z', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url'); return h + '.' + p + '.s'; })();
let reqs = [], setsRows = [], mode = {};
global.fetch = async (url, opt = {}) => {
  url = String(url); const body = opt.body ? String(opt.body) : '', m = opt.method || 'GET';
  reqs.push({ m, url, body });
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
  if (url.includes('/auth/v1/token')) return J({ access_token: jwt, token_type: 'bearer', expires_in: 3600, refresh_token: 'r1', user: { id: 'u1', email: 'x@y.z', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } });
  if (url.includes('/rest/v1/allowed_users') && m === 'GET') return J({ profile: 'David', altura: 166 });
  if (url.includes('/rest/v1/sets') && m === 'GET') {
    const u = new URL(url); if (u.searchParams.get('select') === 'rir') return mode.noColumn ? J({ code: '42703', message: 'column sets.rir does not exist' }, 400) : J([]);
    const off = Number(u.searchParams.get('offset') || 0), lim = Number(u.searchParams.get('limit') || 1000); return J(setsRows.slice(off, off + lim));
  }
  if (url.includes('/rest/v1/sets') && m === 'POST') { if (mode.rejectRir && /"rir"/.test(body)) return J({ code: 'PGRST204', message: "Could not find the 'rir' column of 'sets' in the schema cache" }, 400); return new Response(null, { status: 201 }); }
  if (url.includes('/rest/v1/sets') && m === 'PATCH') return new Response(null, { status: 204 });
  if (url.includes('/rpc/state_get')) return mode.noFn ? J({ code: 'PGRST202', message: 'Could not find the function public.state_get(k) in the schema cache' }, 404) : J(mode.stateRows || []);
  if (url.includes('/rpc/state_set')) return mode.noFn ? J({ code: 'PGRST202', message: 'Could not find the function public.state_set(k, v) in the schema cache' }, 404) : J('2026-11-22T10:00:00+00:00');
  if (url.includes('/rpc/partner_week_volume')) return J(1);
  return new Response(null, { status: 201 });
};
global.getProfile = () => localStorage.getItem('profile');
eval(code + ';global.__t={sbLogin,sbRequest,sbToSheetRow,rirColumnReady,rirColumnSet}');
const T = global.__t;
setTimeout(() => { console.error('FALLO: tiempo agotado'); process.exit(2); }, 20000);
const post = () => reqs.filter(r => r.m === 'POST' && r.url.includes('/rest/v1/sets')).pop();
const entry = (id, rir) => ({ id, fecha: '2026-11-22', dia: 'Día 1', grupo: 'X', ejercicio: 'Press', peso: 30, reps: 8, series: 1, variante: '', calentamiento: false, rir });

(async () => {
  await T.sbLogin('google.id.token'); localStorage.setItem('profile', 'David');
  // 1) sin columna: se detecta al descargar, no se envía rir y las filas llevan RIR vacío
  assert.strictEqual(T.rirColumnReady(), false);
  setsRows = [{ id: 'a', profile: 'David', fecha: '2026-11-01', dia: 'D', grupo: 'G', ejercicio: 'Press', peso: 30, reps: 6, series: 1, nota: null, rm: 36, variante: null, calentamiento: false }];
  let rows = await T.sbRequest({ action: 'list' }); assert.strictEqual(T.rirColumnReady(), false, 'filas sin la clave rir: no hay columna'); assert.strictEqual(rows[0]['RIR'], '', 'RIR vacío');
  await T.sbRequest({ entries: [entry('n1', 2)] }); assert(!/"rir"/.test(post().body), 'sin columna no se envía rir (guardar la serie es lo primero)');
  // 2) con columna: se detecta por la clave en las filas, y se envía
  setsRows = [{ id: 'a', profile: 'David', fecha: '2026-11-01', dia: 'D', grupo: 'G', ejercicio: 'Press', peso: 30, reps: 6, series: 1, nota: null, rm: 36, variante: null, calentamiento: false, rir: 2 }, { id: 'b', profile: 'David', fecha: '2026-11-02', dia: 'D', grupo: 'G', ejercicio: 'Press', peso: 30, reps: 6, series: 1, nota: null, rm: 36, variante: null, calentamiento: false, rir: null }];
  rows = await T.sbRequest({ action: 'list' }); assert.strictEqual(T.rirColumnReady(), true, 'la clave rir está en las filas: hay columna'); assert.strictEqual(rows[0]['RIR'], 2); assert.strictEqual(rows[1]['RIR'], '', 'null -> vacío');
  await T.sbRequest({ entries: [entry('n2', 1), entry('n3', null)] });
  const b = JSON.parse(post().body); assert.strictEqual(b.find(x => x.id === 'n2').rir, 1); assert.strictEqual(b.find(x => x.id === 'n3').rir, null, 'con columna, las series sin RIR van con null');
  // sin filas: se sondea la columna
  setsRows = []; await T.sbRequest({ action: 'list' }); assert.strictEqual(T.rirColumnReady(), true, 'sin filas se sondea y existe'); mode.noColumn = true; await T.sbRequest({ action: 'list' }); assert.strictEqual(T.rirColumnReady(), false, 'el sondeo falla: no hay columna'); mode.noColumn = false;
  // 3) la columna desaparece (o el SQL se revirtió): se reintenta sin rir y la serie se guarda igual
  T.rirColumnSet(true); mode.rejectRir = true; reqs = [];
  const r3 = await T.sbRequest({ entries: [entry('n4', 2)] }); assert(r3.ok && r3.count === 1, 'la serie se guarda');
  const posts = reqs.filter(r => r.m === 'POST' && r.url.includes('/rest/v1/sets')); assert.strictEqual(posts.length, 2, 'primer intento con rir y reintento sin él'); assert(/"rir"/.test(posts[0].body) && !/"rir"/.test(posts[1].body)); assert.strictEqual(T.rirColumnReady(), false, 'se recuerda que no hay columna'); mode.rejectRir = false;
  // otro error con rir en el cuerpo no se confunde con esto
  // 4) anotar el RIR de una serie ya guardada
  reqs = []; assert.deepStrictEqual(await T.sbRequest({ action: 'setRir', id: 'n1', rir: 2 }), { ok: true, local: true }); assert(!reqs.some(r => r.m === 'PATCH'), 'sin columna no se envía nada');
  T.rirColumnSet(true); assert.deepStrictEqual(await T.sbRequest({ action: 'setRir', id: 'n1', rir: 2 }), { ok: true }); const pa = reqs.find(r => r.m === 'PATCH'); assert(pa && JSON.parse(pa.body).rir === 2 && /id=eq\.n1/.test(pa.url), 'con columna, se actualiza esa serie');
  await T.sbRequest({ action: 'setRir', id: 'n1', rir: null }); assert.strictEqual(JSON.parse(reqs.filter(r => r.m === 'PATCH').pop().body).rir, null, 'quitar el RIR');
  // 5) estado de la app
  mode.noFn = true; assert.deepStrictEqual(await T.sbRequest({ action: 'stateGet', key: 'deload' }), { unavailable: true }, 'sin el SQL: no disponible, no error'); assert.deepStrictEqual(await T.sbRequest({ action: 'stateSet', key: 'deload', value: [] }), { unavailable: true }); mode.noFn = false;
  mode.stateRows = []; assert.deepStrictEqual(await T.sbRequest({ action: 'stateGet', key: 'deload' }), { ok: true, missing: true });
  mode.stateRows = [{ value: [{ start: '2026-11-01', end: '2026-11-07' }], updated_at: '2026-11-02T08:00:00+00:00' }]; const g = await T.sbRequest({ action: 'stateGet', key: 'deload' }); assert(g.ok && g.value[0].start === '2026-11-01' && g.updated_at);
  reqs = []; const s = await T.sbRequest({ action: 'stateSet', key: 'checkins', value: [{ fecha: '2026-11-22', sueno: 3 }] }); assert(s.ok && s.updated_at); const sb = reqs.find(r => r.url.includes('/rpc/state_set')); assert.deepStrictEqual(JSON.parse(sb.body), { k: 'checkins', v: [{ fecha: '2026-11-22', sueno: 3 }] });
  // 6) el SQL no abre nada: sin políticas y solo funciones (se comprueba el texto)
  const sql = fs.readFileSync(path.join(root, 'supabase', 'estado.sql'), 'utf8'); assert(/enable row level security/.test(sql) && !/create policy/i.test(sql) && /security definer/.test(sql) && /revoke all on function public\.state_get/.test(sql) && /auth\.uid\(\)/.test(sql) && /octet_length/.test(sql), 'estado.sql: tabla cerrada, funciones con seguridad y tope de tamaño');
  const sql2 = fs.readFileSync(path.join(root, 'supabase', 'rir.sql'), 'utf8'); assert(/add column if not exists rir smallint/.test(sql2) && /between 0 and 10/.test(sql2), 'rir.sql: columna opcional con rango');
  console.log('OK adaptador RIR y estado: columna opcional detectada, reintento sin ella, anotar después, funciones de estado y SQL');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 3).join('\n')); process.exit(1); });
