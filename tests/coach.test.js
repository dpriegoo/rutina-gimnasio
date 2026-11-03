// Entrenador IA: herramientas, bucle con Gemini (simulado) e interfaz.
//   npm test
// Gemini y Supabase se SIMULAN: aquí se comprueba todo lo que hace la app (qué consulta, cómo contesta a cada
// petición de herramienta, cómo conserva la conversación, errores, límites e interfaz), no la calidad de la respuesta.
const path = require('path'), assert = require('assert');
const { boot } = require('./page-helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.parse(JSON.stringify(x));       // normaliza objetos que vienen de la página (otro realm)

(async () => {
  const r = await boot(path.join(__dirname, '..', 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const w = r.w, d = w.document;
  const run = (name, args) => J(w.coachRunTool(name, args || {}));

  // ---------- datos: tu ejemplo (esta semana 1 día hecho; semanas anteriores con historial) ----------
  const routine = J(w.eval("DAYS.map(d => ({ name: d.name, groups: d.groups.map(g => ({ label: g.label, ex: g.exercises.map(e => e.name) })) }))"));
  const ws = w.getWeekStart(), ds = x => w.localDateStr(x);
  const addDays = (dt, n) => { const o = new Date(dt); o.setDate(o.getDate() + n); return o; };
  const rows = [];
  const R = (fecha, dia, grupo, ej, peso, reps, series, v) => ({ Perfil: 'David', Fecha: fecha, 'Día': dia, Grupo: grupo, Ejercicio: ej, 'Peso (kg)': peso, Reps: reps, Series: series, Calentamiento: false, Variante: v || '', Nota: '' });
  routine.slice(0, 2).forEach((day, di) => {
    for (let k = 1; k <= 9; k++) day.groups.forEach(g => g.ex.forEach(e => rows.push(R(ds(addDays(ws, -7 * k + di)), day.name, g.label, e, 40 + (9 - k) * 1.25, 8, 3))));
  });
  routine[0].groups.forEach(g => g.ex.forEach(e => rows.push(R(ds(ws), routine[0].name, g.label, e, 50, 8, 3))));   // esta semana: Día 1 completo (lunes)
  // Un ejercicio con máquina secundaria (+30 % de peso) intercalada
  for (let i = 0; i < 10; i++) { const sec = (i === 2 || i === 4 || i === 7); rows.push(R(ds(addDays(ws, -7 * (10 - i))), 'Día 3 · Pierna', 'Piernas', 'Prensa test', sec ? 52 : 40, 8, 3, sec ? 'Leg Curl' : '')); }
  w._progressCache = rows;
  w._weightHistory = [{ fecha: ds(addDays(ws, -20)), peso: 80 }, { fecha: ds(addDays(ws, -10)), peso: 79.4 }, { fecha: ds(addDays(ws, -1)), peso: 79 }];
  const ex1 = routine[0].groups[0].ex[0];

  // ---------- 1) Declaraciones ----------
  const decl = J(w.coachToolDeclarations());
  assert(decl.length >= 9, 'hay herramientas');
  assert.strictEqual(new Set(decl.map(x => x.name)).size, decl.length, 'nombres únicos');
  decl.forEach(x => {
    assert(/^[a-z_]+$/.test(x.name) && x.description.length > 30, x.name + ': nombre y descripción');
    assert.strictEqual(x.parameters.type, 'OBJECT');
    (x.parameters.required || []).forEach(q => assert(x.parameters.properties[q], x.name + ': required ' + q + ' debe existir'));
    Object.values(x.parameters.properties || {}).forEach(p => assert(['STRING', 'INTEGER', 'NUMBER', 'BOOLEAN'].includes(p.type), x.name + ': tipo ' + p.type));
  });
  assert(JSON.stringify(decl).length < 14000, 'las declaraciones no pesan demasiado');

  // ---------- 2) get_context: tu ejemplo ----------
  const ctx = run('get_context');
  assert.strictEqual(ctx.usuario, 'David'); assert.strictEqual(ctx.hoy, w.localDateStr());
  assert.strictEqual(ctx.semana_desde, ds(ws)); assert(ctx.dias_hasta_el_domingo >= 0 && ctx.dias_hasta_el_domingo <= 6);
  assert.strictEqual(ctx.dias_entrenados_esta_semana, 1); assert.strictEqual(ctx.detalle_dias_entrenados[0].fecha, ds(ws));
  assert.strictEqual(ctx.detalle_dias_entrenados[0].dia_semana, 'lunes');
  assert.strictEqual(ctx.rutina.length, routine.length);
  assert.strictEqual(ctx.rutina[0].estado, 'completo', 'el Día 1 está completo esta semana');
  assert(ctx.rutina.slice(1).every(x => x.estado === 'pendiente'), 'el resto, pendientes');
  assert(ctx.rutina[1].ultima_vez && ctx.rutina[1].dias_desde_la_ultima_vez >= 0, 'días desde la última vez del Día 2');
  assert(ctx.rutina[2].ultima_vez === null || ctx.rutina[2].ultima_vez !== undefined);
  assert(ctx.rutina.filter(x => x.sugerido_por_la_app).length <= 1);
  assert(ctx.rutina[0].grupos.length > 0 && typeof ctx.semana_de_descanso_activa === 'boolean');

  // ---------- 3) Rutina, ejercicios, semana ----------
  const rt = run('get_routine'); assert.strictEqual(rt.dias.length, routine.length);
  assert(rt.dias[0].grupos[0].ejercicios[0].series_y_reps, 'series y reps objetivo');
  const le = run('list_exercises'); assert(le.ejercicios.some(x => x.ejercicio === ex1 && x.sesiones >= 10));
  const wk0 = run('get_week_status', { semanas_atras: 0 });
  assert.strictEqual(wk0.dias_entrenados, 1); assert(wk0.volumen_total_kg > 0);
  assert(wk0.dias[0].ejercicios.every(e => e.series === 3), 'objetivo de 3 series cumplido');
  assert.strictEqual(wk0.dias[1].ejercicios.length, 0, 'Día 2 sin series esta semana');
  const wk1 = run('get_week_status', { semanas_atras: 1 }); assert.strictEqual(wk1.dias_entrenados, 2);
  assert.strictEqual(run('get_week_status', { semanas_atras: 999 }).semana_desde, ds(addDays(ws, -7 * 12)), 'se acota a 12 semanas');

  // ---------- 4) Progresión de un ejercicio ----------
  const pr = run('get_exercise_progress', { ejercicio: ex1.toLowerCase().slice(0, 12) });
  assert.strictEqual(pr.ejercicio, ex1, 'nombre aproximado -> el de la rutina');
  assert(pr.sesiones_totales >= 10 && pr.serie.length === 12 || pr.serie.length === pr.sesiones_totales || pr.serie.length > 0);
  assert(pr.tendencia && typeof pr.tendencia === 'object' && pr.tendencia.estancado === false, 'creciendo semana a semana: tendencia al alza');
  assert(pr.cambio_reciente.pct > 0 && /anteriores/.test(pr.cambio_reciente.comparacion));
  assert(/fuerza_estimada/.test(pr.metrica) && pr.rango_objetivo, 'metrica y rango objetivo');
  const pLast = J(w.eval("exerciseSeries(" + JSON.stringify(ex1) + ").sessions.slice(-1)[0].value"));
  assert(Math.abs(pr.actual - pLast) < 0.06, 'el número es el mismo que calcula la app');
  assert(run('get_exercise_progress', { ejercicio: 'tríceps' }).error.indexOf('Candidatos') >= 0, 'nombre ambiguo -> candidatos');
  assert(/No hay ningún ejercicio/.test(run('get_exercise_progress', { ejercicio: 'zzzzz' }).error));
  assert(run('get_exercise_progress', {}).error, 'sin nombre -> error claro');
  const pm = run('get_exercise_progress', { ejercicio: 'Prensa test' });
  assert.strictEqual(pm.sesiones_ajustadas_de_otra_maquina, 3, 'las 3 sesiones de la otra máquina se ajustan');
  assert(pm.maquinas.length === 2 && pm.serie.some(s => s.ajustada_x && Math.abs(s.ajustada_x - 40 / 52) < 0.01));
  assert.strictEqual(run('get_exercise_progress', { ejercicio: 'Prensa test', maquina: 'habitual' }).sesiones_en_la_serie, 7);
  assert(run('get_exercise_progress', { ejercicio: 'Prensa test', maquina: 'Inventada' }).error.indexOf('Máquinas') >= 0);
  assert(/Sin historial/.test(run('get_exercise_progress', { ejercicio: routine[2].groups[0].ex[0] }).aviso), 'ejercicio sin historial');
  assert.strictEqual(run('get_exercise_progress', { ejercicio: ex1, ultimas_sesiones: 3 }).serie.length, 3);

  // ---------- 5) Series sueltas, carga muscular, semanas, peso, señales ----------
  const st = run('get_exercise_sets', { ejercicio: ex1, limite: 5 });
  assert.strictEqual(st.series.length, 5); assert(st.series[0].fecha >= st.series[4].fecha, 'de más reciente a más antigua');
  assert.strictEqual(run('get_exercise_sets', { ejercicio: ex1, desde: ds(ws) }).series.length, 1);
  const zones = J(w.eval("Object.keys(MUSCLE_ZONES).length"));
  const ml = run('get_muscle_load', { semanas: 4 });
  assert.strictEqual(ml.zonas.length, zones); assert(ml.zonas.every(z => z.semanas.length === 4));
  const thisWeekSeries = ml.zonas.reduce((s, z) => s + z.semana_actual.series, 0);
  assert(thisWeekSeries > 0 && thisWeekSeries <= wk0.series_totales, 'la carga muscular suma lo hecho esta semana');
  const ws8 = run('get_weekly_summary', { semanas: 4 });
  assert.strictEqual(ws8.semanas.length, 4); assert.strictEqual(ws8.semanas[3].es_la_semana_actual, true); assert.strictEqual(ws8.semanas[3].dias_entrenados, 1);
  assert.strictEqual(ws8.semanas[2].dias_entrenados, 2);
  const bw = run('get_body_weight', { dias: 30 });
  assert.strictEqual(bw.peso_actual_kg, 79); assert.strictEqual(bw.registros.length, 3);
  assert(run('get_app_signals') && 'zona_mas_rezagada_semana_pasada' in run('get_app_signals'));
  assert(/desconocida/.test(run('inventada').error), 'herramienta desconocida');
  assert(run('get_week_status', 'basura') && !run('get_week_status', null).error, 'argumentos raros no la rompen');

  // ---------- 6) Bucle con Gemini simulado ----------
  const calls = []; let script = [];
  w.sbClient = () => ({ functions: { invoke: async (name, o) => { calls.push({ name: name, body: J(o.body) }); const f = script.shift(); return f(J(o.body)); } } });
  const model = parts => ({ data: { content: { role: 'model', parts: parts }, finishReason: 'STOP' } });
  w.eval('COACH_STREAM = false');            // las pruebas 6 y 7 cubren la vía clásica (de golpe); el streaming se prueba más abajo

  // 6a) planificar la semana: llamada simple con firma de razonamiento, llamadas paralelas con id, respuesta final
  script = [
    () => model([{ functionCall: { name: 'get_context', args: {} }, thoughtSignature: 'SIG-1' }]),
    req => {
      const last = req.contents[req.contents.length - 1], prev = req.contents[req.contents.length - 2];
      assert.strictEqual(last.role, 'user'); assert.strictEqual(last.parts[0].functionResponse.name, 'get_context');
      assert.strictEqual(last.parts[0].functionResponse.response.result.dias_entrenados_esta_semana, 1, 'el resultado de la herramienta vuelve a Gemini');
      assert.strictEqual(prev.parts[0].thoughtSignature, 'SIG-1', 'la respuesta del modelo se devuelve TAL CUAL (con su firma)');
      return model([{ functionCall: { id: 'c1', name: 'get_week_status', args: { semanas_atras: 0 } } }, { functionCall: { id: 'c2', name: 'get_muscle_load', args: { semanas: 4 } } }]);
    },
    req => {
      const last = req.contents[req.contents.length - 1];
      assert.strictEqual(last.parts.length, 2, 'una respuesta por cada llamada, en el mismo turno');
      assert.deepStrictEqual(last.parts.map(p => p.functionResponse.id), ['c1', 'c2'], 'se devuelve el id de cada llamada');
      assert.deepStrictEqual(last.parts.map(p => p.functionResponse.name), ['get_week_status', 'get_muscle_load']);
      return model([{ text: 'Haz el **Día 3**.\n- Motivo uno\n- Motivo dos' }]);
    },
  ];
  const seen = [];
  const ans = await w.coachAsk('¿Qué día hago?', { onTool: (n) => seen.push(n) });
  assert.strictEqual(ans.text.indexOf('Haz el **Día 3**'), 0); assert.strictEqual(ans.tools.length, 4, 'el contexto adelantado + 3 herramientas pedidas por Gemini'); assert.strictEqual(ans.tools[0].prefetched, true);
  assert.deepStrictEqual(J(seen), ['get_context', 'get_week_status', 'get_muscle_load']);
  const b0 = calls[0].body;
  assert.strictEqual(calls[0].name, 'coach'); assert.strictEqual(b0.contents[0].parts[0].text, '¿Qué día hago?');
  assert(/IronLog de David/.test(b0.system) && /get_context/.test(b0.system) && /NUNCA inventes/.test(b0.system), 'prompt de sistema');
  assert.strictEqual(b0.tools[0].functionDeclarations.length, decl.length); assert(b0.generationConfig.maxOutputTokens <= 4096);
  assert.strictEqual(calls.length, 3);

  // 6b) segunda pregunta: la conversación se conserva (y turnos alternos)
  script = [req => { assert.strictEqual(req.contents[0].parts[0].text, '¿Qué día hago?', 'recuerda lo anterior'); return model([{ text: 'Vale.' }]); }];
  await w.coachAsk('Gracias'); assert.strictEqual(J(w.eval('coachContents')).slice(-1)[0].role, 'model');

  // 6c) errores: la conversación no queda a medias
  const before = J(w.eval('coachContents')).length;
  for (const [st, code] of [[401, 'unauthorized'], [429, 'limit'], [403, 'forbidden'], [404, 'not_deployed'], [500, 'unavailable']]) {
    script = [() => ({ error: { message: 'x', context: { status: st, json: async () => ({}) } } })];
    await assert.rejects(() => w.coachAsk('hola'), e => e.coachCode === code, 'HTTP ' + st + ' -> ' + code);
    assert.strictEqual(J(w.eval('coachContents')).length, before, 'tras el error la conversación no cambia');
  }
  // el motivo que da el servidor llega al usuario (para ver qué falta sin abrir las herramientas del navegador)
  for (const [st, msg] of [[503, 'Falta configurar GEMINI_API_KEY en la función'], [503, 'No se pudo comprobar la cuenta o el límite diario (¿falta ejecutar supabase/coach.sql?)'], [503, 'Gemini respondió con un error: You exceeded your current quota']]) {
    script = [() => ({ error: { message: 'x', context: { status: st, json: async () => ({ code: 'unavailable', message: msg }) } } })];
    let caught; try { await w.coachAsk('hola'); } catch (e) { caught = e; }
    assert(w.coachErrorText(caught).indexOf('Detalle: ' + msg) > 0, 'el chat enseña el motivo: ' + msg);
  }
  assert.strictEqual(w.coachErrorText({ coachCode: 'limit', message: 'Límite diario alcanzado' }), w.coachErrorText({ coachCode: 'limit' }), 'los demás avisos no cambian');
  assert(w.coachErrorText({ coachCode: 'unavailable', message: 'x'.repeat(1000) }).length < 500, 'el detalle se acota');
  // saturación pasajera de Gemini: aviso propio (sin "Detalle"), porque basta con reintentar
  script = [() => ({ error: { message: 'x', context: { status: 503, json: async () => ({ code: 'overloaded', message: 'Gemini respondió con un error: This model is currently experiencing high demand.' }) } } })];
  let ov; try { await w.coachAsk('hola'); } catch (e) { ov = e; }
  assert.strictEqual(ov.coachCode, 'overloaded'); assert(/saturado/.test(w.coachErrorText(ov)) && !/Detalle/.test(w.coachErrorText(ov)), 'aviso claro de alta demanda');
  script = [() => model([{ text: '' }])]; await assert.rejects(() => w.coachAsk('hola'), e => e.coachCode === 'empty');
  script = [() => ({ error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('Failed to fetch') } })];
  await assert.rejects(() => w.coachAsk('hola'), e => e.coachCode === 'unreachable', 'vía clásica: sin código HTTP -> no se pudo conectar');
  script = [() => ({ data: { blocked: true } })]; await assert.rejects(() => w.coachAsk('hola'), e => e.coachCode === 'blocked');
  // 6d) bucle infinito de herramientas
  script = Array.from({ length: 20 }, () => () => model([{ functionCall: { name: 'get_context', args: {} } }]));
  calls.length = 0; await assert.rejects(() => w.coachAsk('hola'), e => e.coachCode === 'too_many_steps');
  assert.strictEqual(calls.length, 8, 'se corta en 8 vueltas'); assert.strictEqual(J(w.eval('coachContents')).length, before);
  // 6e) herramienta desconocida: Gemini recibe el error y puede seguir
  script = [() => model([{ functionCall: { name: 'borrar_todo', args: {} } }]), req => { assert(req.contents.slice(-1)[0].parts[0].functionResponse.response.result.error, 'recibe el error'); return model([{ text: 'ok' }]); }];
  assert.strictEqual((await w.coachAsk('prueba')).text, 'ok');
  // 6f) recorte de la conversación sin partir llamada/respuesta, y resultados enormes
  const big = []; for (let i = 0; i < 12; i++) { big.push({ role: 'user', parts: [{ text: 'q' + i }] }, { role: 'model', parts: [{ functionCall: { name: 'get_context', args: {} } }] }, { role: 'user', parts: [{ functionResponse: { name: 'get_context', response: { result: {} } } }] }, { role: 'model', parts: [{ text: 'a' + i }] }); }
  const tr = J(w.coachTrim(big)); assert.strictEqual(tr[0].parts[0].text, 'q4', 'se queda con los últimos 8 turnos del usuario'); assert.strictEqual(tr.length, 32);
  assert(J(w.coachResultJson({ x: 'a'.repeat(20000) })).error, 'un resultado enorme se sustituye por un aviso');

  // ---------- 7) Interfaz ----------
  const fab = d.getElementById('coachFab');
  assert(fab && !fab.hidden && /entrenador/i.test(fab.getAttribute('aria-label')), 'botón flotante visible con sesión');
  w.coachNewConversation();
  w.coachOpen();
  const sheet = d.getElementById('coachSheet');
  assert(sheet.classList.contains('on') && sheet.getAttribute('role') === 'dialog' && sheet.getAttribute('aria-modal') === 'true');
  assert(/David/.test(d.getElementById('coachMsgs').textContent) && /¿Sobre qué quieres hablar\?/.test(d.getElementById('coachMsgs').textContent));
  assert.strictEqual(d.querySelectorAll('#coachChips .coach-chip').length, 5, 'menú guiado de 5 opciones');
  assert.strictEqual(d.getElementById('coachSheet').querySelector('#coachInput').getAttribute('aria-label'), 'Tu pregunta');

  // 7a) planificar: menú -> cuántos días -> pregunta con intención (la intención no se ve en el chat)
  w.coachMenu('week');
  assert(/¿Cuántos días más vas a ir/.test(d.getElementById('coachChips').textContent));
  assert.strictEqual(d.querySelectorAll('#coachChips .coach-chip').length, 5, '1, 2, 3, no lo sé, volver');
  let reqBody = null; let release = null;
  script = [
    req => { reqBody = req; return model([{ functionCall: { name: 'get_context', args: {} } }]); },
    () => new Promise(res => { release = () => res(model([{ text: 'Te conviene el **Día 3**:\n- por esto\n- por aquello\n\n<img src=x onerror=alert(1)> fin' }])); }),
  ];
  const p = w.coachWeek(1);
  await sleep(20);
  assert(d.getElementById('coachSend').disabled, 'mientras piensa no se puede enviar otra');
  assert(d.querySelector('.cm-act'), 'aviso de "pensando"');
  const nBefore = calls.length; w.coachSubmitInput(); w.coachMenu('overall'); assert.strictEqual(calls.length, nBefore, 'una segunda pregunta en curso se ignora');
  release(); await p; await sleep(20);
  const lastUser = reqBody.contents[reqBody.contents.length - 1].parts[0].text;
  assert(/Voy a ir 1 día más/.test(lastUser) && /\[Intención de la app: planificar_semana\. Días extra indicados: 1\]/.test(lastUser), 'Gemini recibe la intención');
  const html = d.getElementById('coachMsgs').innerHTML;
  assert(/Voy a ir 1 día más/.test(d.querySelector('.cm-user').textContent) && !/Intención de la app/.test(d.getElementById('coachMsgs').textContent), 'el usuario no ve la pista interna');
  assert(/<strong>Día 3<\/strong>/.test(html) && /<li>por esto<\/li>/.test(html), 'markdown mínimo');
  assert(/&lt;img src=x onerror=alert\(1\)&gt;/.test(html) && !/<img/i.test(html), 'lo que escriba Gemini NUNCA se pinta como HTML');
  assert(d.querySelector('.coach-data summary'), 'datos consultados (transparencia)');
  assert(!d.getElementById('coachSend').disabled);
  assert(/Otra consulta/.test(d.getElementById('coachChips').textContent), 'tras responder, se puede volver al menú');
  const saved = JSON.parse(w.localStorage.getItem('coachChat_David')); assert(saved.msgs.length === 2 && saved.msgs[0].modelText, 'se guarda la conversación (solo texto)');

  // 7b) ejercicio de hoy y progresión de un ejercicio
  w.coachBack(); w.coachMenu('today');
  const names = J(w._coachTodayNames); assert(names.length > 0 && d.querySelectorAll('#coachChips .coach-chip').length === names.length + 1, 'los ejercicios del día');
  script = [req => { assert(/Hoy me toca «/.test(req.contents.slice(-1)[0].parts[0].text) && /ejercicio_hoy/.test(req.contents.slice(-1)[0].parts[0].text)); return model([{ text: 'Sube **1,25 kg**.' }]); }];
  await w.coachToday(0); await sleep(20);
  w.coachBack(); w.coachMenu('exercise');
  const pick = d.getElementById('coachPick'); assert(pick.options.length > 5);
  const nPick = calls.length; w.coachPickGo(); assert.strictEqual(calls.length, nPick, 'sin elegir ejercicio no se envía nada');
  pick.value = ex1; script = [req => { assert(new RegExp('«' + ex1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '»').test(req.contents.slice(-1)[0].parts[0].text)); return model([{ text: 'Vas bien.' }]); }];
  await w.coachPickGo(); await sleep(20);

  // 7c) error en pantalla y reintento
  w.coachBack();
  script = [() => ({ error: { message: 'x', context: { status: 429, json: async () => ({}) } } }), () => model([{ text: 'Ya funciona.' }])];
  const nUsers = () => d.querySelectorAll('.cm-user').length;
  const u0 = nUsers();
  await w.coachSend('¿Voy bien?', null); await sleep(20);
  assert(/límite diario/.test(d.querySelector('.cm-err').textContent) && d.querySelector('.coach-retry'), 'aviso de límite con botón de reintentar');
  assert.strictEqual(nUsers(), u0 + 1);
  await w.coachRetry(); await sleep(20);
  assert(!d.querySelector('.cm-err') && /Ya funciona/.test(d.getElementById('coachMsgs').textContent) && nUsers() === u0 + 1, 'el reintento no duplica la pregunta');

  // 7d) cerrar, Escape, foco, nueva conversación y cierre de sesión
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(!sheet.classList.contains('on'), 'Escape cierra'); assert.strictEqual(d.activeElement, fab, 'el foco vuelve al botón');
  w.coachOpen(); w.coachNewConversation();
  assert.strictEqual(d.querySelectorAll('.cm-user').length, 0); assert.strictEqual(J(w.eval('coachContents')).length, 0);
  assert.strictEqual(JSON.parse(w.localStorage.getItem('coachChat_David')).msgs.length, 0);
  script = [() => model([{ text: 'Hola.' }])]; await w.coachSend('hola', null);
  w.coachOnLogout();
  assert.strictEqual(w.localStorage.getItem('coachChat_David'), null, 'al cerrar sesión se borra el chat'); assert(!sheet.classList.contains('on'));
  w.localStorage.setItem('profile', 'David');

  // ---------- 8) Restaurar tras recargar: turnos alternos y sin preguntas huérfanas ----------
  w.coachRestoreContents([{ role: 'user', text: 'a', modelText: 'a+' }, { role: 'bot', text: 'b' }, { role: 'user', text: 'c' }, { role: 'user', text: 'd' }, { role: 'bot', text: 'e' }]);
  const rc = J(w.eval('coachContents')); assert.deepStrictEqual(rc.map(x => x.role), ['user', 'model', 'user', 'model'], 'sin dos turnos seguidos del mismo rol');
  assert.strictEqual(rc[0].parts[0].text, 'a+', 'se restaura el texto con la pista de intención');


  // ---------- 8b) Velocidad: datos adelantados ----------
  const nm = x => J(x).map(i => i.name);
  assert.deepStrictEqual(nm(w.coachPrefetchPlan(null, null).map(x => ({ name: x[0] }))), ['get_context'], 'pregunta libre: solo el contexto');
  assert.deepStrictEqual(nm(w.coachPrefetchPlan('planificar_semana').map(x => ({ name: x[0] }))), ['get_context', 'get_week_status', 'get_muscle_load', 'get_app_signals']);
  assert.deepStrictEqual(nm(w.coachPrefetchPlan('ejercicio_hoy', ex1).map(x => ({ name: x[0] }))), ['get_context', 'get_exercise_progress', 'get_exercise_sets']);
  assert.deepStrictEqual(nm(w.coachPrefetchPlan('progresion_ejercicio', ex1).map(x => ({ name: x[0] }))), ['get_context', 'get_exercise_progress', 'get_exercise_sets']);
  const rev = nm(w.coachPrefetchPlan('revision_general').map(x => ({ name: x[0] })));
  assert(rev.includes('get_weekly_summary') && rev.includes('get_body_weight') && rev.filter(n => n === 'get_exercise_progress').length === 3, 'revisión general: resumen, carga, peso y los 3 ejercicios con más historial');
  const pf = J(w.coachPrefetch('planificar_semana'));
  assert(pf.every(x => x.prefetched && x.result && !x.result.error), 'los datos adelantados salen bien'); assert.strictEqual(pf[0].result.dias_entrenados_esta_semana, 1);
  const dt = w.coachDataText(w.coachPrefetch('planificar_semana'));
  assert(/^DATOS YA CONSULTADOS POR LA APP/.test(dt) && /### get_context\n\{/.test(dt) && /### get_week_status \{"semanas_atras":0\}/.test(dt));
  assert.strictEqual(w.coachDataText([]), '');
  assert(dt.length < 24000, 'los datos adelantados no son enormes (' + dt.length + ' caracteres)');
  const hist = [{ role: 'user', parts: [{ text: 'q1' }] }, { role: 'model', parts: [{ text: 'a1' }] }, { role: 'user', parts: [{ text: 'q2' }] }, { role: 'model', parts: [{ functionCall: { name: 'x', args: {} } }] }, { role: 'user', parts: [{ functionResponse: { name: 'x', response: { result: {} } } }] }];
  const wd = J(w.coachWithData(hist, 'DATOS'));
  assert.strictEqual(wd[0].parts.length, 1, 'los turnos anteriores NO llevan datos (no se acumulan)'); assert.strictEqual(wd[2].parts.length, 2); assert.strictEqual(wd[2].parts[1].text, 'DATOS');
  assert.strictEqual(wd[4].parts.length, 1, 'las respuestas de herramientas no se tocan'); assert.strictEqual(J(w.coachWithData(hist, '')).length, 5);

  // Una pregunta guiada = UNA llamada a Gemini (antes: get_context, luego herramientas, luego respuesta)
  calls.length = 0; w.coachNewConversation();
  script = [req => {
    const last = req.contents[req.contents.length - 1];
    assert.strictEqual(last.parts[0].text.indexOf('Esta semana quiero planificar'), 0); assert(/Intención de la app: planificar_semana/.test(last.parts[0].text));
    assert(/DATOS YA CONSULTADOS/.test(last.parts[1].text) && /get_muscle_load/.test(last.parts[1].text) && /get_app_signals/.test(last.parts[1].text), 'los datos van en el primer mensaje');
    assert(/NO repitas esas consultas/.test(req.system), 'el prompt le dice que no los repita');
    return model([{ text: 'Haz el **Día 3**.' }]);
  }];
  w.coachOpen(); await w.coachWeek(1); await sleep(20);
  assert.strictEqual(calls.length, 1, 'planificar la semana: una sola llamada a Gemini');
  assert(/Haz el/.test(d.getElementById('coachMsgs').textContent));
  assert.strictEqual(d.querySelectorAll('.coach-data li').length, 4, 'los datos adelantados salen en "Datos consultados"'); assert(/adelantado/.test(d.querySelector('.coach-data').innerHTML));
  calls.length = 0; w.coachNewConversation();
  script = [req => { assert(/get_exercise_progress/.test(req.contents.slice(-1)[0].parts[1].text) && /get_exercise_sets/.test(req.contents.slice(-1)[0].parts[1].text)); return model([{ text: 'Vas bien.' }]); }];
  d.getElementById('coachInput').value = ''; w.coachMenu('exercise'); d.getElementById('coachPick').value = ex1; await w.coachPickGo(); await sleep(20);
  assert.strictEqual(calls.length, 1, 'progresión de un ejercicio: una sola llamada');
  // Pregunta libre: solo el contexto; si Gemini necesita más, lo pide
  calls.length = 0; w.coachNewConversation();
  script = [req => { assert(/### get_context/.test(req.contents.slice(-1)[0].parts[1].text) && !/get_week_status/.test(req.contents.slice(-1)[0].parts[1].text)); return model([{ functionCall: { name: 'get_week_status', args: { semanas_atras: 1 } } }]); }, () => model([{ text: 'La semana pasada hiciste 2 días.' }])];
  await w.coachSend('¿Cómo fue la semana pasada?', null); await sleep(20);
  assert.strictEqual(calls.length, 2, 'si necesita más datos, pide la herramienta y contesta');

  // ---------- 8c) Streaming ----------
  w.eval('COACH_STREAM = true'); w.TextDecoder = TextDecoder;
  const enc = new TextEncoder(); const fcalls = []; let fscript = [];
  const realFetch = w.fetch;
  w.fetch = (url, init) => String(url).includes('/functions/v1/coach') ? (fcalls.push({ url: String(url), init: init, body: JSON.parse(init.body) }), fscript.shift()(JSON.parse(init.body))) : realFetch(url, init);
  w.sbClient = () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'TOKEN-123' } } }) }, functions: { invoke: async () => { throw new Error('no debe usarse con streaming'); } } });
  const sres = (chunks, o = {}) => ({ ok: true, status: 200, json: async () => ({}), text: async () => chunks.join(''), body: { getReader() { let i = 0; return { read: async () => { if (o.gap) await sleep(o.gap); return i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true }; } }; } } });
  const jres = (status, json) => ({ ok: false, status: status, json: async () => json, text: async () => JSON.stringify(json), body: null });
  const ev = o => 'data: ' + JSON.stringify(o) + '\r\n\r\n';
  const cc = (parts, fin) => ev({ candidates: [{ content: { role: 'model', parts: parts }, finishReason: fin }] });
  w.coachNewConversation();

  // a) el texto se va pintando; las líneas de evento pueden partirse en cualquier sitio
  const full = cc([{ text: 'Hola ' }]) + cc([{ text: 'mundo, ' }]) + cc([{ text: 'qué tal.' }], 'STOP');
  const cut = [full.slice(0, 17), full.slice(17, full.indexOf('\r\n\r\n') + 1), full.slice(full.indexOf('\r\n\r\n') + 1, 120), full.slice(120)];
  fscript = [() => sres(cut)]; const partials = [];
  let out = await w.coachAsk('hola', { onText: t => partials.push(t) }, { data: [] });
  assert.strictEqual(out.text, 'Hola mundo, qué tal.'); assert.deepStrictEqual(J(partials), ['Hola ', 'Hola mundo, ', 'Hola mundo, qué tal.'], 'el texto llega por trozos, aunque el flujo se parta en mitad de un evento');
  assert.strictEqual(fcalls[0].url.slice(-19), '/functions/v1/coach'); assert.strictEqual(fcalls[0].init.headers.authorization, 'Bearer TOKEN-123');
  assert(fcalls[0].init.headers.apikey.length > 10, 'cabecera apikey'); assert.strictEqual(fcalls[0].body.stream, true); assert.strictEqual(fcalls[0].body.contents[0].parts[0].text, 'hola');
  assert.strictEqual(J(w.eval('coachContents')).slice(-1)[0].parts.length, 1, 'los trozos de texto se juntan en uno');
  // b) llamada a herramienta con firma de razonamiento y texto de "pensamiento": se conserva todo, se ejecuta y se contesta
  w.coachNewConversation(); fcalls.length = 0;
  fscript = [
    () => sres([cc([{ text: 'Pienso…', thought: true }]), cc([{ functionCall: { id: 'k1', name: 'get_context', args: {} }, thoughtSignature: 'SIG-A' }], 'STOP')]),
    req => { const prev = req.contents[req.contents.length - 2], last = req.contents[req.contents.length - 1];
      assert.strictEqual(prev.parts[1].thoughtSignature, 'SIG-A', 'la firma viaja con SU trozo'); assert.strictEqual(prev.parts[0].thought, true, 'el trozo de pensamiento se conserva');
      assert.strictEqual(last.parts[0].functionResponse.id, 'k1'); return sres([cc([{ text: 'Listo.' }], 'STOP')]); },
  ];
  const seenText = []; out = await w.coachAsk('plan', { onText: t => seenText.push(t), onStepEnd: h => seenText.push('fin:' + h) }, { data: [] });
  assert.strictEqual(out.text, 'Listo.'); assert.strictEqual(fcalls.length, 2);
  assert(!seenText.some(t => /Pienso/.test(t)), 'el texto de pensamiento no se muestra'); assert.deepStrictEqual(J(seenText.filter(t => /^fin:/.test(t))), ['fin:true', 'fin:false']);
  // c) errores
  w.coachNewConversation();
  for (const [st, code] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'limit'], [404, 'not_deployed'], [503, 'unavailable']]) {
    fscript = [() => jres(st, { code: st === 503 ? 'unavailable' : undefined, message: 'm' })];
    await assert.rejects(() => w.coachAsk('x', {}, { data: [] }), e => e.coachCode === code, 'HTTP ' + st + ' -> ' + code);
  }
  fscript = [() => sres([ev({ promptFeedback: { blockReason: 'SAFETY' } })])]; await assert.rejects(() => w.coachAsk('x', {}, { data: [] }), e => e.coachCode === 'blocked');
  fscript = [() => sres([])]; await assert.rejects(() => w.coachAsk('x', {}, { data: [] }), e => e.coachCode === 'empty');
  fscript = [() => sres([cc([{ text: 'a' }]), ev({ error: { message: 'boom' } })])]; await assert.rejects(() => w.coachAsk('x', {}, { data: [] }), e => e.coachCode === 'unavailable', 'un error a mitad del flujo');
  fscript = [() => { throw new TypeError('Failed to fetch'); }]; await assert.rejects(() => w.coachAsk('x', {}, { data: [] }), e => e.coachCode === 'unreachable', 'un fallo de red / función inexistente (la petición previa CORS da 404) apunta al despliegue');
  assert(/desplegada en Supabase/.test(w.coachErrorText({ coachCode: 'unreachable' })) && /«coach»/.test(w.coachErrorText({ coachCode: 'unreachable' })), 'el mensaje dice dónde mirar y el nombre exacto');
  assert.strictEqual(J(w.eval('coachContents')).length, 0, 'tras los errores la conversación sigue limpia');
  const origSb = w.sbClient; w.sbClient = () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }); await assert.rejects(() => w.coachAsk('x', {}, { data: [] }), e => e.coachCode === 'unauthorized', 'sin sesión no se intenta'); w.sbClient = origSb;
  fscript = [() => ({ ok: true, status: 200, body: null, text: async () => cc([{ text: 'sin lector' }], 'STOP') })]; assert.strictEqual((await w.coachAsk('x', {}, { data: [] })).text, 'sin lector', 'sin ReadableStream también funciona (lee el texto entero)');
  w.coachNewConversation();

  // d) en pantalla: la burbuja en directo, y las herramientas de un paso intermedio no dejan texto suelto
  w.coachOpen();
  fscript = [() => sres([cc([{ text: 'Voy a mirar tu semana. ' }]), cc([{ functionCall: { name: 'get_context', args: {} } }], 'STOP')], { gap: 15 }), () => sres([cc([{ text: 'Te recomiendo el **Día 3**' }]), cc([{ text: ' ahora.' }], 'STOP')], { gap: 60 })];
  const sp = w.coachSend('¿Qué día hago?', null); await sleep(25);
  assert(!d.querySelector('.cm-live') || true);
  let sawLive = false, sawBold = false; for (let i = 0; i < 30 && !sawBold; i++) { await sleep(20); const l = d.querySelector('.cm-live'); if (l) { sawLive = true; if (/<strong>Día 3<\/strong>/.test(l.innerHTML) || /Te recomiendo/.test(l.textContent)) sawBold = true; } }
  assert(sawLive && sawBold, 'mientras llega la respuesta se ve el texto en directo');
  await sp; await sleep(30);
  assert(!d.querySelector('.cm-live'), 'al terminar la burbuja en directo se sustituye por la definitiva');
  assert(/Te recomiendo el Día 3 ahora\./.test(d.querySelector('.cm-bot:last-of-type').textContent) && !/Voy a mirar/.test(d.getElementById('coachMsgs').textContent), 'el preámbulo previo a una herramienta no queda en la respuesta');
  assert(!d.getElementById('coachSend').disabled);

  // e) calentamiento al abrir
  w.coachClose(); fcalls.length = 0; w.eval('_coachWarmAt = 0');
  fscript = [() => ({ ok: true, status: 200, json: async () => ({ ok: true }) }), () => { throw new Error('no debía llamarse otra vez'); }];
  w.coachOpen(); await sleep(30);
  assert.strictEqual(fcalls.length, 1); assert.deepStrictEqual(J(fcalls[0].body), { ping: true }, 'se avisa a la función al abrir el chat');
  w.coachClose(); w.coachOpen(); await sleep(30); assert.strictEqual(fcalls.length, 1, 'y no más de una vez cada 4 minutos');
  w.coachClose(); w.fetch = realFetch; w.eval('COACH_STREAM = false');

  // ---------- 9) Sin sesión no hay botón ----------
  const r2 = await boot(path.join(__dirname, '..', 'index.html'), { logged: false });
  assert(r2.w.document.getElementById('coachFab').hidden, 'sin sesión el botón no aparece');
  r2.w.close(); r.w.close();
  console.log('OK entrenador: herramientas, bucle con Gemini, errores, límites e interfaz');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1); });
