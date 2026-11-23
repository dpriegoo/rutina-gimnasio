// Más músculo: series por músculo, estancamiento con acción, saltos pequeños, orden sugerido, RIR y notas de recorrido.
//   node tests/hypertrophy.test.js
// (los onclick en línea no se ejecutan en este entorno: se llama directamente a las funciones que lanzan)
const path = require('path'), assert = require('assert');
const { boot } = require('./page-helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.parse(JSON.stringify(x));

(async () => {
  const r = await boot(path.join(__dirname, '..', 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const w = r.w, d = w.document, ls = w.localStorage;
  const DIA = 'Día 1 · Pectoral, deltoides y tríceps', EX = 'Press banca plano';
  const hoy = w.localDateStr(), lwStart = w.getWeekStartOffset(-1);
  const dayOff = n => { const x = new Date(lwStart); x.setDate(x.getDate() + n); return w.localDateStr(x); };
  const row = (f, ex, peso, reps, extra) => Object.assign({ Perfil: 'David', Fecha: f, 'Día': DIA, Grupo: 'Pectoral', Ejercicio: ex, 'Peso (kg)': peso, Reps: reps, Series: 1, Nota: '', Variante: '', Calentamiento: false, RIR: '', ID: 'h' + Math.random().toString(36).slice(2) }, extra || {});
  const sets = (f, ex, peso, repsList, extra) => repsList.map(rp => row(f, ex, peso, rp, extra));
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();
  const cardOf = ex => [...d.querySelectorAll('#main > .card')].find(c => c.getAttribute('data-exercise') === ex);
  const reset = () => { ['hyPrefs_David', 'deloadList_David', 'rxPlans_David', 'rirMap_David'].forEach(k => ls.removeItem(k)); w.eval('for (const k in trainState) delete trainState[k]'); };
  const vol = () => Object.fromEntries(J(w.hyWeekVolume()).map(v => [v.key, v]));

  // ---------- 1) Series por músculo ----------
  reset(); w._progressCache = [];
  assert.deepStrictEqual(J(w.hyContrib('Press banca plano', 'Pectoral')), { pecho: 1, triceps: 0.5 }, 'press banca: pecho entero, tríceps medio');
  assert.deepStrictEqual(J(w.hyContrib('Hip thrust', 'Piernas')), { femoral: 1 }, 'un ejercicio tuyo de piernas con «hip thrust» va a femoral y glúteo');
  assert.deepStrictEqual(J(w.hyContrib('Sentadilla hack', 'Piernas')), { cuadriceps: 1 });
  assert.deepStrictEqual(J(w.hyContrib('Mi curl', 'Bíceps')), { biceps: 1 }, 'si no está en la tabla, manda su grupo');
  let v = vol();
  assert.strictEqual(v.pecho.done, 0); assert.strictEqual(v.pecho.total, 18, 'pectoral: 9 series el día 1 + 9 el día 4');
  assert.strictEqual(v.triceps.total, 16.5, 'tríceps: 9 directas + la mitad de 15 series de press');
  assert.strictEqual(v.biceps.total, 16.5, 'bíceps: 9 directas + la mitad de 15 de jalones y remos');
  assert.strictEqual(v.femoral.total, 13.5); assert.strictEqual(v.cuadriceps.total, 12); assert.strictEqual(v.hombros.total, 18);
  assert.strictEqual(v.core.status, 'info', 'el core no tiene una cifra de referencia'); assert(['pecho', 'espalda', 'hombros', 'biceps', 'triceps', 'cuadriceps', 'femoral'].every(k => v[k].status === 'ok'), 'tu rutina cae en 10–20 en todos');
  w._progressCache = sets(hoy, EX, 40, [8, 8, 8]);
  v = vol(); assert.strictEqual(v.pecho.done, 3); assert.strictEqual(v.triceps.done, 1.5, 'las series de press cuentan medias para el tríceps'); assert.strictEqual(v.pecho.total, 18, 'hechas + lo que queda no cambia al hacer lo previsto');
  w._progressCache.push(row(hoy, EX, 20, 10, { Calentamiento: true })); assert.strictEqual(vol().pecho.done, 3, 'el calentamiento no cuenta');
  // un músculo que se queda corto: aviso en Métricas
  const realTarget = w.weeklyTarget; w.weeklyTarget = () => 1;
  v = vol(); assert.strictEqual(v.pecho.status, 'bajo', 'con 1 serie por ejercicio el pecho se queda corto: ' + v.pecho.total);
  w.renderHyVolume(); const list = d.getElementById('hyVolList');
  assert(list.querySelector('.hy-row.hy-bajo') && /por debajo de 10 series semanales/.test(text(list)), 'aviso de músculo corto');
  assert(list.querySelector('.hy-bar[role="img"]').getAttribute('aria-label').indexOf('series hechas') > 0, 'la barra se describe para lectores de pantalla');
  w.weeklyTarget = realTarget;

  // ---------- 2) Orden sugerido ----------
  reset(); w._progressCache = [];
  w.openDay(0); await sleep(20);
  let o = J(w.hyOrder()); assert.deepStrictEqual(o.slice(0, 2).map(x => x.name), [EX, 'Press superior con mancuernas'], 'primero los multiarticulares pesados');
  const ord = d.getElementById('hyOrder'); assert(!ord.hidden && /Si la máquina está libre, mejor antes/.test(text(ord)) && ord.querySelectorAll('.hy-chip').length === 3, 'chips del orden sugerido');
  assert(/rinde más si llegas fresco/.test(text(ord)), 'dice por qué');
  w.goToExercise(1, true); w.sessionNext(); assert.strictEqual(w.eval('currentExIdx'), 2, 'con la misma prioridad, «Siguiente» sigue el orden de la rutina');
  w.sessionNext(); assert.strictEqual(w.eval('currentExIdx'), 3, 'no te devuelve al press banca que te saltaste (máquina ocupada)');
  w.goToExercise(6, true); w.sessionNext(); assert.strictEqual(w.eval('currentExIdx'), 0, 'al dar la vuelta, el primero pendiente');
  const realVol0 = w.hyWeekVolume; w.hyWeekVolume = () => [{ key: 'triceps', status: 'bajo' }];
  w.goToExercise(2, true); w.sessionNext(); assert.strictEqual(w.eval('currentExIdx'), 5, 'hacia delante, primero el músculo corto de series');
  w.hyWeekVolume = realVol0;
  const realVol = w.hyWeekVolume; w.hyWeekVolume = () => [{ key: 'triceps', status: 'bajo' }];
  o = J(w.hyOrder()); assert.strictEqual(o[0].name, 'Extensión de tríceps en polea', 'un músculo corto de series pasa delante'); assert(/Tríceps va corto/.test(o[0].why));
  w.hyWeekVolume = realVol;

  // ---------- 3) Estancamiento ----------
  reset();
  const dates8 = [1, 2, 3, 4, 5, 6, 7, 8].map(k => dayOff(-3 * (9 - k)));   // 8 sesiones antes de esta semana, de la más antigua a la más reciente
  w._progressCache = dates8.flatMap(f => sets(f, EX, 35, [7, 7, 6]));
  assert(w.hyIsStalled(EX), '8 sesiones planas: estancado');
  let s = J(w.hyStall(w.findExerciseObjInDay(EX, DIA), '')); assert.strictEqual(s.action, 'descarga', 'sin descarga reciente: primero una descarga');
  w.openDay(0); let card = cardOf(EX), logId = card.querySelector('.log-form').id;
  let st = card.querySelector('.plan-stall'); assert(st && /Sin progreso en tus últimas 8 sesiones/.test(text(st)) && /Empezar descarga/.test(text(st)), 'aviso en la tarjeta con su acción');
  assert(!cardOf('Aperturas en máquina').querySelector('.plan-stall'), 'solo en el ejercicio estancado');
  assert.strictEqual(w.hyStall(w.findExerciseObjInDay(EX, DIA), 'Chest Press (Technogym)'), null, 'en otra máquina, el aviso sobra');
  // ya descargaste dentro de esas 8 sesiones: toca otra variante
  ls.setItem('deloadList_David', JSON.stringify([{ start: dates8[5], end: dates8[6] }]));
  s = J(w.hyStall(w.findExerciseObjInDay(EX, DIA), '')); assert.strictEqual(s.action, 'variante'); assert.deepStrictEqual(s.alts, ['Chest Press (Technogym)', 'Mancuernas en banco plano']);
  w.renderPlan(card); st = card.querySelector('.plan-stall');
  assert(/Ya descargaste y sigue igual/.test(text(st)) && /Chest Press \(Technogym\)/.test(text(st)), 'propone las alternativas: ' + text(st));
  w.hyStallSnooze(logId); assert(!card.querySelector('.plan-stall'), '«Ahora no» lo esconde'); assert(J(w.hyPref('stallSnooze'))[EX] > hoy);
  assert(w.stateMeta().ajustes > 0, 'las preferencias se marcan para guardarse en el servidor');
  ls.removeItem('hyPrefs_David'); w.renderPlan(card);
  w.hyBlockStart(logId, 'Chest Press (Technogym)');
  assert.strictEqual(w.cardVariant(card), 'Chest Press (Technogym)', 'el bloque elige la variante'); assert(card.querySelector('.mb-block') && /Volver a la habitual/.test(text(card.querySelector('.mb-block'))), 'y dice hasta cuándo');
  assert(!card.querySelector('.plan-stall'), 'durante el bloque no se avisa');
  w.openDay(0); card = cardOf(EX); assert.strictEqual(w.cardVariant(card), 'Chest Press (Technogym)', 'al volver a abrir el día sigue elegida');
  w.hyBlockEnd(logId); assert.strictEqual(w.cardVariant(card), '', 'terminar el bloque vuelve a la habitual'); assert(!card.querySelector('.mb-block'));
  w.hyStallSnooze(logId);

  // ---------- 4) Saltos pequeños ----------
  reset();
  w._progressCache = [].concat(sets(dayOff(-6), EX, 35, [8, 7, 6]), sets(dayOff(-3), EX, 35, [8, 7, 6]));
  const exObj = w.findExerciseObjInDay(EX, DIA);
  let pl = w.rxPlan(exObj, ''); assert.strictEqual(pl.microAsk, true, 'tope en la serie 1 dos sesiones seguidas: se pregunta por el salto pequeño'); assert.strictEqual(pl.peso, 35);
  w.openDay(0); card = cardOf(EX); logId = card.querySelector('.log-form').id;
  const mic = card.querySelector('.plan-micro'); assert(mic && /¿tienes un salto más pequeño/.test(text(mic)), 'la pregunta sale en la tarjeta');
  assert.deepStrictEqual([...mic.querySelectorAll('.rir-pick')].map(b => text(b)), ['0,5 kg', '1 kg', '1,25 kg', '2 kg'], 'solo saltos menores que el habitual (2,5 kg)');
  w.hyMicroSet(logId, 1.25);
  pl = w.rxPlan(exObj, ''); assert.strictEqual(pl.peso, 36.25, 'sube solo 1,25 kg'); assert.deepStrictEqual(J(pl.sets.map(x => x.reps)), [7, 6, 6], 'repeticiones recalculadas con tu capacidad');
  assert(/sube solo 1,25 kg/.test(pl.motivo)); assert(!card.querySelector('.plan-micro') && /Plan de hoy · 36,25 kg/.test(text(card.querySelector('.plan-head'))));
  assert(/Salto pequeño en esta máquina: 1,25 kg/.test(text(card.querySelector('.plan'))), 'se puede cambiar desde la explicación del plan');
  assert.strictEqual(w.rxPlan(exObj, 'Chest Press (Technogym)').micro, undefined, 'cada máquina tiene su propio salto');
  w.hyMicroSet(logId, 0); pl = w.rxPlan(exObj, ''); assert(pl.peso === 35 && !pl.microAsk && !card.querySelector('.plan-micro'), '«No tengo»: doble progresión normal y no se vuelve a preguntar');
  w.hyMicroSet(logId, null); assert(card.querySelector('.plan-micro'), '«Cambiar» vuelve a preguntar');
  w._progressCache = [].concat(sets(dayOff(-6), EX, 35, [7, 7, 6]), sets(dayOff(-3), EX, 35, [8, 7, 6]));
  assert(!w.rxPlan(exObj, '').microAsk, 'una sola sesión al tope no basta');

  // ---------- 5) RIR: se pide hasta tenerlo ----------
  reset(); w._progressCache = sets(dayOff(-3), EX, 35, [8, 7, 6]);
  w.openDay(0); card = cardOf(EX); logId = card.querySelector('.log-form').id;
  await w.eval('planDone')(logId); await sleep(30); card = cardOf(EX);
  assert(!d.getElementById('restCard').hidden && !card.querySelector('.sr-rirask'), 'con el descanso abierto, el RIR se pide ahí');
  const realST = w.setTimeout, delays = []; w.setTimeout = (f, ms) => { delays.push(ms); return 0; };
  w.restFinish(); w.setTimeout = realST;
  assert(delays.indexOf(7000) < 0, 'sin RIR, el aviso del descanso no se cierra solo');
  w.restSkip(); card = cardOf(EX);
  const ask = card.querySelector('.sr.act .sr-rirask'); assert(ask && /¿Cuántas te quedaban en la serie 1\?/.test(text(ask)) && ask.querySelectorAll('.rir-pick').length === 4, 'al cerrarlo, la tarjeta lo pregunta');
  const setId = w.rxWeekSets(DIA, EX)[0].id; w.rirInlinePick(logId, setId, 1); card = cardOf(EX);
  assert(!card.querySelector('.sr-rirask'), 'una vez anotado, desaparece'); assert.strictEqual(w.rxWeekSets(DIA, EX)[0].rir, 1);
  await w.eval('planDone')(logId); await sleep(30);
  const ss = J(w.sessionStats(w.eval('DAYS[0]'))); assert(ss.rirKnown === 1 && ss.rirTotal === 2, 'cierre de sesión: RIR anotado en 1 de 2: ' + JSON.stringify([ss.rirKnown, ss.rirTotal]));
  assert(/RIR anotado en 1 de 2 series de hoy/.test(w.sessionDoneHtml(w.eval('DAYS[0]'), ss).replace(/<[^>]+>/g, '')));
  w.restSkip();

  // ---------- 6) Recorrido ----------
  const fem = w.prescriptionSpec({ name: 'Femoral sentado o tumbado', sets: '3 · 12-14' });
  assert(/Maeo y cols\., 2021/.test(fem.notaRom), 'femoral: sentado mejor que tumbado (con su estudio)');
  assert.strictEqual(w.prescriptionSpec({ name: 'Planchas abdominales', sets: '3 · 30 seg', timed: true }).notaRom, '', 'nada en los isométricos');
  assert.strictEqual(w.prescriptionSpec({ name: 'Mi ejercicio', sets: '3 · 8-10' }).notaRom, '');
  card = cardOf(EX); assert(/Recorrido: Baja hasta rozar el pecho/.test(text(card.querySelector('.plan-rom'))), 'la nota va con la explicación del plan');

  console.log('OK más músculo: series por músculo, estancamiento, saltos pequeños, orden sugerido, RIR y recorrido');
  process.exit(0);
})().catch(e => { console.error('FALLO: ' + e.message); console.error(e.stack); process.exit(1); });
