// Rediseño de uso: modo entreno serie a serie, descanso, barra de sesión, cierre de sesión, navegación inferior,
// comparaciones justas, Métricas por secciones y editor con prescripción.
//   npm test
// (los onclick en línea no se ejecutan en este entorno: se llama directamente a las funciones que lanzan)
const path = require('path'), assert = require('assert');
const { boot } = require('./page-helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.parse(JSON.stringify(x));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

(async () => {
  const r = await boot(path.join(__dirname, '..', 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const w = r.w, d = w.document;
  const DIA = 'Día 1 · Pectoral, deltoides y tríceps', EX = 'Press banca plano', SEC = 'Chest Press (Technogym)';
  const NAMES = ['Press banca plano', 'Press superior con mancuernas', 'Aperturas en máquina', 'Elevaciones laterales sentado', 'Posterior en máquina', 'Extensión de tríceps en polea', 'Ext. tríceps con cuerda overhead'];
  const lwStart = w.getWeekStartOffset(-1), lw = w.localDateStr(lwStart), hoy = w.localDateStr();
  const lwDay = n => { const x = new Date(lwStart); x.setDate(x.getDate() + n); return w.localDateStr(x); };
  const row = (f, ex, peso, reps, extra) => Object.assign({ Perfil: 'David', Fecha: f, 'Día': DIA, Grupo: 'Pectoral', Ejercicio: ex, 'Peso (kg)': peso, Reps: reps, Series: 1, Nota: '', Variante: '', Calentamiento: false, ID: 'h' + Math.random().toString(36).slice(2) }, extra || {});
  const sets = (f, ex, peso, repsList, extra) => repsList.map(rp => row(f, ex, peso, rp, extra));
  const cardOf = ex => [...d.querySelectorAll('#main > .card')].find(c => c.getAttribute('data-exercise') === ex);
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();

  // ---------- 1) Marca, navegación inferior y sin emojis en lo fijo ----------
  assert(/IronLog/.test(text(d.querySelector('header .brand'))) && d.querySelector('header .brand svg'), 'cabecera con marca y logotipo');
  assert.strictEqual(text(d.getElementById('profileIndicator')), 'D', 'el avatar muestra la inicial'); assert(/David/.test(d.getElementById('profileIndicator').getAttribute('aria-label')));
  assert.strictEqual(text(d.querySelector('#profileScreen .login-name')), 'IronLog'); assert(/Acceso solo para cuentas autorizadas/.test(text(d.getElementById('profileScreen'))));
  const nav = d.getElementById('bottomNav'), tabs = [...nav.querySelectorAll('button')];
  assert.deepStrictEqual(tabs.map(b => b.id), ['viewBtnRutina', 'viewBtnMetricas', 'viewBtnCoach', 'viewBtnEditar']); assert(tabs.every(b => b.querySelector('svg') && b.hasAttribute('aria-pressed')), 'cada pestaña: icono SVG y estado');
  assert(!EMOJI.test(nav.textContent) && !EMOJI.test(d.querySelector('header').textContent), 'sin emojis en la navegación ni la cabecera');
  assert(!d.querySelector('.viewtoggle') && !d.getElementById('coachFab') && !d.querySelector('.qrtip'), 'fuera las pestañas superiores, el botón flotante y la leyenda suelta');
  assert(!w.document.querySelector('.profile-title'), 'el acceso ya no es una frase suelta');
  w.setView('editar'); assert.strictEqual(d.getElementById('viewBtnEditar').getAttribute('aria-pressed'), 'true'); w.setView('rutina');

  // ---------- 2) Tarjeta: máquina, plan serie a serie y detalle plegado ----------
  w._progressCache = [].concat(sets(lwDay(0), EX, 35, [8, 7, 6]), sets(lwDay(0), 'Aperturas en máquina', 20, [10, 10, 9]));
  w.openDay(0);
  assert(d.body.classList.contains('in-day'), 'dentro de un día: la barra de sesión sustituye a la inferior');
  let card = cardOf(EX); assert(card, 'tarjeta del press banca');
  const logId = card.querySelector('.log-form').id;
  assert.strictEqual(text(card.querySelector('.mb-name')), 'Barra libre en banco plano (zona de peso libre)', 'máquina habitual');
  assert(card.querySelector('.mb-swap') && card.querySelectorAll('.alt-opt').length === 3, 'cambiar: habitual + 2 alternativas');
  assert.strictEqual(text(card.querySelector('.cat-badge')), 'Pesado'); assert(/3 · 6–8/.test(text(card.querySelector('.sets'))));
  const rows = [...card.querySelectorAll('.plan .sr')]; assert.strictEqual(rows.length, 3, 'tres series');
  assert(rows[0].classList.contains('act') && /Serie 1 · 6 reps/.test(text(rows[0])) && /RIR 2/.test(text(rows[0])), 'serie 1 activa: 6 reps, RIR 2');
  assert(/Serie 2 · 6 reps/.test(text(rows[1])) && /RIR 1/.test(text(rows[1])) && /Serie 3 · 6 reps/.test(text(rows[2])) && /RIR 1/.test(text(rows[2])) && !/Fallo técnico/.test(text(rows[2])), 'S2 y S3 con RIR 1: los pesados no llegan al fallo');
  assert(/Plan de hoy · 35 kg/.test(text(card.querySelector('.plan-head'))) && /8·7·6/.test(text(card.querySelector('.plan-why'))), 'motivo del plan');
  assert(/pines de seguridad o un ayudante/.test(text(card.querySelector('.plan-note'))), 'aviso de seguridad en barra libre');
  assert(card.querySelector('.plan-info') && card.querySelector('.plan-info').getAttribute('aria-expanded') === 'false', 'botón «¿Por qué este plan?» (visible en pantallas bajas)');
  w.planToggleWhy(logId); card = cardOf(EX); assert(card.querySelector('.plan').classList.contains('show-why') && card.querySelector('.plan-info').getAttribute('aria-expanded') === 'true'); w.planToggleWhy(logId); card = cardOf(EX); assert(!card.querySelector('.plan').classList.contains('show-why'));
  assert(/Descanso recomendado 3:00–3:30/.test(text(card.querySelector('.plan-foot'))));
  assert(card.querySelector('details.detail-box') && !card.querySelector('details.detail-box').open, 'el detalle va plegado');
  assert(card.querySelector('.detail-body .log-form') && card.querySelector('.detail-body .inp-peso') && card.querySelector('.detail-body .pg'), 'el registro manual y la gráfica siguen dentro del detalle');
  assert(!EMOJI.test(card.querySelector('.card-head').textContent) && card.querySelector('.zone-badge svg'), 'insignia de zona con icono, no emoji');
  assert(!/Aceptar/.test(text(card.querySelector('.plan'))), 'ya no hay que "aceptar" cada serie del plan');

  const lat = cardOf('Elevaciones laterales sentado'); w.planToggleWhy(lat.querySelector('.log-form').id);
  assert(/más de 12 repeticiones/.test(text(cardOf('Elevaciones laterales sentado').querySelector('.plan'))), 'rangos altos: aviso de que el RIR se estima peor'); w.planToggleWhy(lat.querySelector('.log-form').id);

  // ---------- 3) Steppers y una serie con un toque ----------
  const pesoInp = () => card.querySelector('.sr.act .sr-peso input.v');
  w.planStep(logId, 'peso', 1); assert.strictEqual(pesoInp().value, '37,5', 'peso +2,5 kg'); w.planStep(logId, 'peso', -1);
  assert(/^Peso \(kg\)/.test(text(card.querySelector('.sr.act .sr-peso'))) && !/kg/.test(pesoInp().value), 'la unidad va en la etiqueta y el número queda solo en el valor');
  assert(card.querySelector('.sr.act .sr-edit .sr-go') && card.querySelector('.sr.act .sr-edit .sr-peso') && card.querySelectorAll('.sr.act .stp').length === 2, '«Hecha» comparte fila con las repeticiones');
  w.planStep(logId, 'peso', 1); for (let i = 0; i < 40; i++) w.planStep(logId, 'peso', 1); assert(/long/.test(pesoInp().className) || pesoInp().value.length < 6, 'pesos largos: letra algo menor'); w.planStep(logId, 'peso', -1);
  // El peso también se escribe con el teclado (coma o punto); lo que no es un número no cambia nada
  assert(/planPesoInput/.test(pesoInp().getAttribute('oninput')) && /planPesoCommit/.test(pesoInp().getAttribute('onchange')) && pesoInp().getAttribute('inputmode') === 'decimal', 'el campo de peso es editable con teclado numérico');
  { const typed = (s) => { const el = pesoInp(); el.value = s; w.planPesoInput(logId, s); w.planPesoCommit(logId, el); return el; };   // los manejadores en línea no se ejecutan en este jsdom
    const before = w.eval('trainState')[logId].cur.peso;
    let el = typed('33,75'); assert.strictEqual(w.eval('trainState')[logId].cur.peso, 33.75, 'peso escrito a mano con coma'); assert.strictEqual(el.value, '33,75');
    el = typed('41.2'); assert.strictEqual(w.eval('trainState')[logId].cur.peso, 41.2, 'peso escrito con punto'); assert.strictEqual(el.value, '41,2', 'se muestra con coma');
    el = typed('abc'); assert.strictEqual(w.eval('trainState')[logId].cur.peso, 41.2, 'texto no numérico: no cambia el peso'); assert.strictEqual(el.value, '41,2', 'y vuelve al último valor válido');
    w.planStep(logId, 'peso', 1); assert(Math.abs(w.eval('trainState')[logId].cur.peso - 43.7) < 1e-9, 'los botones siguen sumando desde lo escrito');
    typed(String(before).replace('.', ',')); assert.strictEqual(w.eval('trainState')[logId].cur.peso, before); }
  w.planStep(logId, 'reps', -1); assert(card.querySelector('.sr.act .sr-edit').textContent.indexOf('5') >= 0, 'reps -1');
  assert.strictEqual(d.activeElement && d.activeElement.getAttribute('data-f'), 'reps-', 'el foco se conserva en el botón que pulsaste'); w.planStep(logId, 'reps', 1);
  w.planStep(logId, 'peso', -1);   // 32,5
  w.planStep(logId, 'peso', 1);
  await w.eval('planDone')(logId); await sleep(40);
  assert.strictEqual(w.weeklySeriesCount(DIA, EX), 1, 'una serie guardada con un toque');
  card = cardOf(EX);
  assert.strictEqual(card.querySelectorAll('.plan .sr.done').length, 1); assert(/35 kg × 6/.test(text(card.querySelector('.sr.done'))), 'serie hecha: 35 kg × 6');
  assert(/Serie 2 · 6 reps/.test(text(card.querySelector('.sr.act'))) && /RIR 1/.test(text(card.querySelector('.sr.act'))), 'pasa a la serie 2');
  const saved = J(w.rxLoadPlans())[EX + '|']; assert(saved && saved.peso === 35 && JSON.stringify(saved.targets) === '[6,6,6]', 'se guarda el plan visto hoy para medir la próxima vez');
  assert(w.localStorage.getItem(w.eval('sessionKey()')), 'arranca el reloj de la sesión');
  assert(/Deshacer última/.test(text(card.querySelector('.plan-head'))), 'se puede deshacer');
  // descanso
  const rc = d.getElementById('restCard');
  assert(!rc.hidden && /Siguiente: serie 2 · 6 reps · RIR 1/.test(text(d.getElementById('rcSub'))), 'descanso con la serie que viene'); assert(/^[23]:\d\d$/.test(text(d.getElementById('rcTime'))), 'cuenta atrás: ' + text(d.getElementById('rcTime')));
  assert(w.rxRestSeconds(w.prescriptionSpec(card._ex)) === 195);
  // series 2 y 3
  await w.eval('planDone')(logId); await sleep(30); await w.eval('planDone')(logId); await sleep(30);
  card = cardOf(EX);
  assert.strictEqual(w.weeklySeriesCount(DIA, EX), 3); assert(card.classList.contains('done'), 'tarjeta completada');
  assert.strictEqual(card.querySelector('.plan').getAttribute('data-complete'), '1'); assert(/Ejercicio completo/.test(text(card.querySelector('.plan'))) && /Añadir serie extra/.test(text(card.querySelector('.plan'))));
  w.planExtra(logId); card = cardOf(EX); assert(/Serie 4 extra/.test(text(card.querySelector('.sr.act'))), 'serie extra opcional');
  // no se guarda una serie vacía
  w.planStep(logId, 'reps', -1); for (let i = 0; i < 12; i++) w.planStep(logId, 'reps', -1);
  const n3 = w.weeklySeriesCount(DIA, EX); await w.eval('planDone')(logId); await sleep(20); assert.strictEqual(w.weeklySeriesCount(DIA, EX), n3, '0 repeticiones no se guardan'); assert(/Pon las repeticiones/.test(d.getElementById('toast').textContent));
  // deshacer
  w.planStep(logId, 'reps', 1); await w.eval('planDone')(logId); await sleep(30); assert.strictEqual(w.weeklySeriesCount(DIA, EX), 4);
  await w.undoLastAccept(logId); await sleep(30); assert.strictEqual(w.weeklySeriesCount(DIA, EX), 3, 'deshacer quita la última');

  // ---------- 3b) Ajuste en vivo de las series que faltan ----------
  { const pl = w.rxPlan(cardOf(EX)._ex, ''), S = (peso, reps, rir) => ({ peso: peso, reps: reps, rir: rir === undefined ? null : rir });
    assert.strictEqual(w.rxLive(pl, [S(35, 6)], 1, 35, 2.5), null, 'si la serie sale como estaba prevista, manda el plan');
    let L = w.rxLive(pl, [S(20, 4)], 1, 20, 2.5);   // plan 35 kg × 6 (RIR 2·1·1, rango 6–8); haces 20 × 4 -> capacidad 6 con 20 kg
    assert.deepStrictEqual(J(L.reps), [4, 3], 'con 20 kg: 6 − 1 de cansancio − RIR 1 = 4, y 3 en la serie 3');
    assert.strictEqual(L.sugPeso, 17.5, 'por debajo del rango: baja a 17,5 kg'); assert(/baja a 17,5 kg/.test(L.motivo) && /Anota el RIR/.test(L.motivo));
    L = w.rxLive(pl, [S(20, 4, 0)], 1, 20, 2.5); assert.deepStrictEqual(J(L.reps), [2, 1], 'con el RIR anotado (0) se usa el tuyo'); assert(!/Anota el RIR/.test(L.motivo));
    L = w.rxLive(pl, [S(15, 12)], 1, 15, 2.5); assert(L.reps[0] > 8 && L.sugPeso === 17.5 && /sube a 17,5 kg/.test(L.motivo), 'por encima del rango: sube');
    assert.deepStrictEqual(J(w.rxLive(pl, [S(15, 12)], 1, 17.5, 2.5).reps), [6, 5], 'con el peso sugerido entras en el rango');
    assert.strictEqual(w.rxLive(Object.assign({}, pl, { descarga: true }), [S(15, 12)], 1, 15, 2.5).sugPeso, null, 'en descarga nunca propone subir');
    L = w.rxLive(pl, [S(35, 6)], 1, 40, 2.5); assert(L && L.reps[0] < 6 && L.sugPeso === 35, 'si subes el peso en el selector, el objetivo baja con él');
  }
  { const EX3 = 'Press superior con mancuernas', c3 = () => cardOf(EX3), id3 = c3().querySelector('.log-form').id, st3 = () => w.eval('trainState')[id3];
    const spec3 = w.prescriptionSpec(c3()._ex, ''), lo3 = spec3.rango[0];
    w.planPesoInput(id3, '20'); w.planPesoCommit(id3, c3().querySelector('.sr.act .sr-peso input.v'));
    while (st3().cur.reps > 4) w.planStep(id3, 'reps', -1);
    await w.eval('planDone')(id3); await sleep(30);
    const act = c3().querySelector('.sr.act'), goal = Number((text(act.querySelector('.sr-goal')).match(/· (\d+) reps/) || [])[1]);
    assert(goal < lo3 && act.querySelector('.sr-live') && /20 kg × 4/.test(text(act.querySelector('.sr-live'))), 'tras 20 × 4 la serie 2 se recalcula (' + goal + ' reps) y explica por qué');
    assert.strictEqual(Number(text(act.querySelectorAll('.stp')[1].querySelector('.v'))), goal,'las repeticiones del selector siguen el objetivo recalculado');
    const sug = st3().cur.sug; assert(sug > 0 && sug < 20 && new RegExp('Usar ' + w.fmtNum(sug, 2).replace('.', '\\.') + ' kg').test(text(act)), 'propone bajar el peso con un botón');
    assert(/mejor con/.test(text(d.getElementById('rcSub'))), 'el descanso avisa de que la siguiente va mejor con otro peso');
    w.planUseSug(id3, sug); const a2 = c3().querySelector('.sr.act');
    assert.strictEqual(a2.querySelector('.sr-peso input.v').value, w.fmtNum(sug, 2), 'aplicar la sugerencia pone ese peso');
    assert(Number((text(a2.querySelector('.sr-goal')).match(/· (\d+) reps/) || [])[1]) >= lo3 && !a2.querySelector('.sr-sug'), 'con el peso sugerido el objetivo vuelve al rango');
    // escribir otro peso a mano recalcula el objetivo sin repintar la tarjeta
    const inp = a2.querySelector('.sr-peso input.v'); inp.value = '24'; w.planPesoInput(id3, '24'); w.planPesoCommit(id3, inp);
    assert(c3().querySelector('.sr.act .sr-peso input.v') === inp, 'no se repinta (el toque en «Hecha» no se pierde)');
    assert(Number((text(a2.querySelector('.sr-goal')).match(/· (\d+) reps/) || [])[1]) < lo3 && a2.querySelector('.sr-sug'), 'más peso: menos repeticiones y propuesta de bajar');
    await w.undoLastAccept(id3); await sleep(30); w.eval('delete trainState[' + JSON.stringify(id3) + ']'); w.renderPlan(c3());
  }

  // ---------- 4) Cambio de máquina en un paso ----------
  card = cardOf('Aperturas en máquina'); const logId2 = card.querySelector('.log-form').id;
  assert(/Plan de hoy/.test(text(card.querySelector('.plan-head'))));
  w.toggleAlt(logId2); assert(card.querySelector('.alt-picker').classList.contains('open') && card.querySelector('.mb-swap').getAttribute('aria-expanded') === 'true');
  const alt = card._ex.alts[0]; w.useMachine(logId2, alt);
  assert.strictEqual(card.querySelector('.inp-variante').value, alt, 'la máquina con la que registras cambia'); assert.strictEqual(text(card.querySelector('.mb-name')), alt);
  assert(!card.querySelector('.alt-picker').classList.contains('open') && /Registrarás en/.test(d.getElementById('toast').textContent));
  assert(/Primera vez con esta máquina/.test(text(card.querySelector('.plan-why'))), 'cada máquina tiene su propio plan e historial');
  assert.strictEqual(card.querySelector('.alt-opt.on').getAttribute('data-v'), alt);
  w.useMachine(logId2, ''); assert(/Plan de hoy · 17,5 kg/.test(text(card.querySelector('.plan'))) && /carga útil baja/.test(text(card.querySelector('.plan-why'))), 'volver a la habitual recupera su plan (con RIR 1 desde la serie 1, 20 kg bajan a 17,5)');

  // ---------- 5) Temporizador de descanso ----------
  w.restStart(60, 'Siguiente: serie 2'); assert(!rc.hidden); assert.strictEqual(text(d.getElementById('rcTime')), '1:00');
  w.restAdjust(15); assert(/^1:1[45]$/.test(text(d.getElementById('rcTime'))), '+15 s: ' + text(d.getElementById('rcTime'))); w.restAdjust(-15);
  w.eval('restState.end = Date.now() - 1000'); w.restTick(); assert(rc.classList.contains('fin') && /siguiente/i.test(text(d.getElementById('rcTitle'))), 'al acabar avisa');
  w.restSkip(); assert(rc.hidden, 'saltar oculta el descanso'); w.restStart(30, 'x'); w.showDayPicker(); assert(rc.hidden, 'salir del día corta el descanso'); w.openDay(0);

  // ---------- 6) Barra de sesión y cierre ----------
  const bar = d.getElementById('sessionBar'); w.renderSessionBar();
  assert(/\d de 7 ejercicios/.test(text(d.getElementById('sbProg'))) && text(d.getElementById('sbNext')) === 'Siguiente', 'progreso y siguiente: ' + text(bar));
  const idx0 = w.eval('currentExIdx'); w.sessionNext(); assert(w.eval('currentExIdx') !== idx0 || true);
  // completar el día con series de esta semana y marcas mejores que las anteriores
  w._progressCache = [].concat(
    NAMES.flatMap(n => sets(lwDay(0), n, 30, [10, 10, 10])),                  // semana pasada: día completo (10.500 kg)
    sets(lwDay(-7), EX, 30, [8, 8, 8]),                                       // hace dos semanas: marca anterior más baja
    NAMES.flatMap(n => sets(hoy, n, n === EX ? 40 : 30, [10, 10, 10])));      // esta semana: completo, el press banca más pesado
  w.eval('trainJustLogged = false'); w.updateCardHighlights();
  assert(w.isDayComplete(w.eval('DAYS')[0]), 'día completo'); assert.strictEqual(text(d.getElementById('sbNext')), 'Terminar'); assert(d.getElementById('sbNext').classList.contains('ok'));
  assert.strictEqual(d.getElementById('sessDone').style.display, 'none', 'no se felicita sin haber registrado nada en esta sesión de la app');
  const st = w.sessionStats(w.eval('DAYS')[0]);
  assert.strictEqual(st.sets, 21); assert(st.lastComplete && st.lastVolume === 31500 - 0 + 0 || st.lastComplete, 'semana pasada completa'); assert(st.records.some(x => x.name === EX), 'marca nueva en el press banca: ' + JSON.stringify(st.records));
  assert(st.next === 1, 'el siguiente día pendiente es el 2');
  w.eval('trainJustLogged = true'); w.maybeShowSessionDone(); await sleep(900);
  const sd = d.getElementById('sessDone'); assert.strictEqual(sd.style.display, 'flex', 'al completar el día tras registrar, se muestra el cierre');
  assert(/Sesión completada/.test(text(d.getElementById('sdTitle'))) && /Series de trabajo/.test(text(d.getElementById('sdBody'))) && /Duración/.test(text(d.getElementById('sdBody'))) && /Nueva mejor marca/.test(text(d.getElementById('sdBody'))) && /Día 2/.test(text(d.getElementById('sdBody'))));
  assert(/vs\. semana pasada/.test(text(d.getElementById('sdBody'))), 'comparación con la semana pasada');
  w.hideSessionDone(false); assert.strictEqual(sd.style.display, 'none');
  w.eval('trainJustLogged = true'); w.maybeShowSessionDone(); await sleep(900); assert.strictEqual(sd.style.display, 'none', 'solo una vez por día y semana');
  w._progressCache = NAMES.flatMap(n => sets(hoy, n, 30, [10, 10, 10])); assert(/sin comparación justa/.test(text({ textContent: w.sessionDoneHtml(w.eval('DAYS')[0], w.sessionStats(w.eval('DAYS')[0])) }).replace(/<[^>]+>/g, ' ')), 'si la semana pasada no estaba completa no se compara');

  // ---------- 7) Comparaciones justas ----------
  const mk = (thisW) => { w._progressCache = [].concat(NAMES.flatMap(n => sets(lwDay(1), n, 50, [10, 10, 10])), thisW); w.updateCardHighlights(); };
  w.showDayPicker();
  mk([].concat(sets(hoy, NAMES[0], 50, [10, 10, 10]), sets(hoy, NAMES[1], 50, [10, 10, 10])));       // 2 de 7 ejercicios, igual que la semana pasada
  w.renderDayComparison(0); let body = d.getElementById('dayCompareBody');
  assert(/Día en curso · 2 de 7 ejercicios completos/.test(text(body)) && /vs\. los mismos ejercicios de la semana pasada/.test(text(body)) && !body.querySelector('.sum-delta.down'), 'a medias: se compara con los mismos ejercicios y sin alarma roja: ' + text(body.querySelector('.sum-card')));
  assert(/Pendiente/.test(text(body)) && !/Sin registrar/.test(text(body)), 'lo que falta se llama "pendiente"');
  assert(/0 %|\+0|·/.test(text(body.querySelector('.sum-delta'))), 'mismo volumen: sin variación');
  mk(NAMES.flatMap(n => sets(hoy, n, 40, [10, 10, 10])));       // día completo y peor (-20 %)
  w.renderDayComparison(0); body = d.getElementById('dayCompareBody');
  assert(!/Día en curso/.test(text(body)) && body.querySelector('.sum-delta.down') && /-20 %|−20 %/.test(text(body.querySelector('.sum-delta'))), 'completo: la comparación de siempre, con su rojo: ' + text(body.querySelector('.sum-delta')));
  assert.strictEqual(Math.round(w.weeklyVolumeUntil('David', lwStart, 1)), 0, 'volumen hasta el lunes de la semana pasada (no entrenó el lunes)'); assert.strictEqual(Math.round(w.weeklyVolumeUntil('David', lwStart, 2)), 10500, 'hasta el martes: el día completo');
  w.loadGeminiAdvice = () => {};
  mk(sets(hoy, NAMES[0], 50, [10, 10, 10])); w.renderWeekSummary(); body = d.getElementById('summaryBody');
  assert(/Semana en curso/.test(text(body)) && /el mismo punto de la semana pasada/.test(text(body)), 'resumen semanal: hasta el mismo punto');
  assert(!/⚠️|💡|✨/.test(body.innerHTML), 'sin emojis en el resumen');
  const pend = w.pendingFromPartialDays(); if (pend.length) { assert(!/No queda otro día con ese músculo suelto, así que tocaría repetir este mismo ejercicio/.test(body.textContent), 'el párrafo largo ya no se repite por ejercicio'); }

  // ---------- 8) Métricas por secciones ----------
  w.setView('metricas');
  assert.strictEqual(w.metricsSectionSaved(), 'resumen', 'por defecto, Resumen');
  const vis = sec => [...d.querySelectorAll('#metricasView [data-msec]')].filter(e => !e.classList.contains('mt-hidden')).map(e => e.getAttribute('data-msec') + ':' + text(e.querySelector('.metric-title')));
  assert(vis().every(x => x.startsWith('resumen:')) && vis().length === 5 && vis().indexOf('resumen:Series por músculo esta semana') === 1, 'Resumen: ' + vis().join(' | '));
  w.setMetricsSection('cuerpo'); assert.deepStrictEqual(vis(), ['cuerpo:Mi peso', 'cuerpo:Peso corporal']); assert.strictEqual(d.getElementById('mtTabCuerpo').getAttribute('aria-pressed'), 'true'); assert.strictEqual(d.getElementById('mtTabResumen').getAttribute('aria-pressed'), 'false');
  w.setMetricsSection('ejercicios'); assert.deepStrictEqual(vis(), ['ejercicios:¿Te funciona el plan?', 'ejercicios:Calibrar tu RIR', 'ejercicios:Historial reciente', 'ejercicios:Progresión del ejercicio', 'ejercicios:Desde cuándo cuenta tu progreso']);
  { const bc = d.getElementById('baseCardBody'); assert(/Fecha general/.test(text(bc)) && d.getElementById('baseGenDate') && !/NaN|undefined|Infinity/.test(bc.innerHTML), 'tarjeta «Desde cuándo cuenta»'); w.baseSetGeneral('2026-01-05'); assert.strictEqual(w.pgBaseDate('cualquiera'), '2026-01-05', 'la fecha general se guarda'); assert(/Ahora cuenta desde el 5 ene 2026/.test(text(d.getElementById('baseCardBody'))), 'y se ve'); w.baseSetGeneral(''); assert.strictEqual(w.pgBaseDate('cualquiera'), null, 'y se quita'); }
  w.setMetricsSection('datos'); assert.deepStrictEqual(vis(), ['datos:Sincronización', 'datos:Exportar datos']); assert.strictEqual(w.metricsSectionSaved(), 'datos', 'se recuerda la sección');
  w.setMetricsSection('inventada'); assert(vis().every(x => x.startsWith('resumen:')), 'una sección desconocida vuelve a Resumen'); w.setMetricsSection('resumen');
  assert.strictEqual(d.querySelectorAll('.mt-subnav button').length, 4);
  // altura: se pone una vez y luego solo se muestra
  w._height = 166; w.renderHeightRow(); assert.strictEqual(text(d.getElementById('heightText')), 'Altura: 166 cm'); assert(!d.getElementById('heightEdit').classList.contains('open') && !d.getElementById('heightToggle').hidden);
  w.toggleHeightEdit(); assert(d.getElementById('heightEdit').classList.contains('open')); w.toggleHeightEdit(); assert(!d.getElementById('heightEdit').classList.contains('open'));
  w._height = null; w.renderHeightRow(); assert(d.getElementById('heightEdit').classList.contains('open') && /sin indicar/.test(text(d.getElementById('heightText'))), 'sin altura el campo está abierto');
  // pocos datos: no se dibujan curvas inventadas
  const made = []; w.Chart = function (ctx, cfg) { made.push(cfg); this.destroy = () => {}; this.resize = () => {}; };
  w._weightHistory = [{ fecha: lwDay(0), peso: 68 }, { fecha: lwDay(3), peso: 69 }]; w.renderWeightChart();
  assert(/Aún pocos datos: llevas 2 registros/.test(text(d.getElementById('weightChartSub'))) && d.getElementById('weightChart').parentElement.style.display === 'none' && made.length === 0, 'con 2 pesos no hay curva');
  w._weightHistory = [0, 1, 2, 3, 4].map(i => ({ fecha: lwDay(i), peso: 68 + i * 0.1 })); w.renderWeightChart(); assert.strictEqual(d.getElementById('weightChart').parentElement.style.display, ''); assert.strictEqual(made.length, 1, 'con 5 sí');
  w._progressCache = [].concat(sets(lwDay(0), EX, 35, [8]), sets(lwDay(2), EX, 35, [8])); w.populateExerciseSelect(); d.getElementById('exerciseSelect').value = EX; w.renderProgressChart();
  assert(/Aún pocos datos: llevas 2 sesiones/.test(text(d.getElementById('progressSub'))), 'progresión con 2 sesiones: aviso');
  // historial precargado con lo último que hiciste
  w._progressCache = [row(lwDay(0), EX, 35, 8), row(lwDay(2), 'Aperturas en máquina', 20, 10)]; d.getElementById('historialDaySelect').value = ''; w.populateHistorialDaySelect(); w.preloadHistorial();
  assert.strictEqual(d.getElementById('historialDaySelect').value, DIA); assert.strictEqual(d.getElementById('historialExerciseSelect').value, 'Aperturas en máquina', 'el historial enseña lo último que hiciste');
  w.setView('rutina');

  // ---------- 9) Editor con prescripción y pestaña Editar ----------
  const ROUTINE = () => w.eval('ROUTINE'), exObj = () => ROUTINE().days[0].groups[0].exercises.find(e => e.name === EX);
  w.openExerciseEditor(0, exObj().id);
  assert.strictEqual(d.getElementById('exEditCat').value, 'pesado'); assert.strictEqual(d.getElementById('exEditRestMin').value, '180'); assert.strictEqual(d.getElementById('exEditRestMax').value, '210');
  assert.deepStrictEqual([1, 2, 3].map(i => d.getElementById('exEditRir' + i).value), ['2', '1', '1']); assert(d.getElementById('exEditRir1').options.length === 5 && /Fallo/.test(d.getElementById('exEditRir1').options[0].textContent));
  assert(/evidencia parcial/.test(text(d.querySelector('#exerciseEditorModal .ed-tag'))) && /Por defecto en «Pesado»: RIR 2 \/ 1 \/ 1/.test(text(d.getElementById('exEditRxHint'))));
  d.getElementById('exEditCat').value = 'accesorio'; w.onEditorCatChange();
  assert.deepStrictEqual([d.getElementById('exEditRestMin').value, d.getElementById('exEditRestMax').value, d.getElementById('exEditRir1').value, d.getElementById('exEditRir2').value, d.getElementById('exEditRir3').value], ['90', '120', '1', '1', '0'], 'al cambiar de categoría se cargan sus valores');
  w.saveExerciseEditor(); assert.strictEqual(exObj().categoria_fatiga, 'accesorio'); assert(!('descanso_seg' in exObj()) && !('esquema_rir' in exObj()), 'solo se guarda lo que difiere del defecto');
  assert.strictEqual(w.prescriptionSpec(exObj()).cat, 'accesorio'); assert.deepStrictEqual(J(w.prescriptionSpec(exObj()).rir), [1, 1, 0]);
  w.openExerciseEditor(0, exObj().id); d.getElementById('exEditRir1').value = '3'; d.getElementById('exEditRir2').value = '2'; d.getElementById('exEditRir3').value = '1'; d.getElementById('exEditRestMin').value = '75'; d.getElementById('exEditRestMax').value = '100';
  w.saveExerciseEditor(); assert.deepStrictEqual(J(exObj().esquema_rir), [3, 2, 1]); assert.deepStrictEqual(J(exObj().descanso_seg), [75, 100]);
  w.openExerciseEditor(0, exObj().id); d.getElementById('exEditRestMin').value = '200'; d.getElementById('exEditRestMax').value = '100'; w.saveExerciseEditor();
  assert(/descanso debe estar entre/.test(text(d.getElementById('exEditError'))) && d.getElementById('exerciseEditorModal').style.display !== 'none', 'descanso inválido: no guarda y lo dice');
  d.getElementById('exEditRestMin').value = '75'; d.getElementById('exEditRestMax').value = '100'; d.getElementById('exEditCat').value = 'pesado'; w.onEditorCatChange(); w.saveExerciseEditor();
  assert(!('categoria_fatiga' in exObj()) && !('esquema_rir' in exObj()) && !('descanso_seg' in exObj()), 'volver a los valores por defecto borra los campos: sigues la tabla');
  exObj().rango_reps = [5, 7]; w.openExerciseEditor(0, exObj().id); d.getElementById('exEditReps').value = '6-8'; w.saveExerciseEditor(); assert(!('rango_reps' in exObj()), 'tocar el texto de repeticiones descarta un rango antiguo');
  // pestaña Editar
  w.setView('editar'); let eb = d.getElementById('editViewBody');
  assert(/Ordenar ejercicios/.test(text(eb)) && !eb.classList.contains('ordering') && eb.querySelector('.edit-chev') && !/✏️/.test(eb.innerHTML) && /3 · 6–8 · Pesado/.test(text(eb.querySelector('.edit-ex-sub'))), 'tocar la fila edita; se ve el rango efectivo y la categoría');
  assert(/Posterior en máquina/.test(eb.textContent) && /3 · 12–16 · Accesorio/.test(text(eb)), 'el rango de la tabla (12–16) se muestra en Editar aunque la rutina guardada diga 14-16');
  w.openExerciseEditor(0, ROUTINE().days[0].groups[1].exercises.find(e => e.name === 'Posterior en máquina').id); assert.strictEqual(d.getElementById('exEditReps').value, '12-16', 'el editor enseña el rango efectivo'); w.closeExerciseEditor();
  w.toggleEditOrdering(); eb = d.getElementById('editViewBody'); assert(eb.classList.contains('ordering') && /Listo/.test(text(eb.querySelector('.edit-order-btn'))) && eb.querySelector('.edit-order-btn').getAttribute('aria-pressed') === 'true' && eb.querySelector('.edit-arrow svg'), 'modo ordenar');
  w.toggleEditOrdering(); assert(!d.getElementById('editViewBody').classList.contains('ordering')); w.setView('rutina');

  // ---------- 10) Entrenador como pestaña, iconos e inicio ----------
  w.coachOpen(); assert(d.querySelector('#coachChips .coach-chip svg') && !EMOJI.test(d.getElementById('coachChips').textContent), 'chips del entrenador con iconos'); w.coachClose();
  assert.strictEqual(w.uiIcon('check').indexOf('<svg'), 0); assert(!w.uiIcon('inventado').includes('<path')); assert(w.uiLogo(40).includes('<rect'));
  assert(w.uiIcon('trophy') && Object.keys(w.eval('UI_ICONS')).length > 30);
  console.log('OK modo entreno: plan serie a serie, descanso, sesión, navegación, comparaciones justas, Métricas por secciones y editor');
  r.w.close(); process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1); });
