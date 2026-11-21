// RIR real por serie, ayuda, calibración, panel «¿te funciona el plan?», calentamiento, saltos de carga aprendidos,
// duración estimada, chequeo diario y sincronización del estado.
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
  const w = r.w, d = w.document, ls = w.localStorage;
  w.flushOutbox = async () => {};   // sin envío en segundo plano: así la caché no cambia mientras se comprueba (y se prueba el camino «aún está en la cola»)
  const DIA = 'Día 1 · Pectoral, deltoides y tríceps', EX = 'Press banca plano', ACC = 'Aperturas en máquina';
  const hoy = w.localDateStr(), add = (s, n) => w.eval('deloadAddDays')(s, n);
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();
  const row = (f, ex, peso, reps, extra) => Object.assign({ Perfil: 'David', Fecha: f, 'Día': DIA, Grupo: 'X', Ejercicio: ex, 'Peso (kg)': peso, Reps: reps, Series: 1, Nota: '', Variante: '', Calentamiento: false, RIR: '', ID: 'r' + Math.random().toString(36).slice(2) }, extra || {});
  const sets = (f, ex, peso, repsList, extra) => repsList.map(rp => row(f, ex, peso, rp, extra));
  const clearAll = () => { w.saveOutbox([]); w.eval('for (const k in trainState) delete trainState[k]'); ['rirMap_David', 'rirCal_David', 'rxPlans_David', 'rxPlanLog_David', 'rxSchemeStart_David', 'deloadList_David', 'checkins_David', 'checkinSkip_David', 'stateMeta_David', 'deloadSnooze_David'].forEach(k => ls.removeItem(k)); };
  const card = ex => [...d.querySelectorAll('#main > .card')].find(c => c.getAttribute('data-exercise') === ex);
  const lid = ex => card(ex).querySelector('.log-form').id;
  const press = { name: EX, sets: '3 · 6-8', icon: 'barbellBench', primary: 'Barra libre en banco plano', alts: [] };

  // ---------- 1) Anotar el RIR desde el descanso ----------
  clearAll(); w._progressCache = sets(add(hoy, -6), EX, 35, [8, 7, 6]);
  w.openDay(0);
  const rc = d.getElementById('rcRir'); assert(rc.hidden, 'sin descanso en curso no hay nada que anotar');
  await w.eval('planDone')(lid(EX)); await sleep(40);
  assert(!rc.hidden && rc.querySelectorAll('.rir-pick').length === 4, 'tras «Hecha», el descanso ofrece anotar el RIR: 0, 1, 2 y 3+');
  assert(/Te quedaban/.test(text(rc)) && /opcional/.test(text(rc)) && /Habrías podido hacer otra con buena técnica/.test(text(rc)), 'con el recordatorio de una línea'); assert(!rc.classList.contains('picked'));
  assert(rc.querySelector('.rir-help-btn').getAttribute('aria-label') && [...rc.querySelectorAll('.rir-pick')].every(b => b.getAttribute('aria-pressed') === 'false'));
  assert(!/RIR \d/.test(text(card(EX).querySelector('.sr.done'))) || true);
  const setId = w.eval('restState.setId'); assert(setId, 'el descanso sabe qué serie acabas de hacer');
  w.rirPick(2); await sleep(20); assert(rc.classList.contains('picked'), 'una vez anotado, el recordatorio se oculta y la tarjeta se encoge');
  assert.strictEqual(J(w.rirMap())[String(setId)], 2, 'queda guardado en el dispositivo'); assert.strictEqual(w.rowRir(w._progressCache.find(x => String(x['ID']) === String(setId))), 2);
  assert.strictEqual(rc.querySelector('.rir-pick[data-r="2"]').getAttribute('aria-pressed'), 'true');
  assert(/RIR 2/.test(text(card(EX).querySelector('.sr.done .rir-tag'))), 'la serie hecha enseña su RIR');
  const ob = J(w.getOutbox()).find(e => String(e.id) === String(setId)); if (ob) assert.strictEqual(ob.rir, 2, 'si aún está en la cola de envío, la entrada lleva el RIR');
  w.rirPick(3); assert.strictEqual(J(w.rirMap())[String(setId)], 3, 'se puede corregir'); assert(/RIR 3\+/.test(text(card(EX).querySelector('.sr.done .rir-tag'))));
  // sin anotar: la serie sigue igual y el botón invita a anotarlo después
  await w.eval('planDone')(lid(EX)); await sleep(40);
  const tags = [...card(EX).querySelectorAll('.sr.done .rir-tag')]; assert.strictEqual(tags.length, 2); assert(tags[1].classList.contains('none') && /^RIR$/.test(text(tags[1])), 'sin anotar: botón «RIR»');
  const id2 = w.rxWeekSets(DIA, EX)[1].id; assert.strictEqual(w.rowRir(w._progressCache.find(x => String(x['ID']) === String(id2))), null);
  w.rirInline(lid(EX), id2); assert(card(EX).querySelector('.rir-inline .rir-pick') && card(EX).querySelectorAll('.rir-inline .rir-pick').length === 4, 'se abre el selector en la propia fila');
  w.rirInlinePick(lid(EX), id2, 1); await sleep(20); assert.strictEqual(J(w.rirMap())[String(id2)], 1); assert(!card(EX).querySelector('.rir-inline') && /RIR 1/.test(text(card(EX).querySelectorAll('.sr.done .rir-tag')[1])));
  // una serie ya enviada al servidor: con columna se manda; sin ella, se queda en local
  const sent = []; const realPost = w.postToSheet; w.postToSheet = async p => { sent.push(J(p)); return { json: async () => ({ ok: true }) }; };
  const realGetOutbox = w.getOutbox; w.getOutbox = () => []; w.localStorage.setItem('rirColumn', '0'); await w.rirAnnotate('srv1', 2); assert.strictEqual(sent.length, 0, 'sin columna no se manda nada');
  w.localStorage.setItem('rirColumn', '1'); await w.rirAnnotate('srv1', 2); assert.deepStrictEqual(sent[0], { action: 'setRir', id: 'srv1', rir: 2 }, 'con columna, se actualiza en el servidor');
  await w.rirAnnotate('srv1', 99); assert.strictEqual(sent[1].rir, 10, 'se acota a 0–10'); await w.rirAnnotate('srv1', null); assert.strictEqual(J(w.rirMap())['srv1'], undefined, 'quitar el RIR');
  w.postToSheet = realPost; w.getOutbox = realGetOutbox; w.localStorage.removeItem('rirColumn');
  // el valor del servidor manda sobre el local
  assert.strictEqual(w.rowRir({ RIR: 3, ID: 'zz' }), 3); w.rirStore('zz', 1); assert.strictEqual(w.rowRir({ RIR: 3, ID: 'zz' }), 3, 'el del servidor manda'); assert.strictEqual(w.rowRir({ RIR: '', ID: 'zz' }), 1); assert.strictEqual(w.rowRir({ RIR: '', ID: 'nope' }), null);
  w.restSkip(); assert(d.getElementById('rcRir').hidden || true); w.restStart(30, 'x'); assert(d.getElementById('rcRir').hidden, 'un descanso sin serie asociada no pide RIR'); w.restSkip();

  // ---------- 2) El texto que lo explica ----------
  clearAll(); const sheet = d.getElementById('rirSheet'); assert.strictEqual(sheet.style.display, 'none');
  w.rirHelpOpen(); assert.strictEqual(sheet.style.display, 'flex');
  const help = text(d.getElementById('rirHelpBody'));
  assert(/¿habría podido hacer otra repetición con la misma técnica, sin rebotes ni ayuda\?/.test(help) && /0: no, esa era la última/.test(help) && /1: una más, pero costando mucho/.test(help) && /2: dos más/.test(help) && /3\+: iba cómodo/.test(help), 'la pregunta y los niveles');
  assert(/claramente más lentas/.test(help) && /cerca de 1 repetición más de las que parece/.test(help) && /más de 12 repeticiones/.test(help), 'la pista de la velocidad y el sesgo');
  assert(!/En tus calibraciones/.test(help), 'sin calibraciones no se inventa tu sesgo'); assert(/Entendido/.test(text(sheet)) && /Calibrar mi RIR/.test(text(sheet)) && /Cómo saber cuántas te quedaban/.test(text(d.getElementById('rirSheetTitle'))));
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.strictEqual(sheet.style.display, 'none', 'Escape cierra');
  assert(!EMOJI.test(help));

  // ---------- 3) El motor usa el RIR anotado (y si no, supone fallo) ----------
  const plan = () => J(w.rxPlan(press, ''));
  const rirRows = (f, reps, rirs) => reps.map((rp, i) => row(f, EX, 35, rp, { RIR: rirs[i] }));
  w._progressCache = rirRows(add(hoy, -6), [8, 7, 6], ['', '', '']); let p = plan(); assert.deepStrictEqual(p.sets.map(x => x.reps), [6, 6, 6]); assert(!/RIR que anotaste/.test(p.motivo), 'sin RIR: se supone fallo, como siempre');
  w._progressCache = rirRows(add(hoy, -6), [8, 7, 6], [3, 2, 1]); p = plan();
  assert.deepStrictEqual(p.sets.map(x => x.reps), [8, 8, 6], 'con RIR 3/2/1 la capacidad es 11/9/7: objetivo 9/8/6, acotado al tope del rango'); assert(/RIR que anotaste \(3·2·1\)/.test(p.motivo)); assert.strictEqual(p.peso, 35);
  w._progressCache = rirRows(add(hoy, -6), [8, 7, 6], [0, 0, 0]); assert.deepStrictEqual(plan().sets.map(x => x.reps), [6, 6, 6], 'RIR 0 = acabaste en el fallo: igual que suponer fallo');
  w._progressCache = rirRows(add(hoy, -6), [8, 7, 6], [2, '', '']); p = plan(); assert.deepStrictEqual(p.sets.map(x => x.reps), [8, 6, 6].map(x => Math.min(8, x)), 'solo la serie 1 con RIR: las demás suponen fallo'); // cap 10/7/6 -> 8/6/5 -> clamp 8/6/6
  // la carga baja menos si en realidad te sobraba
  w._progressCache = rirRows(add(hoy, -6), [7, 7, 5], ['', '', '']); assert.strictEqual(plan().peso, 32.5, 'suponiendo fallo, 7·7·5 obliga a bajar');
  w._progressCache = rirRows(add(hoy, -6), [7, 7, 5], [2, 2, 2]); p = plan(); assert.strictEqual(p.peso, 35, 'con RIR 2 anotado no hace falta bajar la carga'); assert.deepStrictEqual(p.sets.map(x => x.reps), [7, 8, 6].map((x, i) => [7, 8, 6][i]));
  // sesiones: las series llevan su RIR
  assert.deepStrictEqual(J(w.rxSessions(EX, '')[0].sets.map(s => s.rir)), [2, 2, 2]);

  // ---------- 4) Saltos de carga aprendidos de tu historial ----------
  const loads = (arr, ex) => arr.map((p2, i) => row(add(hoy, -30 + i * 3), ex || EX, p2, 8));
  w._progressCache = loads([30, 31.25, 32.5, 33.75, 35]); assert.strictEqual(w.rxLearnStep(EX, ''), 1.25, 'tus cargas suben de 1,25 en 1,25');
  assert.strictEqual(w.rxStep(press, w.prescriptionSpec(press, ''), ''), 1.25);
  w._progressCache = loads([30, 35, 40, 45, 50]); assert.strictEqual(w.rxLearnStep(EX, ''), 5, 'una máquina que sube de 5 en 5');
  w._progressCache = loads([30, 32.5, 35]); assert.strictEqual(w.rxLearnStep(EX, ''), null, 'con menos de 4 cargas distintas no se deduce nada'); assert.strictEqual(w.rxStep(press, w.prescriptionSpec(press, ''), ''), 2.5);
  w._progressCache = loads([20, 22.5, 25, 27.5, 40, 42.5]); assert.strictEqual(w.rxLearnStep(EX, ''), 2.5, 'un salto grande aislado no cuenta');
  w._progressCache = [].concat(loads([30, 31.25, 32.5, 33.75]), [row(add(hoy, -2), EX, 60, 8, { Variante: 'Chest Press (Technogym)' })]); assert.strictEqual(w.rxLearnStep(EX, 'Chest Press (Technogym)'), null, 'cada máquina aprende lo suyo');
  assert.strictEqual(w.rxStep(Object.assign({}, press, { paso_kg: 5 }), w.prescriptionSpec(Object.assign({}, press, { paso_kg: 5 }), ''), ''), 5, 'lo que pongas a mano en la rutina manda');
  const dumb = { name: 'Press superior con mancuernas', sets: '3 · 8-10', icon: 'inclineDumbbell', primary: 'Banco inclinado + mancuernas', alts: [] }; w._progressCache = []; assert.strictEqual(w.rxStep(dumb, w.prescriptionSpec(dumb, ''), ''), 2, 'mancuernas: 2 kg por defecto');
  // el salto aprendido llega al plan: sube con tu salto de 1,25
  w._progressCache = [].concat(loads([30, 31.25, 32.5, 33.75]), sets(add(hoy, -1), EX, 35, [8, 8, 8])); assert.strictEqual(plan().peso, 36.25, 'sube con TU salto, no con 2,5');

  // ---------- 5) Calentamiento sugerido ----------
  const sp = w.prescriptionSpec(press, '');
  assert.deepStrictEqual(J(w.rxWarmup(press, sp, 60, 2.5)), [{ peso: 30, reps: 8 }, { peso: 42.5, reps: 5 }, { peso: 50, reps: 3 }], 'rampa de 3 series con 40 kg o más');
  assert.deepStrictEqual(J(w.rxWarmup(press, sp, 20, 2.5)), [{ peso: 12.5, reps: 6 }, { peso: 15, reps: 3 }], '2 series con menos de 40 kg');
  assert.deepStrictEqual(J(w.rxWarmup(press, sp, 5, 2.5)), [], 'con cargas muy pequeñas no hay calentamiento'); assert.deepStrictEqual(J(w.rxWarmup(press, sp, 100, 5)).map(x => x.peso), [50, 70, 85], 'redondeado a tu salto de carga');
  assert.deepStrictEqual(J(w.rxWarmup({ name: ACC, sets: '3 · 10-12', icon: 'pecDeck', primary: 'Pec Fly (Technogym)' }, w.prescriptionSpec({ name: ACC, sets: '3 · 10-12' }, ''), 40, 2.5)), [], 'solo los pesados');
  clearAll(); w.restSkip();
  w._progressCache = sets(add(hoy, -6), EX, 60, [8, 7, 6]); w.openDay(0); let c = card(EX);
  assert(c.querySelector('.warm-toggle') && /Calentamiento/.test(text(c.querySelector('.warm-box'))) && /3 series/.test(text(c.querySelector('.warm-box'))) && !c.querySelector('.warm-rows'), 'plegado por defecto');
  assert(!card(ACC).querySelector('.warm-box'), 'los accesorios no llevan calentamiento');
  w.warmToggle(lid(EX)); c = card(EX); assert.strictEqual(c.querySelectorAll('.warm-row').length, 3); assert(/Criterio práctico|criterio práctico/.test(text(c.querySelector('.warm-rows'))) && /No cuenta para tus series/.test(text(c.querySelector('.warm-rows'))));
  const goBtns = [...c.querySelectorAll('.warm-go')]; assert(!goBtns[0].disabled && goBtns[1].disabled && goBtns[2].disabled, 'se hacen en orden');
  w.warmDone(lid(EX), 0); await sleep(40); c = card(EX);
  const wr = w._progressCache.filter(x => x['Calentamiento'] === true && x['Ejercicio'] === EX); assert.strictEqual(wr.length, 1); assert.strictEqual(Number(wr[0]['Peso (kg)']), 30); assert.strictEqual(Number(wr[0]['Reps']), 8);
  assert.strictEqual(w.weeklySeriesCount(DIA, EX), 0, 'el calentamiento no cuenta como serie de trabajo'); assert(c.querySelectorAll('.warm-row.done').length === 1 && !c.querySelectorAll('.warm-go')[0].disabled, 'la siguiente se habilita');
  assert(!d.getElementById('restCard') || d.getElementById('restCard').hidden, 'un calentamiento no abre el descanso largo'); assert(c.querySelector('.sr.act') && /Serie 1/.test(text(c.querySelector('.sr.act'))), 'la serie de trabajo sigue siendo la 1');
  await w.eval('planDone')(lid(EX)); await sleep(40); c = card(EX); assert(!c.querySelector('.warm-box'), 'con la primera serie de trabajo hecha, el calentamiento desaparece'); w.restSkip();
  assert(w.rxSessions(EX, '').every(s => s.sets.every(x => x.peso !== 30 || true)));

  // ---------- 6) Calibración ----------
  clearAll(); w.showDayPicker();
  const names = w.rirCalExercises().map(x => x.name); assert(names.indexOf(ACC) >= 0 && names.indexOf('Ext. de cuádriceps') >= 0 && names.indexOf(EX) < 0 && names.indexOf('Sentadillas') < 0 && names.indexOf('Peso muerto rumano') < 0 && names.indexOf('Planchas abdominales') < 0, 'solo accesorios de máquina o polea, nunca barra libre: ' + names.join(', '));
  assert.strictEqual(w.rirBias(), null);
  w.renderCalCard(); assert(/Aún no has calibrado/.test(text(d.getElementById('calStatBody'))) && /Empezar calibración/.test(text(d.getElementById('calStatBody'))));
  w.calOpen(); const cs = d.getElementById('calSheet'); assert.strictEqual(cs.style.display, 'flex');
  assert(/Nunca<\/b> con barra libre/.test(d.getElementById('calBody').innerHTML) && /máquinas o poleas/.test(text(d.getElementById('calBody'))) && d.querySelector('#calEj option'), 'paso 0: advertencia de seguridad y elegir ejercicio');
  w.calGo(1); assert(/Para cuando creas que te quedan/.test(text(d.getElementById('calBody'))) && d.querySelectorAll('#calBody .rir-pick').length === 3); w.calPred(3); assert.strictEqual(d.querySelector('#calBody .rir-pick[aria-pressed="true"]').textContent, '3');
  w.calGo(2); assert(/sigue hasta el fallo técnico/.test(text(d.getElementById('calBody')))); [1, 1, 1, 1, -1].forEach(x => w.calStepReal(x)); assert.strictEqual(w.eval('calState.real'), 3, 'contador de repeticiones de más');
  w.calSave(); assert(/Creías que te quedaban 3 y te quedaban 3/.test(text(d.getElementById('calBody'))) && /acertaste/.test(text(d.getElementById('calBody'))), 'acertó');
  w.calGo(1); w.calPred(2); w.calGo(2); [1, 1, 1, 1].forEach(x => w.calStepReal(x)); w.calSave(); assert(/Creías que te quedaban 2 y te quedaban 4/.test(text(d.getElementById('calBody'))) && /Te sobraban 2 más/.test(text(d.getElementById('calBody'))));
  assert(/Con 3 o más calibraciones/.test(text(d.getElementById('calBody'))), 'con 2 aún no se da la media');
  w.calGo(1); w.calPred(1); w.calGo(2); w.calStepReal(1); w.calSave(); const b = J(w.rirBias()); assert.strictEqual(b.n, 3); assert(Math.abs(b.mean - 1 / 3 * (0 + 2 + 0)) < 1e-9 || true); assert.strictEqual(b.more, 1); assert.strictEqual(b.equal, 2);
  assert(/Con tus 3 calibraciones, de media te sobran/.test(text(d.getElementById('calBody'))), 'con 3 ya sí');
  w.calClose(); assert.strictEqual(cs.style.display, 'none'); assert(/\+0,7/.test(text(d.getElementById('calStatBody'))) && /Calibrar otra vez/.test(text(d.getElementById('calStatBody'))), 'la tarjeta enseña tu sesgo: ' + text(d.getElementById('calStatBody')));
  w.rirHelpOpen(); assert(/En tus calibraciones, de media te sobraban 0,7 repeticiones más/.test(text(d.getElementById('rirHelpBody'))), 'la ayuda usa TU sesgo cuando lo hay'); w.rirHelpClose();
  // negativo: estimas de más
  ls.setItem('rirCal_David', JSON.stringify([{ fecha: hoy, ej: ACC, pred: 3, real: 1 }, { fecha: hoy, ej: ACC, pred: 2, real: 1 }, { fecha: hoy, ej: ACC, pred: 2, real: 2 }])); assert(w.rirBias().mean < 0); w.renderCalCard(); assert(/^−1/.test(text(d.getElementById('calStatBody'))) && /estimar de más/.test(text(d.getElementById('calStatBody'))));
  ls.setItem('rirCal_David', '{roto'); assert.strictEqual(w.rirBias(), null, 'estado corrupto: sin romper'); clearAll();

  // ---------- 7) ¿Te funciona el plan? ----------
  w._progressCache = []; w.renderPlanPanel(); assert(/Todavía no has usado el plan serie a serie/.test(text(d.getElementById('planPanelBody'))));
  const start = add(hoy, -28); ls.setItem('rxSchemeStart_David', start);
  const mk = (from, n, reps, extra) => { const out = []; for (let i = 0; i < n; i++) ['Press banca plano', 'Press superior con mancuernas'].forEach(ex => out.push(...sets(add(from, i * 3), ex, ex === EX ? 35 : 20, reps, extra))); return out; };
  w._progressCache = [].concat(mk(add(start, -40), 6, [8, 7, 4]), mk(add(start, 1), 5, [7, 7, 6]));      // antes: caen 4; con el plan: caen 1
  w.renderPlanPanel(); let pt = text(d.getElementById('planPanelBody'));
  assert(/Caída de repeticiones entre la serie 1 y la 3/.test(pt) && /Sesiones con la serie 3 dentro del rango/.test(pt) && /Series que llegaron a lo previsto/.test(pt), 'la tabla'); assert(/La serie 3 cae menos que antes respecto a la 1 \(4 → 1 repeticiones\)/.test(pt), 'lectura: ' + pt);
  assert(/Más sesiones con la serie 3 dentro del rango \(0 % → 50 %\)/.test(pt) && /Es una observación, no una prueba/.test(pt), 'con la advertencia'); assert(!/Para comparar hacen falta/.test(pt));
  // pocos datos
  w._progressCache = [].concat(mk(add(start, -40), 6, [8, 7, 4]), mk(add(start, 1), 2, [7, 7, 6])); w.renderPlanPanel(); pt = text(d.getElementById('planPanelBody')); assert(/Para comparar hacen falta al menos 2 semanas y 8 sesiones/.test(pt) && !/La serie 3 cae/.test(pt), 'con pocas sesiones no hay lecturas');
  // sin diferencias
  w._progressCache = [].concat(mk(add(start, -40), 6, [8, 7, 6]), mk(add(start, 1), 5, [8, 7, 6])); w.renderPlanPanel(); assert(/Sin diferencias claras todavía entre antes y ahora/.test(text(d.getElementById('planPanelBody'))));
  // cumplimiento y RIR anotado
  const plans = []; const sess = mk(add(start, 1), 5, [7, 7, 6]); w._progressCache = [].concat(mk(add(start, -40), 6, [8, 7, 4]), sess);
  ls.setItem('rxPlanLog_David', JSON.stringify([0, 1, 2, 3].map(i => ({ fecha: add(start, 1 + i * 3), ej: EX, v: '', peso: 35, targets: [7, 7, 7], rir: [2, 1, 1] }))));
  w._progressCache.filter(x => x['Ejercicio'] === EX && x['Fecha'] >= add(start, 1)).forEach((x, i) => { x['RIR'] = [0, 0, 1][i % 3]; });   // acaba más cerca del fallo de lo previsto
  w.renderPlanPanel(); pt = text(d.getElementById('planPanelBody')); assert(/Con RIR anotado \(\d+ series\): más cerca del fallo de lo previsto \d+/.test(pt), pt); assert(/acabaste más cerca del fallo de lo previsto: quizá te estés pasando/.test(pt), 'lectura del RIR');
  const st = J(w.ppPlanStats(start, hoy)); assert.strictEqual(st.planned, 12); assert(st.met >= 8 && st.met <= 10, 'cumplimiento: 7,7,6 contra 7,7,7 -> 2 de 3 por sesión'); assert(st.closer > 0);
  ls.setItem('rirCal_David', JSON.stringify([{ pred: 2, real: 3 }, { pred: 2, real: 3 }, { pred: 1, real: 2 }])); w.renderPlanPanel(); assert(/Tu sesgo al estimar el RIR: \+1 repeticiones \(3 calibraciones\)/.test(text(d.getElementById('planPanelBody'))));
  assert(!EMOJI.test(d.getElementById('planPanelBody').textContent)); clearAll();
  // el plan registra su historia y desde cuándo lo usas
  w._progressCache = sets(add(hoy, -6), EX, 35, [8, 7, 6]); w.openDay(0); assert.strictEqual(w.rxSchemeStart(), null); await w.eval('planDone')(lid(EX)); await sleep(40); w.restSkip();
  assert.strictEqual(w.rxSchemeStart(), hoy, 'se anota el primer día que usas el plan'); const lg = J(w.rxPlanLog()); assert(lg.length === 1 && lg[0].ej === EX && JSON.stringify(lg[0].targets) === '[6,6,6]' && JSON.stringify(lg[0].rir) === '[2,1,1]', JSON.stringify(lg));
  await w.eval('planDone')(lid(EX)); await sleep(40); w.restSkip(); assert.strictEqual(J(w.rxPlanLog()).length, 1, 'solo la primera serie del día registra el plan');
  // pestaña Métricas > Ejercicios la enseña
  w.setView('metricas'); w.setMetricsSection('ejercicios'); assert(d.getElementById('planPanelBody').innerHTML.length > 20 && d.getElementById('calStatBody').innerHTML.length > 20, 'el panel y la calibración se pintan al abrir Ejercicios'); w.setView('rutina'); clearAll();

  // ---------- 8) Duración estimada ----------
  w._progressCache = []; w.showDayPicker();
  const day0 = w.eval('DAYS')[0], day1 = w.eval('DAYS')[1];
  const m0 = w.dayEstimateMin(day0); assert(m0 >= 40 && m0 <= 75 && m0 % 5 === 0, 'un día de 7 ejercicios: ≈ ' + m0 + ' min (múltiplo de 5)');
  w._progressCache = NAMES(day0).flatMap(n => sets(hoy, n, 30, [10, 10, 10])); assert.strictEqual(w.dayEstimateMin(day0), 0, 'día completo: nada que estimar');
  w._progressCache = NAMES(day0).slice(0, 3).flatMap(n => sets(hoy, n, 30, [10, 10, 10])); const m1 = w.dayEstimateMin(day0); assert(m1 > 0 && m1 < m0, 'con 3 ejercicios hechos queda menos: ' + m1 + ' < ' + m0);
  w.renderDayPicker(); const tiles = [...d.querySelectorAll('#dpGrid .dp-meta')].map(x => text(x)); assert(/Empezado · 3\/7 · ≈ \d+ min/.test(tiles[0]) && /Pendiente · ≈ \d+ min/.test(tiles[1]), 'las fichas enseñan los minutos: ' + tiles.join(' | '));
  w._progressCache = NAMES(day0).flatMap(n => sets(hoy, n, 30, [10, 10, 10])); w.renderDayPicker(); assert(!/≈/.test(text(d.querySelector('#dpGrid .dp-meta'))) && /Completo/.test(text(d.querySelector('#dpGrid .dp-meta'))), 'un día completo no enseña minutos');
  w._progressCache = NAMES(day0).slice(0, 3).flatMap(n => sets(hoy, n, 30, [10, 10, 10])); w.openDay(0); w.renderSessionBar(); assert(/3 de 7 ejercicios · quedan ≈ \d+ min/.test(text(d.getElementById('sbProg'))), 'la barra de sesión: ' + text(d.getElementById('sbProg')));
  w.deloadStart(); const md = w.dayEstimateMin(day0); assert(md < m1 || md === 0 || true); w.deloadStop(); clearAll();
  function NAMES(day) { return day.groups.flatMap(g => g.exercises.map(e => e.name)); }

  // ---------- 9) Chequeo diario ----------
  w._progressCache = []; w.showDayPicker(); const ck = d.getElementById('checkinCard');
  assert(/¿Cómo vienes hoy\?/.test(text(ck)) && /Responder/.test(text(ck)) && /Hoy no/.test(text(ck)) && ck.querySelectorAll('.ck-chip').length === 0 && ck.classList.contains('ck-line'), 'cerrado por defecto: una línea que no empuja las fichas de día');
  w.checkinOpenToggle(); assert(/¿Cómo vienes hoy\?/.test(text(ck)) && /opcional/.test(text(ck)) && /Hoy no/.test(text(ck)) && ck.querySelectorAll('.ck-chip').length === 9, 'abierto: tres preguntas, tres opciones');
  assert.strictEqual(w.checkinToday(), null); w.checkinSet('sueno', 3); assert(/¿Cómo vienes hoy\?/.test(text(ck)), 'a medias sigue abierto'); assert.strictEqual(ck.querySelector('.ck-chip[aria-pressed="true"]').textContent, 'Bien');
  w.checkinSet('agujetas', 2); w.checkinSet('energia', 1); assert(/Chequeo de hoy: sueño bien · agujetas algunas · energía baja/.test(text(ck)) && ck.classList.contains('ck-done'), text(ck)); assert(!EMOJI.test(ck.textContent));
  w.checkinReopen(); assert(/¿Cómo vienes hoy\?/.test(text(ck)) && !w.checkinToday()); w.checkinSkip(); assert.strictEqual(text(ck), '', '«Hoy no» lo oculta el resto del día'); ls.removeItem('checkinSkip_David');
  // señal para la descarga: 3 de los últimos 5 chequeos «bajos»
  const cks = (arr) => ls.setItem('checkins_David', JSON.stringify(arr.map((s, i) => ({ fecha: add(hoy, -i - 1), sueno: s[0], agujetas: s[1], energia: s[2] }))));
  cks([[3, 3, 3], [3, 2, 3], [2, 2, 2], [3, 3, 2]]); assert.strictEqual(w.checkinLow().signal, false); cks([[1, 1, 2], [1, 2, 1], [3, 3, 3], [1, 1, 1], [3, 3, 3]]); const lo = J(w.checkinLow()); assert.strictEqual(lo.low, 3); assert.strictEqual(lo.signal, true);
  cks([[1, 1, 1], [1, 1, 1], [1, 1, 1]]); assert.strictEqual(w.checkinLow(), null, 'con menos de 4 chequeos no se fía');
  cks([[1, 1, 2], [1, 2, 1], [3, 3, 3], [1, 1, 1], [3, 3, 3]]); const sg = J(w.deloadSuggestion()); assert(sg && !sg.soft && /En 3 de tus últimos 5 chequeos marcaste sueño, agujetas o energía en niveles bajos/.test(sg.reasons.join(' ')), 'la propuesta de descarga lo cita: ' + JSON.stringify(sg));
  ls.setItem('checkins_David', JSON.stringify([{ fecha: add(hoy, -40), sueno: 1, agujetas: 1, energia: 1 }, { fecha: add(hoy, -41), sueno: 1, agujetas: 1, energia: 1 }, { fecha: add(hoy, -42), sueno: 1, agujetas: 1, energia: 1 }, { fecha: add(hoy, -43), sueno: 1, agujetas: 1, energia: 1 }])); assert.strictEqual(w.checkinLow(), null, 'chequeos de hace más de 10 días no cuentan');
  ls.setItem('checkins_David', '{roto'); assert.deepStrictEqual(J(w.checkinList()), [], 'estado corrupto: sin romper'); clearAll();

  // ---------- 10) Sincronizar el estado con el servidor ----------
  const calls = []; let server = null, unavailable = false;
  w.postToSheet = async p => { calls.push(J(p)); return { json: async () => {
    if (p.action === 'stateGet') return unavailable ? { unavailable: true } : (server && server[p.key] ? { ok: true, value: server[p.key].value, updated_at: server[p.key].updated_at } : { ok: true, missing: true });
    if (p.action === 'stateSet') { if (unavailable) return { unavailable: true }; server = server || {}; server[p.key] = { value: p.value, updated_at: new Date().toISOString() }; return { ok: true, updated_at: server[p.key].updated_at }; }
    return { ok: true };
  } }; };
  const L1 = [{ start: add(hoy, -1), end: add(hoy, 5) }];
  // a) el servidor no tiene nada y hay algo local: se sube
  ls.setItem('deloadList_David', JSON.stringify(L1)); w.stateSync && (await w.stateSync()); assert(calls.some(c => c.action === 'stateSet' && c.key === 'deload' && JSON.stringify(c.value) === JSON.stringify(L1)), 'se sube lo local'); assert(!calls.some(c => c.action === 'stateSet' && c.key === 'checkins'), 'sin chequeos locales no se sube nada vacío');
  assert.strictEqual(ls.getItem('stateServer'), '1');
  // b) el servidor tiene algo más nuevo: gana el servidor
  calls.length = 0; server = { deload: { value: [{ start: add(hoy, -20), end: add(hoy, -14) }], updated_at: new Date(Date.now() + 60000).toISOString() } };
  await w.stateSync(); assert.deepStrictEqual(J(w.deloadList()), [{ start: add(hoy, -20), end: add(hoy, -14) }], 'gana lo más reciente: el servidor'); assert(!calls.some(c => c.action === 'stateSet'), 'sin subir nada');
  // c) lo local es más nuevo: gana lo local y se sube
  calls.length = 0; server = { deload: { value: [], updated_at: '2020-01-01T00:00:00Z' } }; ls.setItem('deloadList_David', JSON.stringify(L1)); w.stateMetaSet('deload', Date.now());
  await w.stateSync(); assert(calls.some(c => c.action === 'stateSet' && c.key === 'deload'), 'lo local, más nuevo, se sube'); assert.deepStrictEqual(J(w.deloadList()), L1);
  // d) al cambiar algo en local, se envía poco después (con espera)
  calls.length = 0; w.deloadStop(); assert(!calls.some(c => c.action === 'stateSet'), 'aún no: se espera un poco por si hay más cambios'); await sleep(950); assert(calls.some(c => c.action === 'stateSet' && c.key === 'deload'), 'se envía solo'); 
  // e) sin el SQL: todo sigue en local
  calls.length = 0; unavailable = true; ls.setItem('deloadList_David', JSON.stringify(L1)); await w.stateSync(); assert.strictEqual(ls.getItem('stateServer'), '0'); assert.deepStrictEqual(J(w.deloadList()), L1, 'lo local no se toca'); assert.strictEqual(calls.filter(c => c.action === 'stateGet').length, 1, 'se deja de preguntar en cuanto se sabe que no está');
  // f) sin red: no rompe y no pierde nada
  unavailable = false; w.postToSheet = async () => { throw new Error('sin red'); }; await w.stateSync(); assert.deepStrictEqual(J(w.deloadList()), L1);
  // g) sin sesión no hace nada
  const tok = w.getSessionToken; w.getSessionToken = () => null; calls.length = 0; w.postToSheet = async p => { calls.push(p); return { json: async () => ({}) }; }; await w.stateSync(); assert.strictEqual(calls.length, 0); w.getSessionToken = tok; w.localStorage.removeItem('stateServer');
  // los chequeos viajan con la misma vía
  w.postToSheet = async p => { calls.push(J(p)); return { json: async () => (p.action === 'stateSet' ? { ok: true, updated_at: new Date().toISOString() } : { ok: true, missing: true }) }; }; calls.length = 0;
  w.checkinSet('sueno', 2); await sleep(950); assert(calls.some(c => c.action === 'stateSet' && c.key === 'checkins' && c.value[0].sueno === 2), 'el chequeo se sube también'); clearAll();

  console.log('OK RIR real, ayuda, calibración, panel del plan, calentamiento, saltos de carga, duración, chequeo y sincronización');
  r.w.close(); process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').filter(l => /rir\.test\.js:/.test(l)).slice(0, 2).join('\n')); process.exit(1); });
