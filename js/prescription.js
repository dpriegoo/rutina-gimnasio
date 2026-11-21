// =====================================================================
// Prescripción serie a serie  (prescription.js)
// Para cada ejercicio: categoría de fatiga, rango de repeticiones, descanso y esquema de RIR por serie (S1/S2/S3),
// y un plan de hoy basado en TU historial de ese ejercicio y de esa máquina exacta (doble progresión).
// Los valores por defecto salen de la tabla acordada y son EDITABLES por ejercicio (campos categoria_fatiga,
// rango_reps, descanso_seg y esquema_rir de la rutina). Contrastados con la literatura (ver docs/evidencia-prescripcion.md):
// dejar 1-3 repeticiones en reserva está respaldado; el reparto por series, el core y el riesgo del fallo técnico son
// criterio práctico sin ensayos directos.
// Depende de: utils, routine, day-view (sameMachine).
// =====================================================================

// RIR = repeticiones que te quedan "en el depósito". 0 = fallo técnico (la última repetición con técnica limpia).
const RX_CATS = {
  // Pesados: nunca al fallo (1-3 RIR da casi la misma hipertrofia con menos fatiga; llevar solo la última serie al fallo no tiene respaldo).
  pesado:    { label: 'Pesado',    rir: [2, 1, 1], descanso: [150, 210], hint: 'Básico multiarticular pesado' },
  // Accesorios: la última serie puede llegar al fallo técnico (criterio práctico: poca fatiga sistémica; sin ensayos directos).
  accesorio: { label: 'Accesorio', rir: [1, 1, 0], descanso: [90, 120],  hint: 'Aislamiento o máquina ligera' },
  core:      { label: 'Core',      rir: [1, 1, 0], descanso: [60, 90],   hint: 'Core e isométricos' },
};

const RX_LIBRE_NOTE = 'Barra libre: si te acercas al fallo, usa pines de seguridad o un ayudante.';
const RX_REPS_NOTE = 'Con más de 12 repeticiones el RIR se estima peor (el error es varias veces mayor): guíate por la velocidad de las últimas repeticiones y, si dudas, deja 1–2.';

// Tabla acordada (clave = nombre sin tildes en minúsculas). rango: solo si cambia respecto al de tu rutina antigua;
// rirMaquina: esquema distinto si la variante elegida es una máquina o polea (ahora ningún ejercicio lo necesita).
const RX_TABLE = {
  'press banca plano':               { cat: 'pesado',    descanso: [180, 210], libre: true },
  'press superior con mancuernas':   { cat: 'pesado',    descanso: [150, 180] },
  'press superior mancuernas':       { cat: 'pesado',    descanso: [150, 150] },
  'jalon al pecho agarre neutro':    { cat: 'pesado',    descanso: [150, 180] },
  'remo en maquina':                 { cat: 'pesado',    descanso: [150, 150] },
  'jalon al pecho agarre supino':    { cat: 'pesado',    descanso: [150, 150] },
  'remo con barra o maquina':        { cat: 'pesado',    descanso: [150, 180], nota: 'Con barra inclinada, la espalda manda: si pierdes la postura, termina la serie (criterio de prudencia).' },
  'press de hombros en maquina':     { cat: 'pesado',    descanso: [150, 150] },
  'sentadillas':                     { cat: 'pesado',    descanso: [180, 210], libre: true },
  'peso muerto rumano':              { cat: 'pesado',    descanso: [180, 180], rir: [2, 2, 1], nota: 'Criterio de prudencia (no hay datos de lesión): nunca al fallo, la espalda se redondea al perder el control.' },
  'prensa':                          { cat: 'pesado',    descanso: [180, 180], rango: [8, 10], rangoAntes: [6, 8] },
  'zancadas con mancuernas':         { cat: 'pesado',    descanso: [120, 150], nota: 'Unilateral: repeticiones por pierna; el fallo lo marca el equilibrio, no el músculo.' },
  'aperturas en maquina':            { cat: 'accesorio', descanso: [90, 120] },
  'elevaciones laterales sentado':   { cat: 'accesorio', descanso: [90, 90],   rango: [12, 15], rangoAntes: [12, 14] },
  'posterior en maquina':            { cat: 'accesorio', descanso: [90, 90],   rango: [12, 16], rangoAntes: [14, 16] },
  'extension de triceps en polea':   { cat: 'accesorio', descanso: [120, 120] },
  'ext. triceps con cuerda overhead':{ cat: 'accesorio', descanso: [90, 90] },
  'remo en polea baja agarre v':     { cat: 'accesorio', descanso: [120, 120] },
  'curl de biceps con barra':        { cat: 'accesorio', descanso: [120, 120] },
  'curl martillo con cuerda':        { cat: 'accesorio', descanso: [90, 90] },
  'curl predicador biceps':          { cat: 'accesorio', descanso: [90, 90] },
  'ext. de cuadriceps':              { cat: 'accesorio', descanso: [90, 120] },
  'femoral sentado o tumbado':       { cat: 'accesorio', descanso: [90, 120] },
  'pullover serrato polea alta':     { cat: 'accesorio', descanso: [90, 90],   rango: [12, 15], rangoAntes: [14, 16] },
  'elevacion de piernas tumbado':    { cat: 'core',      descanso: [60, 90],   rango: [10, 15], rangoAntes: [10, 12] },
  'crunch abdominal':                { cat: 'core',      descanso: [60, 90],   rango: [12, 16], rangoAntes: [14, 16] },
  'planchas abdominales':            { cat: 'core',      descanso: [60, 60],   rango: [45, 75], rangoAntes: [30, 30], rir: [1, 1, 0] },
};

function rxKey(name){ return String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }

// "3 · 6-8" -> [6, 8];  "3 · 30 seg" -> [30, 30]
function rxParseSets(str){
  const s = String(str || '');
  const r = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (r) return [Number(r[1]), Number(r[2])];
  const one = s.match(/·\s*(\d+)/) || s.match(/(\d+)\s*seg/);
  return one ? [Number(one[1]), Number(one[1])] : [8, 10];
}

// Categoría para ejercicios que no están en la tabla (los que añades tú): por tipo y por nombre
function rxInferCat(ex){
  if (ex && ex.timed) return 'core';
  const n = rxKey(ex && ex.name);
  if (/plancha|crunch|abdominal|elevacion de piernas|isometric/.test(n)) return 'core';
  if (/press banca|sentadilla|peso muerto|prensa|jalon|remo (con barra|en maquina|inclinado)|press (superior|inclinado|de hombros|militar)|zancada|dominada|fondos/.test(n)) return 'pesado';
  return 'accesorio';
}

function rxIsMachineVariant(v){ return /maquina|machine|technogym|polea|cable|pulley|multipower|smith|leg press|prensa/.test(rxKey(v)); }

function rxClampInt(v, lo, hi, dflt){ const n = Math.round(Number(v)); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; }

// Especificación efectiva del ejercicio: lo que hayas guardado en la rutina manda; si no, la tabla; si no, la categoría.
function prescriptionSpec(ex, variante){
  ex = ex || {};
  const t = RX_TABLE[rxKey(ex.name)] || {};
  const cat = RX_CATS[ex.categoria_fatiga] ? ex.categoria_fatiga : (t.cat || rxInferCat(ex));
  const base = RX_CATS[cat];
  const sets = rxParseSets(ex.sets);
  // El rango de la tabla solo sustituye al de tu rutina si esta sigue con el valor antiguo (si lo cambiaste tú, se respeta)
  let rango = sets;
  if (Array.isArray(ex.rango_reps) && ex.rango_reps.length === 2) rango = [Number(ex.rango_reps[0]), Number(ex.rango_reps[1])];
  else if (t.rango && t.rangoAntes && sets[0] === t.rangoAntes[0] && sets[1] === t.rangoAntes[1]) rango = t.rango;
  if (!(rango[0] > 0) || !(rango[1] >= rango[0])) rango = [8, 10];
  let rir = Array.isArray(ex.esquema_rir) && ex.esquema_rir.length === 3 ? ex.esquema_rir.map(x => rxClampInt(x, 0, 5, 0)) : null;
  const custom = !!rir;
  if (!rir) rir = (t.rirMaquina && rxIsMachineVariant(variante)) ? t.rirMaquina : (t.rir || base.rir);
  const descanso = Array.isArray(ex.descanso_seg) && ex.descanso_seg.length === 2 ? [Number(ex.descanso_seg[0]), Number(ex.descanso_seg[1])] : (t.descanso || base.descanso);
  const timed = !!ex.timed || /plancha/.test(rxKey(ex.name));
  // Aviso de seguridad: solo en ejercicios de barra libre cuando la variante no es una máquina, y si no lo has personalizado
  const nota = custom ? '' : (t.libre && !rxIsMachineVariant(variante) ? RX_LIBRE_NOTE : (t.nota || ''));
  const notaReps = !timed && rango[1] > 12 ? RX_REPS_NOTE : '';
  return { cat: cat, catLabel: base.label, rango: rango, rir: rir, descanso: descanso, timed: timed, series: 3, nota: nota, notaReps: notaReps, paso: Number(ex.paso_kg) > 0 ? Number(ex.paso_kg) : null };
}

function rxStep(ex, spec){
  if (spec && spec.paso) return spec.paso;
  const txt = rxKey((ex && ex.primary) + ' ' + (ex && ex.name));
  return /mancuerna/.test(txt) ? 2 : 2.5;
}

function rxRestSeconds(spec){ return Math.round(((spec.descanso[0] + spec.descanso[1]) / 2) / 5) * 5; }
function rxFmtRest(sec){ const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function rxFmtRestRange(spec){ return spec.descanso[0] === spec.descanso[1] ? rxFmtRest(spec.descanso[0]) : rxFmtRest(spec.descanso[0]) + '–' + rxFmtRest(spec.descanso[1]); }
function rxRirLabel(r){ return r === 0 ? 'Fallo técnico' : 'RIR ' + r; }
function rxRirHelp(r){ return r === 0 ? 'Hasta la última repetición con técnica limpia' : 'Termina dejando ' + r + (r === 1 ? ' repetición' : ' repeticiones') + ' en el depósito'; }

// ---------- Historial de un ejercicio en una máquina ----------
// Sesiones (una por fecha) con sus series de trabajo en el orden registrado. Si la primera serie es mucho más ligera que
// las demás, se trata como un calentamiento anotado como serie de trabajo (pasa a menudo) y no cuenta.
function rxSessions(ejercicio, variante){
  const hoy = localDateStr();
  const rows = myRows().filter(r => r['Ejercicio'] === ejercicio && !isWarmupRow(r) && sameMachine(r, variante));
  const byDate = {};
  rows.forEach((r, i) => {
    const f = String(r['Fecha']).slice(0, 10);
    (byDate[f] = byDate[f] || []).push({ peso: Number(r['Peso (kg)']) || 0, reps: Number(r['Reps']) || 0, i: i });
  });
  return Object.keys(byDate).sort().map(f => {
    let sets = byDate[f].sort((a, b) => a.i - b.i);
    if (sets.length >= 3 && sets[0].peso > 0) {
      const rest = sets.slice(1).map(s => s.peso).sort((a, b) => a - b), med = rest[Math.floor(rest.length / 2)];
      if (med > 0 && sets[0].peso <= 0.85 * med) sets = sets.slice(1);
    }
    return { fecha: f, sets: sets };
  }).filter(s => s.sets.length && s.fecha !== hoy && !(typeof deloadOn === 'function' && deloadOn(s.fecha)));   // el plan de HOY sale de sesiones anteriores (lo que registras hoy no lo cambia) y las semanas de descarga no cuentan: se entrenó menos a propósito
}

function rxModalLoad(sets){
  const cnt = {};
  sets.forEach(s => { cnt[s.peso] = (cnt[s.peso] || 0) + 1; });
  let best = null;
  Object.keys(cnt).forEach(k => { const p = Number(k); if (best === null || cnt[k] > cnt[best] || (cnt[k] === cnt[best] && p > best)) best = p; });
  return best;
}

function rxPlansKey(){ return 'rxPlans_' + getProfile(); }
function rxLoadPlans(){ try { return JSON.parse(localStorage.getItem(rxPlansKey()) || '{}'); } catch (e) { return {}; } }
function rxSavePlan(ejercicio, variante, plan){
  const all = rxLoadPlans();
  all[ejercicio + '|' + (variante || '')] = { fecha: localDateStr(), peso: plan.peso, targets: plan.sets.map(s => s.reps), rir: plan.sets.map(s => s.rir) };
  try { localStorage.setItem(rxPlansKey(), JSON.stringify(all)); } catch (e) {}
}

// Carga que baja a 'cap' repeticiones de capacidad en la primera serie, con la relación carga-repeticiones habitual (Epley)
function rxLoadFor(L, capNow, capWanted, step){
  const raw = L * (1 + capNow / 30) / (1 + capWanted / 30);
  return Math.max(step, Math.floor(raw / step) * step);
}

// ---------- Plan de hoy ----------
// Devuelve { peso, sets: [{ n, reps, rir }], motivo, descanso, spec, primera, cambioCarga }
function rxPlanNormal(ex, variante){
  const spec = prescriptionSpec(ex, variante), step = rxStep(ex, spec), lo = spec.rango[0], hi = spec.rango[1];
  const mk = (peso, reps, motivo, extra) => Object.assign({
    peso: peso, sets: reps.map((r, i) => ({ n: i + 1, reps: r, rir: spec.rir[i] })), motivo: motivo, descanso: rxRestSeconds(spec), spec: spec, primera: false, cambioCarga: 0,
  }, extra || {});
  const sessions = rxSessions(ex.name, variante || '');
  if (!sessions.length) {
    return mk(null, [lo, lo, lo], spec.timed ? 'Primera vez: empieza cómodo y apunta el tiempo.' : 'Primera vez con esta máquina: elige una carga con la que llegues a ' + lo + ' repeticiones dejando ' + spec.rir[0] + ' en reserva.', { primera: true });
  }
  const last = sessions[sessions.length - 1];
  const L = spec.timed ? 0 : rxModalLoad(last.sets);
  const atL = last.sets.filter(s => s.peso === L).map(s => s.reps);
  const R = [0, 1, 2].map(i => atL[i] !== undefined ? atL[i] : atL[atL.length - 1]);
  const prev = rxLoadPlans()[ex.name + '|' + (variante || '')];
  const havePrev = prev && prev.fecha === last.fecha && prev.peso === L && Array.isArray(prev.targets) && prev.targets.length === 3;

  // 1) Tope del rango en las 3 series: sube la carga (o, si es por tiempo, el objetivo)
  if (R.every(r => r >= hi) && atL.length >= 3) {
    if (spec.timed) return mk(0, [hi, hi, hi], 'Superaste ' + hi + ' s en las 3 series: añade dificultad (lastre o una variante más exigente).');
    return mk(L + step, [lo, lo, lo], 'Completaste ' + hi + ' repeticiones en las 3 series: sube ' + fmtNum(step, 2) + ' kg y vuelve a ' + lo + '.', { cambioCarga: step });
  }
  // 2) Había un plan para esta carga: se mide lo conseguido contra lo previsto
  if (havePrev) {
    const T = prev.targets, A = R;
    const fallos = [0, 1, 2].filter(i => A[i] <= T[i] - 2).length;
    if (!spec.timed && fallos >= 2 && L - step > 0) return mk(L - step, [lo, lo, lo], 'Te quedaste 2 repeticiones o más por debajo en varias series: baja ' + fmtNum(step, 2) + ' kg y consolida.', { cambioCarga: -step });
    const next = [0, 1, 2].map(i => spec.timed ? Math.max(lo, Math.min(hi, A[i] >= T[i] ? T[i] + 5 : T[i])) : Math.max(lo, Math.min(hi, A[i] >= T[i] ? T[i] + 1 : T[i])));
    const subio = next.some((v, i) => v > T[i]);
    return mk(L, next, subio ? 'Cumpliste el plan de la última vez: hoy una repetición más donde puedas.' : 'No llegaste a todo lo previsto: repite el plan y consolídalo.');
  }
  // 3) Sin plan previo: se parte de lo que hiciste (se supone que cerca del fallo) restándole el RIR de cada serie
  if (spec.timed) return mk(0, [0, 1, 2].map(i => Math.max(lo, Math.min(hi, R[i]))), 'Parte de lo que lograste la última vez.');
  const T = [0, 1, 2].map(i => R[i] - spec.rir[i]);
  if (T[0] < lo) {
    const nuevo = rxLoadFor(L, R[0], lo + spec.rir[0], step);
    const cambio = Math.round((nuevo - L) * 100) / 100;
    if (nuevo < L) return mk(nuevo, [lo, lo, lo], 'Con ' + rxRirLabel(spec.rir[0]) + ' desde la primera serie, tu carga útil baja un poco: prueba ' + fmtNum(nuevo, 2) + ' kg y apunta a ' + lo + ' repeticiones.', { cambioCarga: cambio });
  }
  const reps = T.map(t => Math.max(lo, Math.min(hi, t)));
  return mk(L, reps, 'Parte de ' + R.join('·') + ' (' + fmtNum(L, 2) + ' kg): reparto sostenible dejando margen en las primeras series.');
}

// Plan de hoy. En una semana de descarga: las primeras DELOAD_SERIES series del plan normal, con la carga de siempre y un RIR más
// (sin subir carga: si el plan normal tocaba subirla, se queda en la anterior con un reparto cómodo)
function rxPlan(ex, variante){
  const plan = rxPlanNormal(ex, variante);
  return (typeof deloadActive === 'function' && deloadActive()) ? rxDeloadize(plan) : plan;
}
function rxDeloadize(plan){
  const lo = plan.spec.rango[0], hi = plan.spec.rango[1];
  let peso = plan.peso, reps = plan.sets.slice(0, DELOAD_SERIES).map(s => s.reps), extra = '';
  if (plan.cambioCarga > 0) { peso = plan.peso - plan.cambioCarga; reps = reps.map(() => Math.max(lo, hi - 1)); extra = ' No se sube carga durante la descarga.'; }
  const sets = reps.map((r, i) => ({ n: i + 1, reps: r, rir: Math.min(5, plan.sets[i].rir + DELOAD_RIR_PLUS) }));
  return Object.assign({}, plan, { peso: peso, sets: sets, cambioCarga: plan.cambioCarga > 0 ? 0 : plan.cambioCarga, descarga: true,
    motivo: 'Semana de descarga: ' + DELOAD_SERIES + ' series con la carga de siempre y un RIR más.' + extra + ' ' + plan.motivo });
}

// Series de esta semana (día + ejercicio) en el orden registrado: lo ya hecho de la tanda actual
function rxWeekSets(dia, ejercicio){
  const weekStart = getWeekStart();
  return myRows()
    .filter(r => r['Día'] === dia && r['Ejercicio'] === ejercicio && !isWarmupRow(r) && parseLocalDate(r['Fecha']) >= weekStart)
    .map((r, i) => ({ peso: Number(r['Peso (kg)']) || 0, reps: Number(r['Reps']) || 0, variante: r['Variante'] || '', fecha: String(r['Fecha']).slice(0, 10), id: r['ID'], i: i }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.i - b.i);
}
