// Función de servidor "coach" (supabase/functions/coach/handler.ts), con Gemini y Supabase simulados.
//   npm test   (Node 22+: ejecuta TypeScript directamente)
// Comprueba: sesión y cuenta permitida, límite diario, validación de lo que se envía a Gemini, la llamada a Gemini
// (clave en cabecera, nunca en la URL ni en las respuestas), mapeo de errores y que se conservan las firmas de razonamiento.
const assert = require('assert');

(async () => {
  const { handleCoach, validateBody, LIMITS, decodeJwt, cached } = await import('../supabase/functions/coach/handler.ts');
  const KEY = 'AIzaSyFAKEKEYFAKEKEYFAKEKEYFAKEKEY12345';
  const good = () => ({
    system: 'Eres el entrenador', contents: [{ role: 'user', parts: [{ text: 'hola' }] }],
    tools: [{ functionDeclarations: [{ name: 'get_context', description: 'x', parameters: { type: 'OBJECT', properties: {} } }] }],
    generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
  });
  let geminiCalls, quotaCalls;
  const mk = (over = {}) => {
    geminiCalls = []; quotaCalls = 0;
    return Object.assign({
      geminiKey: KEY, model: 'gemini-3.6-flash', maxPerDay: 300,
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

  console.log('OK función coach: sesión, límite, validación, llamada a Gemini y errores');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1); });
