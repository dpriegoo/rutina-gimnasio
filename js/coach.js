// =====================================================================
// Entrenador IA: conversación con Gemini  (coach.js)
// El navegador manda la conversación a una función de servidor de Supabase ("coach", que guarda la clave de
// Gemini y valida la sesión). Gemini responde con texto o pidiendo una herramienta (coach-tools.js); la
// herramienta se ejecuta aquí, sobre los datos del usuario, y su resultado vuelve a Gemini, hasta que
// contesta con texto. Así Gemini decide qué consultar según la pregunta, y los números salen siempre de la
// misma lógica que el resto de la app.
// Velocidad: (1) la app ADELANTA los datos que cada intención va a necesitar y se los da a Gemini en el primer
// mensaje, así que una pregunta guiada suele costar UNA llamada en vez de tres; (2) la respuesta llega en streaming
// y se pinta según se escribe; (3) al abrir el chat se "calienta" la función de servidor.
// Depende de: api-supabase (sbClient, SUPABASE_URL/KEY), coach-tools, utils, auth (getProfile).
// =====================================================================

const COACH_FUNCTION = 'coach';
const COACH_MAX_STEPS = 8;        // vueltas pregunta -> herramientas -> respuesta como máximo
const COACH_KEEP_USER_TURNS = 8;  // turnos del usuario que se reenvían (los anteriores se descartan)
const COACH_MAX_RESULT_CHARS = 14000;

let COACH_STREAM = true;          // false = respuesta de golpe (sin streaming) por la vía clásica de supabase-js
let coachContents = [];           // conversación en el formato de Gemini (se guarda TAL CUAL llega: incluye firmas de razonamiento)

function coachErr(code, message){ const e = new Error(message); e.coachCode = code; return e; }

// Mensajes de error para el usuario
const COACH_ERRORS = {
  unauthorized: 'Tu sesión ha caducado. Vuelve a entrar y prueba de nuevo.',
  forbidden: 'Esta cuenta no tiene acceso al entrenador.',
  limit: 'Has llegado al límite diario de consultas. Vuelve mañana.',
  not_deployed: 'El entrenador aún no está activado en el servidor (falta desplegar la función «coach»).',
  overloaded: 'Gemini está saturado en este momento (alta demanda). Suele ser un pico corto: prueba de nuevo en unos segundos.',
  unavailable: 'El entrenador no está disponible ahora mismo. Inténtalo de nuevo en un rato.',
  unreachable: 'No se pudo conectar con la función «coach» del servidor. Si es la primera vez, comprueba que está desplegada en Supabase (Edge Functions) y que se llama exactamente «coach». El detalle está en la consola del navegador.',
  blocked: 'Gemini no ha podido responder a esa pregunta. Prueba a plantearla de otra forma.',
  too_many_steps: 'He dado demasiadas vueltas con esta pregunta. Prueba a hacerla más concreta.',
  offline: 'Sin conexión. Comprueba tu red e inténtalo de nuevo.',
  empty: 'Gemini no ha devuelto ninguna respuesta. Inténtalo de nuevo.',
};
// Para los fallos que devuelve el servidor se añade el motivo que da la función (ya sin claves): así se ve qué falta
// (la clave de Gemini, el SQL, un modelo mal escrito…) sin abrir las herramientas del navegador.
function coachErrorText(e){
  const code = e && e.coachCode, base = COACH_ERRORS[code] || COACH_ERRORS.unavailable;
  const detail = e && e.message ? String(e.message).replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  return detail && (code === 'unavailable' || code === 'blocked' || code === 'forbidden') ? base + ' Detalle: ' + detail : base;
}

function coachSystemPrompt(){
  const now = new Date();
  return [
    'Eres "Entrenador", el asistente de entrenamiento de fuerza dentro de la app IronLog de ' + (getProfile() || 'el usuario') + '. Hoy es ' + COACH_WEEKDAYS[now.getDay()] + ' ' + localDateStr(now) + '. La semana empieza el lunes.',
    '',
    'REGLAS',
    '1. Responde en español, tuteando, claro y breve (unas 120-180 palabras salvo que pida más detalle). Primero la recomendación o conclusión; después los motivos con números concretos del usuario.',
    '2. Todo dato del usuario (fechas, pesos, sesiones, series, volumen) debe salir de las herramientas. NUNCA inventes ejercicios, cargas, fechas ni sesiones. Si no tienes un dato, llama a una herramienta; si la herramienta no lo tiene, dilo.',
    '3. El mensaje suele traer «DATOS YA CONSULTADOS POR LA APP» (incluye siempre get_context: qué días ha entrenado esta semana, cuáles faltan, cuándo fue la última vez de cada uno). Úsalos directamente y NO repitas esas consultas; llama a una herramienta solo si necesitas algo que no esté ahí (puedes pedir varias a la vez). Para nombrar un ejercicio usa el nombre exacto de la rutina.',
    '4. Si el mensaje del usuario trae "[Intención de la app: …]", úsala para decidir qué consultar:',
    '   - planificar_semana: get_context, get_week_status(0), get_muscle_load(4), get_app_signals y, si hace falta, get_routine.',
    '   - ejercicio_hoy: get_exercise_progress y get_exercise_sets del ejercicio (última sesión) y get_routine para el rango objetivo.',
    '   - progresion_ejercicio: get_exercise_progress (y get_exercise_sets si necesitas detalle).',
    '   - revision_general: get_weekly_summary(8-12), get_muscle_load(8), list_exercises y get_exercise_progress de los 3-4 ejercicios con más sesiones; get_body_weight si hay datos.',
    '5. Sobre la métrica: "fuerza estimada" es la media de las series de trabajo de la sesión (peso × reps^0,10), no es el 1RM. Las sesiones en otra máquina se ajustan a la de referencia; si el ejercicio dice que hay sesiones "que no entran", menciónalo si afecta a la conclusión. Solo afirmes tendencia o estancamiento si la herramienta lo da (hacen falta 8 sesiones); cambios menores de ~1,5 % son ruido, no progreso ni retroceso. Con pocas sesiones, di que es pronto para concluir.',
    '6. Planificar días: tienes que decidir con los datos. Considera los días que faltan, qué zonas ya trabajó esta semana frente a su media (get_muscle_load), los días desde la última sesión de cada zona (conviene ~48 h entre sesiones de la misma zona) y las señales de la app. Da una recomendación clara con orden y el porqué, y una alternativa si es razonable. Si el usuario dice cuántos días más irá, elige esa cantidad exacta.',
    '7. Ejercicio de hoy: usa el rango objetivo de la rutina (p. ej. "3 · 6-8") y doble progresión: si en la última sesión clavó el tope de repeticiones en todas las series, sube un poco la carga (el incremento mínimo habitual, 1,25-2,5 kg); si no, intenta una repetición más con la misma carga. Ten en cuenta la máquina que usó.',
    '8. No eres médico: no diagnostiques lesiones ni des consejos médicos, de dieta o suplementos. Ante dolor o molestias, aconseja parar y consultar a un profesional.',
    '9. Pregunta algo solo si es imprescindible; si puedes, asume lo razonable y dilo.',
    '10. No muestres JSON, nombres de herramientas ni código. Puedes usar **negrita** y listas cortas con "- ". Nada de encabezados.',
  ].join('\n');
}

// Recorta la conversación: se queda con los últimos N turnos del usuario (sin partir una llamada a herramienta de su respuesta)
function coachTrim(contents){
  const starts = [];
  contents.forEach((c, i) => { if (c.role === 'user' && c.parts && c.parts.some(p => typeof p.text === 'string')) starts.push(i); });
  if (starts.length <= COACH_KEEP_USER_TURNS) return contents;
  return contents.slice(starts[starts.length - COACH_KEEP_USER_TURNS]);
}

function coachHttpError(st, j, fallback){
  let code = 'unavailable';
  const detail = j ? (j.message || j.error || '') : '';
  if (j && j.code) code = j.code;
  if (st === 401) code = 'unauthorized';
  else if (st === 403) code = 'forbidden';
  else if (st === 429) code = 'limit';
  else if (st === 404) code = 'not_deployed';
  else if (st === 422) code = 'blocked';
  return coachErr(code, detail || fallback || ('HTTP ' + st));
}

// Vía clásica (supabase-js): espera a la respuesta completa
async function coachCall(body){
  let r;
  try { r = await sbClient().functions.invoke(COACH_FUNCTION, { body: body }); }
  catch (e) { throw coachErr(navigator.onLine === false ? 'offline' : 'unreachable', String((e && e.message) || e)); }
  if (r.error) {
    let j = null;
    try { j = await r.error.context.json(); } catch (e) {}
    const st = r.error.context && r.error.context.status;
    // Sin código HTTP = ni siquiera hubo respuesta (red caída, o la función no existe y el navegador bloqueó la petición)
    if (st === undefined && !j) throw coachErr(navigator.onLine === false ? 'offline' : 'unreachable', String(r.error.message || r.error));
    throw coachHttpError(st, j, String(r.error.message || r.error));
  }
  return r.data;
}

async function coachToken(){
  try { const s = await sbClient().auth.getSession(); return s && s.data && s.data.session ? s.data.session.access_token : null; }
  catch (e) { return null; }
}

// Añade un trozo (part) a la respuesta que se va montando. Los trozos de texto consecutivos se juntan, salvo los que
// traen firma de razonamiento (la firma tiene que viajar con SU trozo) y los de "pensamiento".
function coachAddPart(parts, p){
  const last = parts[parts.length - 1];
  if (typeof p.text === 'string' && !p.functionCall && last && typeof last.text === 'string' && !last.functionCall && !!last.thought === !!p.thought && !p.thoughtSignature) {
    last.text += p.text; return;
  }
  parts.push(JSON.parse(JSON.stringify(p)));
}

function coachSseChunk(payload, acc, onText){
  let j; try { j = JSON.parse(payload); } catch (e) { return; }          // línea incompleta o ruido: se ignora
  if (j.error) throw coachErr('unavailable', j.error.message || 'error de Gemini');
  if (j.promptFeedback && j.promptFeedback.blockReason) acc.blocked = j.promptFeedback.blockReason;
  const cand = j.candidates && j.candidates[0];
  if (!cand) return;
  if (cand.finishReason) acc.finish = cand.finishReason;
  ((cand.content && cand.content.parts) || []).forEach(p => coachAddPart(acc.parts, p));
  if (onText) onText(acc.parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join(''));
}

// Streaming: la respuesta llega por trozos (SSE) y onText(textoHastaAhora) permite pintarla según se escribe.
// Devuelve lo mismo que coachCall: { content, finishReason }.
async function coachCallStream(body, onText){
  const token = await coachToken();
  if (!token) throw coachErr('unauthorized', 'sin sesión');
  let res;
  try {
    res = await fetch(SUPABASE_URL + '/functions/v1/' + COACH_FUNCTION, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, apikey: SUPABASE_KEY },
      body: JSON.stringify(Object.assign({}, body, { stream: true })),
    });
  } catch (e) {
    // Aquí el navegador NO distingue un 404 (la función no existe) de una red caída: ambas llegan como un fallo de red
    // (con un 404 en la comprobación previa CORS, la petición ni sale). Por eso el mensaje apunta al despliegue.
    throw coachErr(navigator.onLine === false ? 'offline' : 'unreachable', String((e && e.message) || e));
  }
  if (!res.ok) { let j = null; try { j = await res.json(); } catch (e) {} throw coachHttpError(res.status, j); }

  const acc = { parts: [], finish: null, blocked: null };
  let buf = '';
  const event = ev => ev.split('\n').forEach(line => {
    if (line.indexOf('data:') !== 0) return;
    const d = line.slice(5).trim();
    if (d && d !== '[DONE]') coachSseChunk(d, acc, onText);
  });
  const eat = last => {
    buf = buf.replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { event(buf.slice(0, i)); buf = buf.slice(i + 2); }
    if (last && buf.trim()) { event(buf); buf = ''; }
  };
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) { const r = await reader.read(); if (r.done) break; buf += dec.decode(r.value, { stream: true }); eat(false); }
    buf += dec.decode(); eat(true);
  } else { buf = await res.text(); eat(true); }

  if (!acc.parts.length) throw coachErr(acc.blocked ? 'blocked' : 'empty', 'respuesta vacía');
  return { content: { role: 'model', parts: acc.parts }, finishReason: acc.finish };
}

// "Calentar": un aviso ligero a la función de servidor al abrir el chat (despierta la función y comprueba la cuenta
// sin gastar cuota ni llamar a Gemini), para que la primera pregunta no pague el arranque en frío.
let _coachWarmAt = 0;
async function coachWarm(){
  if (typeof fetch !== 'function' || Date.now() - _coachWarmAt < 4 * 60e3) return;
  _coachWarmAt = Date.now();
  try {
    const token = await coachToken();
    if (!token) return;
    await fetch(SUPABASE_URL + '/functions/v1/' + COACH_FUNCTION, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, apikey: SUPABASE_KEY }, body: JSON.stringify({ ping: true }),
    });
  } catch (e) {
    // Es solo una optimización, pero avisa en la consola nada más abrir el chat si la función no responde
    if (typeof console !== 'undefined') console.warn('[coach] la función «' + COACH_FUNCTION + '» no responde. ¿Está desplegada en Supabase (Edge Functions) con ese nombre? Ver supabase/README.md');
  }
}

// ---------- Datos adelantados ----------
// Según la intención, la app consulta ella misma (al instante, en local) lo que Gemini va a necesitar y se lo da
// en el primer mensaje. Gemini puede seguir pidiendo más herramientas, pero lo normal es que conteste a la primera.
function coachPrefetchPlan(intent, ejercicio){
  const plan = [['get_context', {}]];
  if (intent === 'planificar_semana') {
    plan.push(['get_week_status', { semanas_atras: 0 }], ['get_muscle_load', { semanas: 4 }], ['get_app_signals', {}]);
  } else if ((intent === 'ejercicio_hoy' || intent === 'progresion_ejercicio') && ejercicio) {
    plan.push(['get_exercise_progress', { ejercicio: ejercicio, ultimas_sesiones: 12 }], ['get_exercise_sets', { ejercicio: ejercicio, limite: 12 }]);
  } else if (intent === 'revision_general') {
    plan.push(['get_weekly_summary', { semanas: 10 }], ['get_muscle_load', { semanas: 8 }], ['get_body_weight', { dias: 90 }]);
    const top = (coachRunTool('list_exercises', {}).ejercicios || []).slice(0, 3);
    top.forEach(e => plan.push(['get_exercise_progress', { ejercicio: e.ejercicio, ultimas_sesiones: 8 }]));
  }
  return plan;
}
function coachPrefetch(intent, ejercicio){
  return coachPrefetchPlan(intent, ejercicio).map(x => ({ name: x[0], args: x[1], result: coachResultJson(coachRunTool(x[0], x[1])), prefetched: true }));
}
function coachDataText(items){
  if (!items || !items.length) return '';
  return 'DATOS YA CONSULTADOS POR LA APP (úsalos directamente; llama a una herramienta solo si necesitas algo que no esté aquí):\n' +
    items.map(it => '### ' + it.name + (it.args && Object.keys(it.args).length ? ' ' + JSON.stringify(it.args) : '') + '\n' + JSON.stringify(it.result)).join('\n');
}
// Los datos van SOLO en el último turno de texto del usuario (no se acumulan en el historial)
function coachWithData(contents, dataText){
  if (!dataText) return contents;
  let idx = -1;
  contents.forEach((c, i) => { if (c.role === 'user' && c.parts && c.parts.some(p => typeof p.text === 'string')) idx = i; });
  if (idx < 0) return contents;
  return contents.map((c, i) => i === idx ? { role: c.role, parts: c.parts.concat([{ text: dataText }]) } : c);
}

function coachResultJson(result){
  let s = JSON.stringify(result);
  if (s.length > COACH_MAX_RESULT_CHARS) return { error: 'Resultado demasiado grande; pide menos datos (menos semanas o sesiones).' };
  return result;
}

// Una pregunta del usuario: bucle hasta que Gemini contesta con texto.
//   hooks.onTool(name, args) avisa de cada herramienta que Gemini pide; hooks.onText(texto) recibe el texto según se escribe
//   (streaming); hooks.onStepEnd(hayLlamadas) avisa al terminar cada vuelta (si pidió herramientas, el texto parcial no era la respuesta).
//   opts = { intent, ejercicio } decide qué datos se adelantan (o opts.data para fijarlos).
// Devuelve { text, tools:[{name,args,result,prefetched?}] }. Si falla, la conversación vuelve al estado anterior.
async function coachAsk(text, hooks, opts){
  hooks = hooks || {}; opts = opts || {};
  const before = coachContents.length;
  coachContents.push({ role: 'user', parts: [{ text: text }] });
  const data = opts.data !== undefined ? opts.data : coachPrefetch(opts.intent, opts.ejercicio);
  const dataText = coachDataText(data);
  const used = data.slice();
  const stream = COACH_STREAM && typeof fetch === 'function';
  try {
    for (let step = 0; step < COACH_MAX_STEPS; step++) {
      const body = {
        system: coachSystemPrompt(), contents: coachWithData(coachTrim(coachContents), dataText),
        tools: [{ functionDeclarations: coachToolDeclarations() }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      };
      const resp = stream ? await coachCallStream(body, hooks.onText) : await coachCall(body);
      const content = resp && resp.content;
      if (!content || !Array.isArray(content.parts) || !content.parts.length) throw coachErr(resp && resp.blocked ? 'blocked' : 'empty', 'respuesta vacía');
      coachContents.push(content);                                   // tal cual (con firmas de razonamiento)
      const calls = content.parts.filter(p => p.functionCall);
      if (hooks.onStepEnd) hooks.onStepEnd(calls.length > 0);
      if (!calls.length) {
        const answer = content.parts.map(p => (typeof p.text === 'string' && !p.thought) ? p.text : '').join('').trim();
        if (!answer) throw coachErr('empty', 'sin texto');
        return { text: answer, tools: used };
      }
      const responses = calls.map(p => {
        const fc = p.functionCall, args = (fc.args && typeof fc.args === 'object') ? fc.args : {};
        if (hooks.onTool) hooks.onTool(fc.name, args);
        const result = coachResultJson(coachRunTool(fc.name, args));
        used.push({ name: fc.name, args: args, result: result });
        const part = { functionResponse: { name: fc.name, response: { result: result } } };
        if (fc.id) part.functionResponse.id = fc.id;
        return part;
      });
      coachContents.push({ role: 'user', parts: responses });
    }
    throw coachErr('too_many_steps', 'demasiadas herramientas seguidas');
  } catch (e) {
    coachContents.length = before;                                    // no dejar la conversación a medias
    throw e;
  }
}

function coachResetConversation(){ coachContents = []; }

// Reconstruye la conversación (solo texto) tras recargar la app. Una pregunta sin respuesta (error) se omite
// para que los turnos sigan alternando usuario / modelo.
function coachRestoreContents(msgs){
  coachContents = [];
  const list = (msgs || []).filter(m => m.role === 'user' || m.role === 'bot');
  list.forEach((m, i) => {
    if (m.role === 'user' && list[i + 1] && list[i + 1].role === 'bot') coachContents.push({ role: 'user', parts: [{ text: m.modelText || m.text }] });
    else if (m.role === 'bot' && i > 0 && list[i - 1].role === 'user') coachContents.push({ role: 'model', parts: [{ text: m.text }] });
  });
}
