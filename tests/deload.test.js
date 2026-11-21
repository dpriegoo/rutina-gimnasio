// Semana de descarga (js/deload.js): estado, efectos en el plan y en el umbral de «completo», y la PROPUESTA de cuándo
// hacerla a partir de los datos (rendimiento a la baja, plan incumplido, semanas seguidas), siempre con motivo y sin activarse sola.
//   npm test
const path = require('path'), assert = require('assert');
const { boot } = require('./page-helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.parse(JSON.stringify(x));

(async () => {
  const r = await boot(path.join(__dirname, '..', 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const w = r.w, d = w.document, ls = w.localStorage;
  const DIA = 'Día 1 · Pectoral, deltoides y tríceps', EX = 'Press banca plano';
  const NAMES = ['Press banca plano', 'Press superior con mancuernas', 'Aperturas en máquina', 'Elevaciones laterales sentado', 'Posterior en máquina', 'Extensión de tríceps en polea', 'Ext. tríceps con cuerda overhead'];
  const hoy = w.localDateStr(), add = (s, n) => w.eval('deloadAddDays')(s, n);
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();
  const row = (f, ex, peso, reps, extra) => Object.assign({ Perfil: 'David', Fecha: f, 'Día': DIA, Grupo: 'X', Ejercicio: ex, 'Peso (kg)': peso, Reps: reps, Series: 1, Nota: '', Variante: '', Calentamiento: false, ID: 'r' + Math.random().toString(36).slice(2) }, extra || {});
  const sets = (f, ex, peso, repsList) => repsList.map(rp => row(f, ex, peso, rp));
  const reset = () => { ls.removeItem('deloadList_David'); ls.removeItem('deloadSnooze_David'); ls.removeItem('rxPlans_David'); w._progressCache = []; };
  // 10 semanas de datos: 2 días por semana, 4 ejercicios, 3 series; weight(k) = carga de la semana k (0 = esta, -1 = la pasada…)
  const build = (weeks, weight, names) => {
    const out = [];
    for (let k = -weeks; k <= 0; k++) {
      const a = w.localDateStr(w.getWeekStartOffset(k));
      [0, 2].forEach(off => { const f = add(a, off); if (f > hoy) return; (names || NAMES.slice(0, 4)).forEach(n => out.push(...sets(f, n, weight(k), [8, 8, 8]))); });
    }
    return out;
  };

  // ---------- 1) Estado y umbral de «completo» ----------
  reset();
  assert.strictEqual(w.weeklyTarget(), 3); assert(!w.deloadActive() && !w.deloadCurrent());
  w.deloadStart();
  assert(w.deloadActive()); const cur = J(w.deloadCurrent()); assert.strictEqual(cur.start, hoy); assert.strictEqual(cur.end, add(hoy, 6), 'dura 7 días');
  assert.strictEqual(w.weeklyTarget(), 2, 'en descarga, 2 series por ejercicio cuentan como completo'); assert(w.deloadOn(hoy) && w.deloadOn(add(hoy, 6)) && !w.deloadOn(add(hoy, 7)) && !w.deloadOn(add(hoy, -1)));
  w.deloadStart(); assert.strictEqual(J(w.deloadList()).length, 1, 'no se puede empezar otra con una activa');
  w.deloadStop(); assert(!w.deloadActive() && J(w.deloadList()).length === 0, 'terminar el mismo día de empezar la borra'); assert.strictEqual(w.weeklyTarget(), 3);
  ls.setItem('deloadList_David', JSON.stringify([{ start: add(hoy, -10), end: add(hoy, -4) }, { start: add(hoy, -1), end: add(hoy, 5) }]));
  w.deloadStop(); const l2 = J(w.deloadList()); assert.strictEqual(l2.length, 2); assert.strictEqual(l2[1].end, add(hoy, -1), 'terminar ya la deja acabada ayer'); assert(!w.deloadActive() && w.deloadOn(add(hoy, -5)), 'las pasadas se recuerdan');
  assert.strictEqual(w.weeklyTargetFor(parseWeek(add(hoy, -9))), 2, 'una semana con 4 o más días de descarga cuenta como de descarga'); assert.strictEqual(w.weeklyTargetFor(w.getWeekStartOffset(-5)), 3);
  function parseWeek(s) { return w.parseLocalDate(w.localDateStr(w.mondayOf(w.parseLocalDate(s)))); }
  ls.setItem('deloadList_David', '{"roto"'); assert.deepStrictEqual(J(w.deloadList()), [], 'un estado corrupto no rompe nada'); reset();

  // ---------- 2) El plan en descarga ----------
  const press = { name: EX, sets: '3 · 6-8', icon: 'barbellBench', primary: 'Barra libre en banco plano', alts: [] };
  const plan = () => J(w.rxPlan(press, ''));
  w._progressCache = sets(add(hoy, -6), EX, 35, [8, 7, 6]);
  let p = plan(); assert.strictEqual(p.sets.length, 3); assert.deepStrictEqual(p.sets.map(x => x.rir), [2, 1, 1]); assert.strictEqual(p.peso, 35);
  w.deloadStart(); p = plan();
  assert.strictEqual(p.sets.length, 2, 'dos series'); assert.deepStrictEqual(p.sets.map(x => x.rir), [3, 2], 'un RIR más'); assert.deepStrictEqual(p.sets.map(x => x.reps), [6, 6]); assert.strictEqual(p.peso, 35, 'la misma carga'); assert(p.descarga && /^Semana de descarga: 2 series con la carga de siempre y un RIR más\./.test(p.motivo));
  // si tocaba subir carga, en descarga no se sube
  reset(); w._progressCache = sets(add(hoy, -6), EX, 35, [8, 8, 8]); assert.strictEqual(plan().peso, 37.5, 'sin descarga sí sube');
  w.deloadStart(); p = plan(); assert.strictEqual(p.peso, 35, 'en descarga se queda en la carga anterior'); assert.strictEqual(p.cambioCarga, 0); assert.deepStrictEqual(p.sets.map(x => x.reps), [7, 7]); assert(/No se sube carga durante la descarga/.test(p.motivo));
  // las sesiones de una descarga no cuentan para el plan de después
  reset(); ls.setItem('deloadList_David', JSON.stringify([{ start: add(hoy, -4), end: add(hoy, 2) }]));
  w._progressCache = [].concat(sets(add(hoy, -10), EX, 35, [8, 7, 6]), sets(add(hoy, -3), EX, 30, [10, 10]));
  assert.strictEqual(w.rxSessions(EX, '').length, 1, 'la sesión hecha en descarga no entra en el historial del plan'); assert.strictEqual(w.rxSessions(EX, '')[0].sets[0].peso, 35);
  ls.setItem('deloadList_David', JSON.stringify([{ start: add(hoy, -4), end: add(hoy, -1) }])); assert.strictEqual(plan().peso, 35, 'terminada la descarga, el plan sigue del último entreno normal');
  reset();

  // ---------- 3) La tarjeta del ejercicio y el día en descarga ----------
  const lwStart = w.localDateStr(w.getWeekStartOffset(-1));
  w._progressCache = sets(add(hoy, -6), EX, 35, [8, 7, 6]);
  w.deloadStart(); w.openDay(0);
  assert(d.getElementById('dayScreen').classList.contains('deload-on'), 'el día lleva la marca de descarga');
  let card = [...d.querySelectorAll('#main > .card')].find(c => c.getAttribute('data-exercise') === EX), logId = card.querySelector('.log-form').id;
  assert.strictEqual(card.querySelectorAll('.plan .sr').length, 2, 'la tarjeta muestra 2 series'); assert(/RIR 3/.test(text(card.querySelector('.sr.act'))) && /Semana de descarga/.test(text(card.querySelector('.plan-why'))));
  assert(/^2 · 6–8/.test(text(card.querySelector('.sets'))) && /0\/2 esta semana/.test(text(card.querySelector('.series-progress'))), 'el objetivo semanal pasa a 2');
  await w.eval('planDone')(logId); await sleep(30); await w.eval('planDone')(logId); await sleep(30);
  card = [...d.querySelectorAll('#main > .card')].find(c => c.getAttribute('data-exercise') === EX);
  assert.strictEqual(w.weeklySeriesCount(DIA, EX), 2); assert(card.classList.contains('done'), 'con 2 series la tarjeta ya está completa'); assert.strictEqual(card.querySelector('.plan').getAttribute('data-complete'), '1'); assert(/2\/2 esta semana/.test(text(card.querySelector('.series-progress'))));
  assert(!(J(w.rxLoadPlans())[EX + '|']), 'en descarga no se guarda el plan: el normal sigue donde estaba');
  assert(/semana de descarga/.test(text({ textContent: w.sessionDoneHtml(w.eval('DAYS')[0], w.sessionStats(w.eval('DAYS')[0])).replace(/<[^>]+>/g, ' ') })), 'el cierre de sesión no compara el volumen');
  // el día completo con 2 series por ejercicio
  w._progressCache = NAMES.flatMap(n => sets(hoy, n, 30, [10, 10])); w.updateCardHighlights();
  assert(w.isDayComplete(w.eval('DAYS')[0]), 'en descarga, 2 series por ejercicio completan el día'); w.deloadStop(); assert(!w.isDayComplete(w.eval('DAYS')[0]), 'sin descarga hacen falta 3');
  assert(!d.getElementById('dayScreen').classList.contains('deload-on'), 'al terminar, el día vuelve a la normalidad'); w.showDayPicker(); reset();

  // ---------- 4) Avisos y comparaciones en descarga ----------
  w.loadGeminiAdvice = () => {}; w._progressCache = [].concat(NAMES.flatMap(n => sets(add(lwStart, 1), n, 50, [10, 10, 10])), sets(hoy, NAMES[0], 50, [10, 10]));
  w.renderWeekSummary(); assert(!/Semana de descarga/.test(text(d.getElementById('summaryBody'))));
  w.deloadStart(); w.renderWeekSummary(); assert(/Semana de descarga: el volumen baja a propósito \(2 series por ejercicio\)/.test(text(d.getElementById('summaryBody'))) && !/vs\. el mismo punto/.test(text(d.getElementById('summaryBody'))), 'el resumen no compara el volumen');
  w.renderDayComparison(0); assert(/Semana de descarga: el volumen baja a propósito/.test(text(d.getElementById('dayCompareBody'))));
  w.renderPriorityBanner(); assert.strictEqual(d.getElementById('priorityBanner').style.display, 'none', 'sin avisos de prioridad muscular en descarga');
  // exportación: las semanas de descarga van marcadas
  const sem = J(w.exportCollect({ from: lwStart, to: hoy, warmups: true, body: false }).semanal); assert(sem.some(x => x.descarga === true), 'la semana de descarga va marcada: ' + JSON.stringify(sem));
  assert(/\| Descarga \|/.test(w.exportSerialize(w.exportCollect({ from: lwStart, to: hoy, warmups: true, body: false }), 'md', true)) && /descarga» = true/.test(w.exportSerialize(w.exportCollect({ from: lwStart, to: hoy, warmups: true, body: false }), 'md', true)));
  // el entrenador lo sabe
  let ctx = w.coachRunTool('get_context', {}); ctx = J(ctx.result || ctx); assert(/activa hasta/.test(ctx.semana_de_descarga), 'get_context: ' + ctx.semana_de_descarga);
  reset();

  // ---------- 5) La propuesta: cuándo ----------
  const sug = () => J(w.deloadSuggestion());
  w._progressCache = build(9, () => 35); assert.strictEqual(w.deloadPerformance().ratio > 0.99 && w.deloadPerformance().ratio < 1.01, true, 'datos estables: ratio ≈ 1');
  // 9 semanas seguidas con 2 días: aviso suave por semanas, no por rendimiento
  let s = sug(); assert(s && s.soft === true && s.reasons.length === 1 && /Llevas 9 semanas seguidas entrenando sin una descarga/.test(s.reasons[0]), 'solo semanas seguidas: aviso suave: ' + JSON.stringify(s));
  w._progressCache = build(5, () => 35); assert.strictEqual(w.deloadSuggestion(), null, 'con datos estables y pocas semanas no se propone nada');
  assert.strictEqual(w.deloadWeeksSince(), 5);
  // rendimiento a la baja en las 2 últimas semanas
  w._progressCache = build(7, k => k >= -1 ? 33 : 35); s = sug();
  assert(s && s.soft === false && /Tu fuerza estimada de las últimas 2 semanas está un \d+ % por debajo de tu media de las 6 anteriores \(4 ejercicios\)/.test(s.reasons[0]), 'rendimiento a la baja: ' + JSON.stringify(s));
  const perf = w.deloadPerformance(); assert(perf.ratio < 0.97 && perf.n === 4);
  w._progressCache = build(7, k => k >= -1 ? 34.5 : 35); assert.strictEqual(w.deloadSuggestion(), null, 'una caída del 1,4 % es ruido, no una señal');
  w._progressCache = build(7, k => k >= -1 ? 33 : 35, NAMES.slice(0, 2)); assert.strictEqual(w.deloadSuggestion(), null, 'con menos de 3 ejercicios con datos no se fía de la señal');
  // plan incumplido
  ls.setItem('rxPlans_David', JSON.stringify(Object.fromEntries(NAMES.slice(0, 3).map(n => [n + '|', { fecha: add(hoy, -2), peso: 35, targets: [8, 8, 8], rir: [2, 1, 1] }]))));
  w._progressCache = NAMES.slice(0, 3).flatMap(n => sets(add(hoy, -2), n, 35, [5, 5, 5])); const a = J(w.deloadAdherence()); assert.deepStrictEqual(a, { planned: 9, met: 0 });
  s = sug(); assert(s && !s.soft && /Solo cumpliste 0 de 9 series del plan en los últimos 14 días/.test(s.reasons.join(' ')), 'plan incumplido: ' + JSON.stringify(s));
  w._progressCache = NAMES.slice(0, 3).flatMap(n => sets(add(hoy, -2), n, 35, [8, 8, 8])); assert.strictEqual(w.deloadSuggestion(), null, 'si cumples el plan, nada');
  w._progressCache = NAMES.slice(0, 2).flatMap(n => sets(add(hoy, -2), n, 35, [5, 5, 5])); assert.strictEqual(w.deloadSuggestion(), null, 'con menos de 9 series del plan no se valora');
  ls.removeItem('rxPlans_David');
  // una descarga reciente reinicia la cuenta de semanas y la comparación no usa semanas de descarga
  w._progressCache = build(9, () => 35); ls.setItem('deloadList_David', JSON.stringify([{ start: lwStart, end: add(lwStart, 6) }])); assert.strictEqual(w.deloadWeeksSince(), 0, 'la semana pasada fue de descarga: cuenta desde cero'); assert.strictEqual(w.deloadSuggestion(), null); reset();
  // posponer, y activa = sin propuesta
  w._progressCache = build(9, () => 35); assert(w.deloadSuggestion());
  w.deloadSnooze(); assert.strictEqual(w.deloadSuggestion(), null, 'tras «Ahora no» no vuelve a salir en 7 días'); assert.strictEqual(ls.getItem('deloadSnooze_David'), add(hoy, 7));
  ls.setItem('deloadSnooze_David', add(hoy, -1)); assert(w.deloadSuggestion(), 'pasado el aplazamiento, vuelve');
  assert.strictEqual(w.deloadSuggestion(), w.deloadSuggestion(), 'el resultado se reutiliza mientras los datos no cambian (el selector se repinta mucho)');
  w._progressCache = build(5, () => 35); assert.strictEqual(w.deloadSuggestion(), null, 'cambian los datos: se recalcula'); w._progressCache = build(9, () => 35);
  w.deloadStart(); assert.strictEqual(w.deloadSuggestion(), null, 'en descarga no se propone otra'); reset();

  // ---------- 6) La tarjeta del selector ----------
  const card2 = () => d.getElementById('deloadCard');
  w.renderDeloadCard(); assert(/Programar una semana de descarga/.test(text(card2())) && card2().classList.contains('dl-none'), 'sin motivo: un enlace discreto');
  w.deloadToggleManual(); assert(/2 series por ejercicio \(en vez de 3\), la carga de siempre y un RIR más/.test(text(card2())) && /Empezar descarga/.test(text(card2())) && /Cancelar/.test(text(card2())), 'manual: explica qué es y deja empezar o cancelar');
  w.deloadToggleManual(); assert(/Programar/.test(text(card2())));
  w._progressCache = build(7, k => k >= -1 ? 33 : 35); w.renderDeloadCard();
  assert(card2().classList.contains('dl-sug') && /Te sugiero una semana de descarga/.test(text(card2())) && /por debajo de tu media/.test(text(card2())) && /No hay un criterio validado sobre cuándo descargar/.test(text(card2())) && /Ahora no/.test(text(card2())), 'propuesta con motivo y la advertencia: ' + text(card2()));
  assert(!w.deloadActive(), 'proponer no activa nada');
  w._progressCache = build(9, () => 35); w.renderDeloadCard(); assert(card2().classList.contains('dl-soft') && /Podrías descargar esta semana/.test(text(card2())) && !/Llevas 9 semanas/.test(text(card2())) && card2().querySelector('.dl-line'), 'solo por semanas: tono suave y plegado en una línea');
  w.deloadExpand(); assert(/Llevas 9 semanas seguidas/.test(text(card2())) && /Empezar descarga/.test(text(card2())) && /Ahora no/.test(text(card2())), 'al pulsar, se despliega con el motivo y los botones');
  assert(card2().querySelector('details.dl-more') && /Qué incluye una descarga/.test(text(card2())), 'la explicación larga va tras un desplegable');
  w.deloadStart(); assert(card2().classList.contains('dl-on') && /Semana de descarga activa/.test(text(card2())) && new RegExp('Hasta el ' + add(hoy, 6).slice(8, 10) + '/' + add(hoy, 6).slice(5, 7)).test(text(card2())) && /Terminar ya/.test(text(card2())), 'activa: hasta cuándo y cómo terminarla');
  w.deloadStop(); assert(!w.deloadActive() && !/activa/.test(text(card2())));
  assert(d.getElementById('deloadCard') && [...card2().querySelectorAll('button')].every(b => b.getAttribute('type') === 'button'), 'botones de verdad');
  assert(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(card2().textContent), 'sin emojis');

  console.log('OK descarga: estado, plan, umbral de completo, avisos, exportación y propuesta a partir de tus datos');
  r.w.close(); process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1); });
