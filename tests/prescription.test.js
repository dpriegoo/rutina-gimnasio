// Motor de prescripción serie a serie (js/prescription.js): especificación por ejercicio y plan de hoy con doble progresión.
const path = require('path'), assert = require('assert');
const { boot } = require('./page-helper');
const J = x => JSON.parse(JSON.stringify(x));
(async () => {
  const r = await boot(path.join(__dirname, '..', 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const w = r.w;
  const D1 = 'Día 1 · Pectoral, deltoides y tríceps', D3 = 'Día 3 · Piernas y hombros';
  const row = (f, ej, peso, reps, extra) => Object.assign({ Perfil: 'David', Fecha: f, 'Día': D1, Grupo: 'X', Ejercicio: ej, 'Peso (kg)': peso, Reps: reps, Series: 1, Nota: '', Variante: '', Calentamiento: false, ID: Math.random().toString(36).slice(2) }, extra || {});
  const ex = (name, sets, extra) => Object.assign({ name: name, sets: sets, icon: 'barbellBench', primary: 'Barra libre en banco plano', alts: ['Chest Press (Technogym)'] }, extra || {});
  const spec = (e, v) => J(w.prescriptionSpec(e, v));

  // ---------- 1) Especificación por ejercicio ----------
  let s = spec(ex('Press banca plano', '3 · 6-8'));
  assert.strictEqual(s.cat, 'pesado'); assert.deepStrictEqual(s.rir, [2, 1, 1], 'pesado: nunca al fallo (1-3 RIR); la última serie con 1 en reserva'); assert.deepStrictEqual(s.rango, [6, 8]); assert.deepStrictEqual(s.descanso, [180, 210]);
  assert(/pines de seguridad o un ayudante/.test(s.nota), 'barra libre: aviso de seguridad'); assert.strictEqual(s.notaReps, '', 'con 6-8 reps no hace falta el aviso del RIR');
  assert.strictEqual(spec(ex('Press banca plano', '3 · 6-8'), 'Chest Press (Technogym)').nota, '', 'en máquina el fallo es seguro: sin aviso');
  s = spec(ex('Peso muerto rumano', '3 · 8-10')); assert.deepStrictEqual(s.rir, [2, 2, 1], 'peso muerto rumano: nunca al fallo'); assert(/espalda/.test(s.nota));
  s = spec(ex('Remo con barra o máquina', '3 · 8-10')); assert.deepStrictEqual(s.rir, [2, 1, 1]); assert.deepStrictEqual(spec(ex('Remo con barra o máquina', '3 · 8-10'), 'Low Row (Technogym)').rir, [2, 1, 1], 'ya no hay fallo en pesados, tampoco en máquina'); assert(/postura/.test(s.nota));
  s = spec(ex('Zancadas con mancuernas', '3 · 8-10')); assert.deepStrictEqual(s.rir, [2, 1, 1]);
  s = spec(ex('Aperturas en máquina', '3 · 10-12')); assert.strictEqual(s.cat, 'accesorio'); assert.deepStrictEqual(s.rir, [1, 1, 0], 'accesorio: solo la última serie puede llegar al fallo técnico'); assert.deepStrictEqual(s.descanso, [90, 120]);
  s = spec(ex('Planchas abdominales', '3 · 30 seg', { timed: true })); assert.strictEqual(s.cat, 'core'); assert.deepStrictEqual(s.rango, [45, 75], 'planchas: de 30 s a 45-75 s'); assert.strictEqual(s.timed, true);
  // rangos de la tabla: solo si tu rutina sigue con el valor antiguo
  assert.deepStrictEqual(spec(ex('Prensa', '3 · 6-8')).rango, [8, 10]); assert.deepStrictEqual(spec(ex('Prensa', '3 · 5-7')).rango, [5, 7], 'si lo cambiaste tú, se respeta');
  assert.deepStrictEqual(spec(ex('Posterior en máquina', '3 · 14-16')).rango, [12, 16]); assert.deepStrictEqual(spec(ex('Elevaciones laterales sentado', '3 · 12-14')).rango, [12, 15]);
  assert.deepStrictEqual(spec(ex('Pullover serrato polea alta', '3 · 14-16')).rango, [12, 15]); assert.deepStrictEqual(spec(ex('Crunch abdominal', '3 · 14-16')).rango, [12, 16]);
  // con más de 12 repeticiones el RIR se estima mucho peor: aviso en esos ejercicios
  assert(/más de 12 repeticiones/.test(spec(ex('Posterior en máquina', '3 · 14-16')).notaReps) && /más de 12/.test(spec(ex('Crunch abdominal', '3 · 14-16')).notaReps), 'aviso del RIR con rangos altos');
  assert.strictEqual(spec(ex('Aperturas en máquina', '3 · 10-12')).notaReps, '', 'hasta 12 repeticiones no hace falta'); assert.strictEqual(spec(ex('Planchas abdominales', '3 · 30 seg', { timed: true })).notaReps, '');
  // lo guardado en la rutina manda
  s = spec(ex('Press banca plano', '3 · 6-8', { categoria_fatiga: 'accesorio', rango_reps: [10, 12], descanso_seg: [75, 100], esquema_rir: [3, 2, 1] }));
  assert.strictEqual(s.cat, 'accesorio'); assert.deepStrictEqual(s.rango, [10, 12]); assert.deepStrictEqual(s.descanso, [75, 100]); assert.deepStrictEqual(s.rir, [3, 2, 1]); assert.strictEqual(s.nota, '', 'un esquema propio no lleva avisos');
  // ejercicios que añades tú
  assert.strictEqual(spec(ex('Dominadas lastradas', '3 · 6-8')).cat, 'pesado'); assert.strictEqual(spec(ex('Curl inverso', '3 · 10-12')).cat, 'accesorio'); assert.strictEqual(spec(ex('Hollow hold', '3 · 30 seg', { timed: true })).cat, 'core');
  assert.deepStrictEqual(spec(ex('Curl inverso', '')).rango, [8, 10], 'sin rango legible, uno razonable');
  // formato
  assert.strictEqual(w.rxFmtRest(195), '3:15'); assert.strictEqual(w.rxFmtRest(90), '1:30'); assert.strictEqual(w.rxRestSeconds({ descanso: [180, 210] }), 195); assert.strictEqual(w.rxFmtRestRange({ descanso: [90, 120] }), '1:30–2:00'); assert.strictEqual(w.rxFmtRestRange({ descanso: [90, 90] }), '1:30');
  assert.strictEqual(w.rxRirLabel(0), 'Fallo técnico'); assert.strictEqual(w.rxRirLabel(2), 'RIR 2');
  assert.strictEqual(w.rxStep(ex('Press superior con mancuernas', '3 · 8-10', { primary: 'Banco inclinado + mancuernas' }), spec(ex('x', '3 · 8-10'))), 2); assert.strictEqual(w.rxStep(ex('Press banca plano', '3 · 6-8'), spec(ex('Press banca plano', '3 · 6-8'))), 2.5);

  // ---------- 2) Plan de hoy ----------
  const press = ex('Press banca plano', '3 · 6-8');
  const sessions = (list, extra) => list.map(([f, p, rs, v]) => rs.map(rep => row(f, 'Press banca plano', p, rep, Object.assign({ Variante: v || '' }, extra)))).flat();
  const plan = (e, v) => J(w.rxPlan(e || press, v || ''));
  w.localStorage.removeItem('rxPlans_David');
  w._progressCache = [];
  let p = plan(); assert.strictEqual(p.primera, true); assert.strictEqual(p.peso, null); assert.deepStrictEqual(p.sets.map(x => x.reps), [6, 6, 6]); assert(/Primera vez/.test(p.motivo));
  assert.deepStrictEqual(p.sets.map(x => x.rir), [2, 1, 1], 'cada serie lleva su RIR');
  // tu caso típico: 35 kg y 8·7·6 -> reparto sostenible 6·6·6 con RIR 2/1/0
  w._progressCache = sessions([['2026-11-16', 35, [8, 7, 6]]]);
  p = plan(); assert.strictEqual(p.peso, 35); assert.deepStrictEqual(p.sets.map(x => x.reps), [6, 6, 6]); assert(/8·7·6/.test(p.motivo)); assert.strictEqual(p.cambioCarga, 0);
  // 7·7·5: con RIR 2 desde la primera serie no llegas al mínimo -> baja la carga
  w._progressCache = sessions([['2026-11-16', 35, [7, 7, 5]]]);
  p = plan(); assert.strictEqual(p.peso, 32.5, 'baja un escalón'); assert.deepStrictEqual(p.sets.map(x => x.reps), [6, 6, 6]); assert(p.cambioCarga < 0 && /carga útil baja/.test(p.motivo));
  // tope en las 3 series -> sube carga y vuelve al mínimo
  w._progressCache = sessions([['2026-11-16', 35, [8, 8, 8]]]);
  p = plan(); assert.strictEqual(p.peso, 37.5); assert.deepStrictEqual(p.sets.map(x => x.reps), [6, 6, 6]); assert.strictEqual(p.cambioCarga, 2.5); assert(/sube 2,5 kg/.test(p.motivo));
  w._progressCache = sessions([['2026-11-16', 35, [9, 8, 8]]]); assert.strictEqual(plan().peso, 37.5, 'por encima del tope también');
  w._progressCache = sessions([['2026-11-16', 35, [8, 8]]]); assert.notStrictEqual(plan().peso, 37.5, 'con solo 2 series no se sube (hacen falta las 3)');
  // con plan previo: lo conseguido contra lo previsto
  const withPlan = (targets, f) => { w.localStorage.setItem('rxPlans_David', JSON.stringify({ 'Press banca plano|': { fecha: f || '2026-11-16', peso: 35, targets: targets, rir: [2, 1, 0] } })); };
  w._progressCache = sessions([['2026-11-16', 35, [6, 7, 6]]]); withPlan([6, 6, 6]);
  p = plan(); assert.deepStrictEqual(p.sets.map(x => x.reps), [7, 7, 7]); assert(/Cumpliste el plan/.test(p.motivo)); assert.strictEqual(p.peso, 35);
  w._progressCache = sessions([['2026-11-16', 35, [5, 6, 6]]]); withPlan([6, 6, 6]);
  assert.deepStrictEqual(plan().sets.map(x => x.reps), [6, 7, 7], 'la serie que no llegó se repite; las demás suben');
  w._progressCache = sessions([['2026-11-16', 35, [4, 4, 6]]]); withPlan([6, 6, 6]);
  p = plan(); assert.strictEqual(p.peso, 32.5); assert(/baja 2,5 kg/.test(p.motivo), 'dos series 2+ reps por debajo: baja la carga');
  w._progressCache = sessions([['2026-11-16', 35, [7, 7, 7]]]); withPlan([7, 7, 7]);
  assert.deepStrictEqual(plan().sets.map(x => x.reps), [8, 8, 8], 'nunca por encima del tope');
  w._progressCache = sessions([['2026-11-16', 35, [6, 6, 6]]]); withPlan([6, 6, 6], '2026-11-09');
  assert.deepStrictEqual(plan().sets.map(x => x.reps), [4, 5, 6].map(x => Math.max(6, x)), 'un plan de otra fecha no se usa: se parte de lo hecho'); w.localStorage.removeItem('rxPlans_David');
  // calentamiento anotado como serie de trabajo (40 kg y luego 60): no cuenta
  const sq = ex('Sentadillas', '3 · 6-8', { icon: 'squatRack', primary: 'Barra libre en rack' });
  w._progressCache = [['2026-11-04', 40, 9], ['2026-11-04', 60, 8], ['2026-11-04', 60, 7]].map(([f, p, rp]) => row(f, 'Sentadillas', p, rp, { 'Día': D3 }));
  p = plan(sq); assert.strictEqual(p.peso, 60, 'la serie ligera inicial se ignora'); assert.strictEqual(w.rxSessions('Sentadillas', '')[0].sets.length, 2);
  // las series marcadas como calentamiento nunca cuentan
  w._progressCache = [row('2026-11-04', 'Sentadillas', 20, 12, { 'Día': D3, Calentamiento: true }), row('2026-11-04', 'Sentadillas', 60, 8, { 'Día': D3 }), row('2026-11-04', 'Sentadillas', 60, 7, { 'Día': D3 }), row('2026-11-04', 'Sentadillas', 60, 6, { 'Día': D3 })];
  assert.strictEqual(w.rxSessions('Sentadillas', '')[0].sets.length, 3);
  // cada máquina tiene su propio historial
  const cp = 'Chest Press (Technogym)';
  w._progressCache = sessions([['2026-11-16', 35, [8, 7, 6]], ['2026-11-18', 60, [10, 10, 10], cp]]);
  assert.strictEqual(plan(press, '').peso, 35); p = plan(press, cp); assert.strictEqual(p.peso, 62.5, 'la máquina secundaria sube su propia carga'); assert.deepStrictEqual(p.spec.rir, [2, 1, 1]);
  assert.strictEqual(plan(press, 'Mancuernas en banco plano').primera, true, 'una variante sin historial es "primera vez"');
  // otra carga dentro de la sesión: manda la más usada
  w._progressCache = sessions([['2026-11-16', 35, [8]], ['2026-11-16', 30, [9, 9]]]); assert.strictEqual(w.rxModalLoad(w.rxSessions('Press banca plano', '')[0].sets), 30);
  // lo que registras HOY no cambia el plan de hoy (sale de sesiones anteriores)
  { const h = w.localDateStr(); w._progressCache = sessions([['2026-11-16', 35, [8, 7, 6]]]).concat(sessions([[h, 35, [6]]]));
    p = plan(); assert.strictEqual(p.peso, 35); assert.deepStrictEqual(p.sets.map(x => x.reps), [6, 6, 6], 'con una serie de hoy ya hecha, el plan sigue siendo el mismo'); assert.strictEqual(w.rxSessions('Press banca plano', '').length, 1); }
  // por tiempo
  const pl = ex('Planchas abdominales', '3 · 30 seg', { timed: true, icon: 'floorMat', primary: 'Suelo', alts: [] });
  w._progressCache = [60, 60, 56].map(rp => row('2026-11-16', 'Planchas abdominales', 0, rp, { 'Día': D1 }));
  p = plan(pl); assert.deepStrictEqual(p.sets.map(x => x.reps), [60, 60, 56]); assert.strictEqual(p.peso, 0);
  w._progressCache = [76, 78, 80].map(rp => row('2026-11-16', 'Planchas abdominales', 0, rp, { 'Día': D1 })); assert(/Superaste 75 s/.test(plan(pl).motivo));
  // sets de la semana (de lo registrado esta semana)
  const hoy = w.localDateStr();
  w._progressCache = [row(hoy, 'Press banca plano', 35, 8), row(hoy, 'Press banca plano', 35, 7), row('2000-01-01', 'Press banca plano', 35, 6)];
  const ws = J(w.rxWeekSets(D1, 'Press banca plano')); assert.strictEqual(ws.length, 2); assert.deepStrictEqual(ws.map(x => x.reps), [8, 7]);
  // plan guardado
  w.localStorage.removeItem('rxPlans_David'); w.rxSavePlan('Press banca plano', '', { peso: 35, sets: [{ reps: 6, rir: 2 }, { reps: 6, rir: 1 }, { reps: 6, rir: 0 }] });
  const saved = J(w.rxLoadPlans())['Press banca plano|']; assert.strictEqual(saved.fecha, hoy); assert.deepStrictEqual(saved.targets, [6, 6, 6]);
  // tu rutina por defecto: todos los ejercicios tienen especificación coherente
  w.eval('DAYS').forEach(d => d.groups.forEach(g => g.exercises.forEach(e => { const sp = J(w.prescriptionSpec(e)); assert(sp.rango[0] > 0 && sp.rango[1] >= sp.rango[0] && sp.rir.length === 3 && sp.descanso[0] > 0, e.name); })));
  console.log('OK prescripción: especificación por ejercicio, doble progresión con RIR, máquinas, calentamientos y tiempo');
  r.w.close(); process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1); });
