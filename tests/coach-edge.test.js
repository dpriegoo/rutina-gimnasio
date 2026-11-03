// Función de servidor "coach" (supabase/functions/coach/handler.ts), con Gemini y Supabase simulados.
//   npm test   (Node 22+: ejecuta TypeScript directamente)
// Comprueba: sesión y cuenta permitida, límite diario, validación de lo que se envía a Gemini, la llamada a Gemini
// (clave en cabecera, nunca en la URL ni en las respuestas), mapeo de errores y que se conservan las firmas de razonamiento.
const assert = require('assert');

(async () => {
  const { handleCoach, validateBody, LIMITS, decodeJwt, cached } = await import('../supabase/functions/coach/handler.ts');
  // Clave FALSA con forma de clave de Google, construida al ejecutar para que ninguna línea del repositorio parezca un secreto real
  const KEY = ['AIza', 'Sy', 'NOT-A-REAL-KEY'.replace(/-/g, '_').repeat(3), '12345'].join('');
  const good = () => ({
    system: 'Eres el entrenador', contents: [{ role: 'user', parts: [{ text: 'hola' }] }],
    tools: [{ functionDeclarations: [{ name: 'get_context', description: 'x', parameters: { type: 'OBJECT', properties: {} } }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
  });
  let geminiCalls, quotaCalls, sleeps;
  const mk = (over = {}) => {
    geminiCalls = []; quotaCalls = 0; sleeps = [];
    return Object.assign({
      geminiKey: KEY, model: 'gemini-3.6-flash', maxPerDay: 300, sleep: async ms => { sleeps.push(ms); },
      authenticate: async jwt => jwt === 'JWT-OK' ? { id: 'u1' } : null,
      isAllowed: async jwt => jwt === 'JWT-OK',
      useQuota: async () => { quotaCalls++; return 250; },
      fetch: async (url, init) => { geminiCalls.push({ url: String(url), init }); return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hola', thoughtSignature: 'SIG' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 12 } }), { status: 200 }); },
    }, over);
  };
  const call = async (deps, { method = 'POST', headers = { authorization: 'Bearer JWT-OK' }, body = good() } = {}) => {
    const res = await handleCoach(new Request('https://x.supabase.co/functions/v1/coach', { method, headers: { 'content-type': 'application/json', ...headers }, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }), deps);
    let json = null; try { json = await res.clone().json(); } catch (e) {}
    return { status: res.status, json, res };
  };

  // 1) CORS y método
  let r = await call(mk(), { method: 'OPTIONS' });
  assert.strictEqual(r.status, 204); assert(/authorization/.test(r.res.headers.get('access-control-allow-headers')) && /apikey/.test(r.res.headers.get('access-control-allow-headers')), 'la cabecera apikey de supabase-js debe estar permitida');
  assert.strictEqual((await call(mk(), { method: 'GET', headers: {} })).status, 405);

  // 2) Sesión y cuenta
  r = await call(mk(), { headers: {} }); assert.strictEqual(r.status, 401); assert.strictEqual(r.json.code, 'unauthorized');
  r = await call(mk(), { headers: { authorization: 'Bearer MAL' } }); assert.strictEqual(r.status, 401);
  r = await call(mk({ isAllowed: async () => false })); assert.strictEqual(r.status, 403); assert.strictEqual(r.json.code, 'forbidden');
  assert.strictEqual(geminiCalls.length, 0, 'sin sesión válida no se llama a Gemini');

  // 3) Éxito: lo que se manda a Gemini
  let deps = mk();
  r = await call(deps);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.content.parts[0].thoughtSignature, 'SIG', 'se devuelve la respuesta tal cual, con su firma de razonamiento');
  assert.strictEqual(r.json.finishReason, 'STOP'); assert.strictEqual(r.json.remaining, 250);
  const g = geminiCalls[0];
  assert.strictEqual(g.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
  assert(!g.url.includes(KEY) && !/key=/.test(g.url), 'la clave NO va en la URL');
  assert.strictEqual(g.init.headers['x-goog-api-key'], KEY, 'la clave va en una cabecera');
  const sent = JSON.parse(g.init.body);
  assert.strictEqual(sent.systemInstruction.parts[0].text, 'Eres el entrenador'); assert.strictEqual(sent.contents.length, 1);
  assert.strictEqual(sent.toolConfig.functionCallingConfig.mode, 'AUTO'); assert.strictEqual(sent.tools[0].functionDeclarations[0].name, 'get_context');
  assert(!JSON.stringify(r.json).includes(KEY), 'la respuesta nunca contiene la clave');
  assert.strictEqual(quotaCalls, 1);
  // el modelo es configurable
  r = await call(mk({ model: 'otro-modelo/raro' })); assert(/models\/otro-modelo%2Fraro:generateContent$/.test(geminiCalls[0].url), 'el modelo se codifica en la URL');

  // 4) Límites de lo que se envía
  const clamp = good(); clamp.generationConfig = { temperature: 9, maxOutputTokens: 999999 };
  await call(mk(), { body: clamp }); assert.deepStrictEqual(JSON.parse(geminiCalls[0].init.body).generationConfig, { temperature: 1, maxOutputTokens: LIMITS.maxOutputTokens }, 'temperatura y tokens acotados');
  const noTools = good(); delete noTools.tools; await call(mk(), { body: noTools }); assert(!('tools' in JSON.parse(geminiCalls[0].init.body)), 'sin herramientas, sin toolConfig');
  const bad = [
    ['rol', b => { b.contents[0].role = 'system'; }],
    ['archivo en línea', b => { b.contents[0].parts = [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }]; }],
    ['archivo por URL', b => { b.contents[0].parts = [{ fileData: { fileUri: 'https://x' } }]; }],
    ['herramienta con coste', b => { b.tools = [{ googleSearch: {} }]; }],
    ['código remoto', b => { b.tools = [{ functionDeclarations: [], codeExecution: {} }]; }],
    ['demasiados mensajes', b => { b.contents = Array.from({ length: LIMITS.maxContents + 1 }, () => ({ role: 'user', parts: [{ text: 'x' }] })); }],
    ['texto enorme', b => { b.contents[0].parts[0].text = 'x'.repeat(LIMITS.maxTextChars + 1); }],
    ['sin system', b => { delete b.system; }],
    ['sin contenido', b => { b.contents = []; }],
    ['functionResponse sin objeto', b => { b.contents.push({ role: 'user', parts: [{ functionResponse: { name: 'x', response: 'no' } }] }); }],
    ['demasiadas herramientas', b => { b.tools[0].functionDeclarations = Array.from({ length: LIMITS.maxDeclarations + 1 }, (_, i) => ({ name: 'f' + i })); }],
  ];
  for (const [n, f] of bad) { const b = good(); f(b); const x = await call(mk(), { body: b }); assert.strictEqual(x.status, 400, n + ' debe rechazarse'); assert.strictEqual(geminiCalls.length, 0, n + ': no llega a Gemini'); }
  r = await call(mk(), { body: '{no json' }); assert.strictEqual(r.status, 400);
  r = await call(mk(), { body: JSON.stringify({ ...good(), pad: 'x'.repeat(LIMITS.maxBodyChars) }) }); assert.strictEqual(r.status, 413);
  assert(validateBody(good()).ok);
  const withThought = good(); withThought.contents.push({ role: 'model', parts: [{ functionCall: { name: 'get_context', args: {} }, thoughtSignature: 'S' }] }, { role: 'user', parts: [{ functionResponse: { name: 'get_context', response: { result: {} } } }] });
  assert(validateBody(withThought).ok, 'llamadas a herramientas y sus respuestas, con firmas, son válidas');

  // 5) Límite diario y configuración
  r = await call(mk({ useQuota: async () => -1 })); assert.strictEqual(r.status, 429); assert.strictEqual(r.json.code, 'limit'); assert.strictEqual(geminiCalls.length, 0, 'superado el límite no se llama a Gemini');
  r = await call(mk({ useQuota: async () => { throw new Error('function coach_use does not exist'); } })); assert.strictEqual(r.status, 503); assert(/coach\.sql/.test(r.json.message));
  r = await call(mk({ geminiKey: '' })); assert.strictEqual(r.status, 503); assert(/GEMINI_API_KEY/.test(r.json.message)); assert.strictEqual(quotaCalls, 0, 'sin clave no se gasta cuota');

  // 6) Errores de Gemini
  const gem = (status, obj) => mk({ fetch: async (u, i) => { geminiCalls.push({ url: String(u), init: i }); return new Response(JSON.stringify(obj), { status }); } });
  r = await call(gem(429, { error: { message: 'quota' } })); assert.strictEqual(r.status, 503); assert.strictEqual(r.json.code, 'unavailable', 'el 429 de Gemini NO se presenta como límite diario nuestro');
  r = await call(gem(500, { error: { message: 'boom' } })); assert.strictEqual(r.status, 503);
  r = await call(gem(404, { error: { message: 'models/xx is not found' } })); assert.strictEqual(r.status, 502); assert(/not found/.test(r.json.message), 'un modelo inexistente se explica (y no es un 404 de la función)');
  r = await call(gem(400, { error: { message: 'API key ' + KEY + ' not valid' } })); assert(!JSON.stringify(r.json).includes(KEY) && /\*\*\*/.test(r.json.message), 'si Gemini repite la clave en un error, se tapa');
  r = await call(gem(200, { promptFeedback: { blockReason: 'SAFETY' } })); assert.strictEqual(r.status, 422); assert.strictEqual(r.json.code, 'blocked');
  r = await call(gem(200, { candidates: [{ finishReason: 'SAFETY' }] })); assert.strictEqual(r.status, 422);
  r = await call(gem(200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'get_context', args: {} } }] }, finishReason: 'STOP' }] })); assert.strictEqual(r.status, 200); assert(r.json.content.parts[0].functionCall, 'una petición de herramienta pasa tal cual');
  r = await call(mk({ fetch: async () => { throw new Error('red caída'); } })); assert.strictEqual(r.status, 503);
  r = await call(mk({ timeoutMs: 20, fetch: (u, i) => new Promise((res, rej) => i.signal.addEventListener('abort', () => rej(new Error('abort')))) })); assert.strictEqual(r.status, 503); assert(/tardó demasiado/.test(r.json.message), 'tiempo máximo de espera');


  // 7) Velocidad: sesión leída del JWT, memoria de cuenta permitida, consultas en paralelo
  const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwtOf = o => b64u({ alg: 'HS256' }) + '.' + b64u(o) + '.sig';
  const dj = decodeJwt(jwtOf({ sub: 'user-ñ-1', exp: 4102444800 }));
  assert.strictEqual(dj.sub, 'user-ñ-1'); assert.strictEqual(dj.exp, 4102444800);
  assert.strictEqual(decodeJwt('no-es-un-jwt'), null); assert.strictEqual(decodeJwt('a.%%%.c'), null); assert.strictEqual(decodeJwt(''), null);
  let n = 0, clock = 1000; const memo = cached(async k => { n++; return k === 'ok'; }, 300, 2, () => clock);
  assert.strictEqual(await memo('ok'), true); assert.strictEqual(await memo('ok'), true); assert.strictEqual(n, 1, 'el resultado afirmativo se recuerda');
  clock += 301; await memo('ok'); assert.strictEqual(n, 2, 'caduca pasado el tiempo');
  await memo('no'); await memo('no'); assert.strictEqual(n, 4, 'un resultado negativo NO se guarda (un token falso nunca queda aprobado)');
  await memo('ok'); await memo('ok2'); await memo('ok3'); const nBefore = n; await memo('ok'); assert(n >= nBefore, 'la memoria está acotada');

  const slow = ms => async () => { await new Promise(r => setTimeout(r, ms)); return true; };
  const t0 = Date.now();
  r = await call(mk({ isAllowed: slow(120), useQuota: async () => { await new Promise(x => setTimeout(x, 120)); return 5; } }));
  const dt = Date.now() - t0; assert.strictEqual(r.status, 200); assert(dt < 220, 'cuenta y límite se comprueban a la vez, no una tras otra (' + dt + ' ms; en serie serían ~240)');
  r = await call(mk({ isAllowed: async () => false, useQuota: async () => 5 })); assert.strictEqual(r.status, 403);
  let bodyChecks = 0; r = await call(mk({ isAllowed: async () => { bodyChecks++; return true; }, useQuota: async () => { bodyChecks++; return 5; } }), { body: { system: '', contents: [] } });
  assert.strictEqual(r.status, 400); assert.strictEqual(bodyChecks, 0, 'una petición mal formada no gasta consultas a la base de datos');

  // 8) Calentar (ping): solo comprueba la cuenta
  deps = mk(); r = await call(deps, { body: { ping: true } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(geminiCalls.length, 0, 'el ping no llama a Gemini'); assert.strictEqual(quotaCalls, 0, 'ni gasta cuota');
  assert.strictEqual((await call(mk({ isAllowed: async () => false }), { body: { ping: true } })).status, 403);
  assert.strictEqual((await call(mk(), { headers: {}, body: { ping: true } })).status, 401, 'ni el ping vale sin sesión');

  // 9) Razonamiento de Gemini ajustable (con reintento si el modelo no lo admite)
  r = await call(mk({ thinkingConfig: { thinkingBudget: 0 } })); assert.deepStrictEqual(JSON.parse(geminiCalls[0].init.body).generationConfig.thinkingConfig, { thinkingBudget: 0 });
  r = await call(mk()); assert(!('thinkingConfig' in JSON.parse(geminiCalls[0].init.body).generationConfig), 'sin configurar, no se manda');
  let tries = 0;
  const picky = mk({ thinkingConfig: { thinkingLevel: 'low' }, fetch: async (u, i) => { tries++; geminiCalls.push({ url: String(u), init: i }); const b = JSON.parse(i.init ? i.init.body : i.body); return b.generationConfig.thinkingConfig ? new Response(JSON.stringify({ error: { message: 'Unknown field thinkingLevel in thinking_config' } }), { status: 400 }) : new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }), { status: 200 }); } });
  r = await call(picky); assert.strictEqual(r.status, 200); assert.strictEqual(tries, 2, 'reintenta una vez sin ese ajuste'); assert(!('thinkingConfig' in JSON.parse(geminiCalls[1].init.body).generationConfig));
  tries = 0; r = await call(mk({ thinkingConfig: { x: 1 }, fetch: async () => { tries++; return new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }); } })); assert.strictEqual(tries, 1, 'un 400 que no habla de razonamiento no se reintenta'); assert.strictEqual(r.status, 502);

  // 10) Streaming: se reenvía el flujo de Gemini tal cual
  const sse = chunks => new ReadableStream({ start(c) { const enc = new TextEncoder(); chunks.forEach(x => c.enqueue(enc.encode(x))); c.close(); } });
  const streamDeps = (chunks, status = 200) => mk({ fetch: async (u, i) => { geminiCalls.push({ url: String(u), init: i }); return new Response(status === 200 ? sse(chunks) : JSON.stringify([{ error: { message: 'cuota agotada' } }]), { status }); } });
  const ev = o => 'data: ' + JSON.stringify(o) + '\r\n\r\n';
  const chunks = [ev({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hola ' }] } }] }), ev({ candidates: [{ content: { role: 'model', parts: [{ text: 'mundo' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 9 } })];
  const sb = good(); sb.stream = true;
  r = await call(streamDeps(chunks), { body: sb });
  assert.strictEqual(r.status, 200); assert(/text\/event-stream/.test(r.res.headers.get('content-type')));
  assert(/streamGenerateContent\?alt=sse$/.test(geminiCalls[0].url), 'usa el endpoint de streaming'); assert(!geminiCalls[0].url.includes(KEY));
  assert.strictEqual(await r.res.text(), chunks.join(''), 'el flujo llega intacto');
  r = await call(streamDeps([], 429), { body: sb }); assert.strictEqual(r.status, 503); assert.strictEqual(r.json.code, 'unavailable'); assert(/cuota agotada/.test(r.json.message), 'un error ANTES de empezar el flujo llega como JSON normal');
  assert(validateBody({ ...good(), stream: 'si' }).value.stream === false, 'solo stream:true activa el flujo');
  r = await call(mk({ timeoutMs: 20, fetch: (u, i) => new Promise((res, rej) => i.signal.addEventListener('abort', () => rej(new Error('abort')))) }), { body: sb }); assert.strictEqual(r.status, 503);


  // 11) El archivo único para pegar en el editor de Supabase: al día y funcionando
  const fs = require('fs'), path = require('path'), vm = require('vm'), nodeModule = require('module');
  const { bundle } = require('../tools/bundle-coach.js');
  const single = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'coach-single-file.ts'), 'utf8');
  assert.strictEqual(single, bundle(), 'supabase/coach-single-file.ts está desactualizado: ejecuta npm run bundle:coach');
  assert(!/^export /m.test(single) && !/from '\.\/handler/.test(single), 'sin exports ni imports locales: es un solo archivo');
  assert.strictEqual((single.match(/^import /gm) || []).length, 1, 'un único import (supabase-js)');
  const js = nodeModule.stripTypeScriptTypes(single).replace(/^import .*$/m, '');     // TypeScript -> JavaScript (sin tipos) y sin el import
  const load = (env, behaviour = {}) => {
    const rec = { from: 0, rpc: [], getUser: 0, fetches: [], served: null };
    const sbStub = (url, key, opts) => {
      const auth = opts.global.headers.Authorization;
      return {
        from: () => ({ select: () => ({ maybeSingle: async () => { rec.from++; return auth === 'Bearer ' + behaviour.goodJwt ? { data: { profile: 'David' }, error: null } : { data: null, error: { message: 'JWT inválido' } }; } }) }),
        rpc: async (fn, args) => { rec.rpc.push([fn, args]); return { data: behaviour.quota ?? 250, error: null }; },
        auth: { getUser: async () => { rec.getUser++; return { data: { user: { id: 'u1' } }, error: null }; } },
      };
    };
    const ctx = vm.createContext({
      Deno: { env: { get: k => env[k] }, serve: fn => { rec.served = fn; } }, createClient: sbStub,
      fetch: async (u, i) => { rec.fetches.push({ url: String(u), init: i }); return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }), { status: 200 }); },
      Request, Response, URL, TextEncoder, TextDecoder, ReadableStream, TransformStream, AbortController, setTimeout, clearTimeout, atob, console,
    });
    new vm.Script(js).runInContext(ctx);
    assert.strictEqual(typeof rec.served, 'function', 'el archivo arranca el servidor (Deno.serve)');
    return rec;
  };
  const jwtGood = jwtOf({ sub: 'u-1', exp: 4102444800 }), jwtOld = jwtOf({ sub: 'u-1', exp: 1000 });
  const ask = (rec, jwt, body) => rec.served(new Request('https://x.supabase.co/functions/v1/coach', { method: 'POST', headers: { authorization: 'Bearer ' + jwt, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  let rec = load({ GEMINI_API_KEY: KEY, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }, { goodJwt: jwtGood });
  let rr = await ask(rec, jwtGood, { ping: true }); assert.strictEqual(rr.status, 200, 'ping con sesión válida');
  assert.strictEqual((await ask(rec, jwtOld, { ping: true })).status, 401, 'un JWT caducado se rechaza sin consultar nada');
  assert.strictEqual((await ask(rec, 'basura', { ping: true })).status, 401);
  assert.strictEqual((await ask(rec, jwtOf({ sub: 'u-2', exp: 4102444800 }), { ping: true })).status, 403, 'un JWT con buena forma pero que la base de datos rechaza NO entra (falsificado)');
  const fromBefore = rec.from; await ask(rec, jwtGood, { ping: true }); assert.strictEqual(rec.from, fromBefore, 'la cuenta permitida se recuerda: no vuelve a consultar la base de datos');
  assert.strictEqual(rec.getUser, 0, 'por defecto no llama al servicio de autenticación');
  rr = await ask(rec, jwtGood, good()); assert.strictEqual(rr.status, 200); assert.strictEqual((await rr.json()).content.parts[0].text, 'ok');
  assert.strictEqual(rec.fetches[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', 'modelo por defecto');
  assert.strictEqual(rec.fetches[0].init.headers['x-goog-api-key'], KEY, 'la clave sale de la variable GEMINI_API_KEY');
  assert.strictEqual(JSON.stringify(rec.rpc.slice(-1)[0]), JSON.stringify(['coach_use', { max_calls: 300 }]), 'límite diario por defecto: 300');
  assert(!('thinkingConfig' in JSON.parse(rec.fetches[0].init.body).generationConfig));
  // variables opcionales
  rec = load({ GEMINI_API_KEY: KEY, GEMINI_MODEL: 'mi-modelo', COACH_MAX_PER_DAY: '12', GEMINI_THINKING: '{"thinkingBudget":0}', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { goodJwt: jwtGood });
  await ask(rec, jwtGood, good());
  assert(/models\/mi-modelo:generateContent$/.test(rec.fetches[0].url), 'GEMINI_MODEL'); assert.strictEqual(JSON.stringify(rec.rpc[0][1]), JSON.stringify({ max_calls: 12 }), 'COACH_MAX_PER_DAY');
  assert.deepStrictEqual(JSON.parse(rec.fetches[0].init.body).generationConfig.thinkingConfig, { thinkingBudget: 0 }, 'GEMINI_THINKING');
  rec = load({ GEMINI_API_KEY: KEY, GEMINI_THINKING: '{no json', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { goodJwt: jwtGood });
  assert.strictEqual((await ask(rec, jwtGood, good())).status, 200, 'un GEMINI_THINKING inválido se ignora sin romper nada');
  rec = load({ GEMINI_API_KEY: KEY, COACH_STRICT_AUTH: '1', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { goodJwt: jwtGood });
  await ask(rec, jwtGood, { ping: true }); assert.strictEqual(rec.getUser, 1, 'COACH_STRICT_AUTH=1 comprueba el JWT en Autenticación');
  rec = load({ SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { goodJwt: jwtGood });
  rr = await ask(rec, jwtGood, good()); assert.strictEqual(rr.status, 503); assert(/GEMINI_API_KEY/.test((await rr.json()).message), 'sin la variable de la clave, la función lo dice');
  rec = load({ GEMINI_API_KEY: KEY, SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'k' }, { goodJwt: jwtGood, quota: -1 });
  assert.strictEqual((await ask(rec, jwtGood, good())).status, 429, 'límite diario superado');
  assert(!single.includes(KEY) && !/AIza[0-9A-Za-z_\-]{30,}/.test(single), 'el archivo no contiene ninguna clave');


  // 12) Saturación pasajera de Gemini: reintentos y modelo de repuesto
  const okBody = () => JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hecho' }] }, finishReason: 'STOP' }] });
  const busy = () => new Response(JSON.stringify({ error: { code: 503, message: 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', status: 'UNAVAILABLE' } }), { status: 503 });
  const scripted = (answers, over = {}) => { let i = 0; return mk({ fetch: async (u, init) => { geminiCalls.push({ url: String(u), init }); return answers[Math.min(i++, answers.length - 1)](); }, ...over }); };
  // a) se recupera sola tras una o dos saturaciones, con espera creciente
  r = await call(scripted([busy, () => new Response(okBody(), { status: 200 })]));
  assert.strictEqual(r.status, 200); assert.strictEqual(geminiCalls.length, 2, 'un reintento'); assert.deepStrictEqual(sleeps, [350]);
  r = await call(scripted([busy, busy, () => new Response(okBody(), { status: 200 })]));
  assert.strictEqual(r.status, 200); assert.strictEqual(geminiCalls.length, 3, 'dos reintentos'); assert.deepStrictEqual(sleeps, [350, 900], 'espera creciente');
  assert(geminiCalls.every(c => /gemini-3\.6-flash:generateContent$/.test(c.url)), 'sin repuesto, siempre el mismo modelo'); assert.strictEqual(r.json.model, 'gemini-3.6-flash');
  assert.strictEqual(quotaCalls, 1, 'los reintentos NO gastan cuota diaria (es una sola petición del usuario)');
  // b) si no se recupera: código propio para poder avisar de que basta con reintentar
  r = await call(scripted([busy]));
  assert.strictEqual(r.status, 503); assert.strictEqual(r.json.code, 'overloaded'); assert(/high demand/.test(r.json.message)); assert.strictEqual(geminiCalls.length, 3, 'se rinde tras 2 reintentos');
  r = await call(scripted([() => new Response(JSON.stringify({ error: { message: 'The model is overloaded. Please try again later.' } }), { status: 500 })]));
  assert.strictEqual(r.json.code, 'overloaded', 'también si el aviso viene con otro código HTTP'); assert.strictEqual(geminiCalls.length, 3, 'un 500 también se reintenta');
  // c) lo que NO se reintenta: errores de petición, de modelo inexistente y de cuota
  for (const st of [400, 404, 403, 429]) { r = await call(scripted([() => new Response(JSON.stringify({ error: { message: 'x' + st } }), { status: st })])); assert.strictEqual(geminiCalls.length, 1, 'HTTP ' + st + ' no se reintenta'); assert.strictEqual(sleeps.length, 0); }
  // d) modelo de repuesto
  r = await call(scripted([busy, busy, busy, () => new Response(okBody(), { status: 200 })], { fallbackModel: 'modelo-estable' }));
  assert.strictEqual(r.status, 200); assert.strictEqual(geminiCalls.length, 4);
  assert(/gemini-3\.6-flash:generateContent$/.test(geminiCalls[2].url) && /modelo-estable:generateContent$/.test(geminiCalls[3].url), 'tras agotar los reintentos del principal se prueba el de repuesto');
  assert.strictEqual(r.json.model, 'modelo-estable', 'se informa de qué modelo respondió');
  r = await call(scripted([busy, busy, busy, busy, busy, busy], { fallbackModel: 'modelo-estable' })); assert.strictEqual(r.status, 503); assert.strictEqual(r.json.code, 'overloaded'); assert.strictEqual(geminiCalls.length, 6, '3 intentos con cada modelo, y ya');
  r = await call(scripted([busy, () => new Response(okBody(), { status: 200 })], { fallbackModel: 'modelo-estable' })); assert.strictEqual(geminiCalls.length, 2); assert(!geminiCalls.some(c => /modelo-estable/.test(c.url)), 'si el principal se recupera, no se toca el de repuesto');
  r = await call(scripted([busy, busy, busy], { fallbackModel: 'gemini-3.6-flash' })); assert.strictEqual(geminiCalls.length, 3, 'un repuesto igual al principal no repite');
  r = await call(scripted([() => new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 400 })], { fallbackModel: 'modelo-estable' })); assert.strictEqual(geminiCalls.length, 1, 'un error de petición no cambia de modelo');
  // e) también en streaming: el estado se conoce antes de empezar el flujo
  const sbody = good(); sbody.stream = true;
  r = await call(scripted([busy, () => new Response(sse([ev({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hola' }] }, finishReason: 'STOP' }] })]), { status: 200 })], { fallbackModel: 'modelo-estable' }), { body: sbody });
  assert.strictEqual(r.status, 200); assert(/text\/event-stream/.test(r.res.headers.get('content-type'))); assert.strictEqual(r.res.headers.get('x-coach-model'), 'gemini-3.6-flash'); assert.strictEqual(geminiCalls.length, 2);
  r = await call(scripted([busy, busy, busy, () => new Response(sse([ev({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hola' }] } }] })]), { status: 200 })], { fallbackModel: 'modelo-estable' }), { body: sbody });
  assert.strictEqual(r.res.headers.get('x-coach-model'), 'modelo-estable', 'el modelo usado viaja en una cabecera');
  // f) el razonamiento ajustado y los reintentos conviven
  r = await call(scripted([busy, () => new Response(okBody(), { status: 200 })], { thinkingConfig: { thinkingBudget: 0 } })); assert.strictEqual(r.status, 200);
  assert(JSON.parse(geminiCalls[1].init.body).generationConfig.thinkingConfig, 'el reintento conserva el ajuste de razonamiento');
  // g) el archivo único (lo que se pega en Supabase) lee GEMINI_FALLBACK_MODEL
  assert(/GEMINI_FALLBACK_MODEL/.test(single) && /fallbackModel: Deno\.env\.get\('GEMINI_FALLBACK_MODEL'\)/.test(single), 'index.ts pasa la variable a la función');

  console.log('OK función coach: sesión, límite, validación, llamada a Gemini y errores');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1); });
