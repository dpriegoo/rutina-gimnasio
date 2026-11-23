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

// Recorrido: la parte en la que el músculo está estirado es la que más parece estimular, y recortarla es lo que más quita.
// Hay pocos estudios por ejercicio; se citan solo los que lo comparan directamente. El resto es criterio práctico.
const RX_ROM = {
  'sentadillas':                     'Baja todo lo que tu técnica permita: la sentadilla profunda hizo crecer más glúteo y aductores que la media sentadilla (Kubo y cols., 2019).',
  'prensa':                          'Baja hasta donde la zona lumbar siga pegada al respaldo: más recorrido, más estímulo para el cuádriceps.',
  'ext. de cuadriceps':              'No recortes la parte de abajo (rodilla bien flexionada): entrenar esa mitad del recorrido hizo crecer más el cuádriceps que la de arriba (Pedrosa y cols., 2022).',
  'femoral sentado o tumbado':       'Si puedes elegir, sentado: con la cadera flexionada el femoral trabaja más estirado y creció más que tumbado (Maeo y cols., 2021).',
  'peso muerto rumano':              'Baja hasta notar el femoral bien estirado con la espalda neutra: ese tramo es el que cuenta.',
  'zancadas con mancuernas':         'Paso largo y rodilla trasera cerca del suelo: el glúteo trabaja más estirado.',
  'ext. triceps con cuerda overhead':'Baja del todo, con los codos altos: con los brazos por encima de la cabeza el tríceps creció más que con la extensión en polea normal (Maeo y cols., 2023).',
  'extension de triceps en polea':   'Sube hasta que el codo quede bien flexionado: no recortes la parte de arriba, que es donde el tríceps se estira.',
  'curl predicador biceps':          'La parte de abajo, con el codo casi estirado, es la que más cuenta: no la recortes.',
  'curl de biceps con barra':        'Estira el codo del todo abajo, sin soltar la tensión, antes de volver a subir.',
  'aperturas en maquina':            'Abre hasta notar el pecho estirado, sin molestia en el hombro: es la parte que más estimula.',
  'press banca plano':               'Baja hasta rozar el pecho: el recorrido completo estimula más que las repeticiones cortas.',
  'jalon al pecho agarre neutro':    'Arriba del todo, deja que el dorsal se estire antes de volver a tirar.',
  'jalon al pecho agarre supino':    'Arriba del todo, deja que el dorsal se estire antes de volver a tirar.',
  'pullover serrato polea alta':     'Empieza con los brazos bien arriba, notando el dorsal estirado.',
  'remo en maquina':                 'Al volver, deja que los hombros vayan hacia delante y la espalda se estire.',
  'remo en polea baja agarre v':     'Al volver, deja que los hombros vayan hacia delante y la espalda se estire.',
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
  const notaRom = timed ? '' : (RX_ROM[rxKey(ex.name)] || '');
  return { cat: cat, catLabel: base.label, rango: rango, rir: rir, descanso: descanso, timed: timed, series: 3, nota: nota, notaReps: notaReps, notaRom: notaRom, paso: Number(ex.paso_kg) > 0 ? Number(ex.paso_kg) : null };
}

// Salto de carga: el que pongas a mano en la rutina (paso_kg) > el que se deduce de tus cargas anteriores en ese ejercicio y esa máquina
// (el salto más repetido entre las cargas distintas que has usado: 1,25 en unos, 5 en otras máquinas) > 2 kg con mancuernas, 2,5 en el resto
function rxLearnStep(ejercicio, variante){
  const seen = {};
  myRows().forEach(r => {
    if (r['Ejercicio'] !== ejercicio || isWarmupRow(r) || !sameMachine(r, variante || '')) return;
    const p = Number(r['Peso (kg)']); if (p > 0) seen[Math.round(p * 100) / 100] = true;
  });
  const l = Object.keys(seen).map(Number).sort((a, b) => a - b);
  if (l.length < 4) return null;
  const freq = {};
  for (let i = 1; i < l.length; i++) { const d = Math.round((l[i] - l[i - 1]) * 100) / 100; if (d >= 0.5 && d <= 10) freq[d] = (freq[d] || 0) + 1; }
  let best = null;
  Object.keys(freq).forEach(k => { const d = Number(k); if (freq[k] >= 2 && (best === null || freq[k] > freq[best] || (freq[k] === freq[best] && d < best))) best = d; });
  return best;
}
function rxStep(ex, spec, variante){
  if (spec && spec.paso) return spec.paso;
  const learned = ex && rxLearnStep(ex.name, variante);
  if (learned) return learned;
  const txt = rxKey((ex && ex.primary) + ' ' + (ex && ex.name));
  return /mancuerna/.test(txt) ? 2 : 2.5;
}

// Calentamiento sugerido para un pesado: rampa hacia la carga de trabajo (criterio práctico; no hay evidencia verificada de una rampa concreta).
// Con 40 kg o más, 3 series (50 % × 8, 70 % × 5, 85 % × 3); con menos, 2 (60 % × 6, 80 % × 3). Redondeado a tu salto de carga.
function rxWarmup(ex, spec, peso, step){
  if (!spec || spec.cat !== 'pesado' || spec.timed || !(peso >= 4 * step)) return [];
  const ramp = peso >= 40 ? [[0.5, 8], [0.7, 5], [0.85, 3]] : [[0.6, 6], [0.8, 3]];
  const out = [];
  ramp.forEach(f => {
    const p = Math.round(Math.max(step, Math.round(peso * f[0] / step) * step) * 100) / 100;
    if (p < peso && (!out.length || p > out[out.length - 1].peso)) out.push({ peso: p, reps: f[1] });
  });
  return out;
}

function rxRestSeconds(spec){ return Math.round(((spec.descanso[0] + spec.descanso[1]) / 2) / 5) * 5; }
function rxFmtRest(sec){ const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function rxFmtRestRange(spec){ return spec.descanso[0] === spec.descanso[1] ? rxFmtRest(spec.descanso[0]) : rxFmtRest(spec.descanso[0]) + '–' + rxFmtRest(spec.descanso[1]); }
function rxRirLabel(r){ return r === 0 ? 'Fallo técnico' : 'RIR ' + r; }
function rxRirHelp(r){ return r === 0 ? 'Hasta la última repetición con técnica limpia' : 'Termina dejando ' + r + (r === 1 ? ' repetición' : ' repeticiones') + ' en el depósito'; }

// ---------- Historial de un ejercicio en una máquina ----------
// Sesiones (una por fecha) con sus series de trabajo en el orden registrado. Si la primera serie es mucho más ligera que
// las demás, se trata como un calentamiento anotado como serie de trabajo (pasa a menudo) y no cuenta.
// Series de trabajo de una sesión en el orden registrado; si la primera es mucho más ligera que las demás se trata como un calentamiento anotado como trabajo
function rxCleanSets(list){
  let sets = list.slice().sort((a, b) => a.i - b.i);
  if (sets.length >= 3 && sets[0].peso > 0) {
    const rest = sets.slice(1).map(s => s.peso).sort((a, b) => a - b), med = rest[Math.floor(rest.length / 2)];
    if (med > 0 && sets[0].peso <= 0.85 * med) sets = sets.slice(1);
  }
  return sets;
}

function rxSessions(ejercicio, variante){
  const hoy = localDateStr();
  const rows = myRows().filter(r => r['Ejercicio'] === ejercicio && !isWarmupRow(r) && sameMachine(r, variante));
  const byDate = {};
  rows.forEach((r, i) => {
    const f = String(r['Fecha']).slice(0, 10);
    (byDate[f] = byDate[f] || []).push({ peso: Number(r['Peso (kg)']) || 0, reps: Number(r['Reps']) || 0, rir: (typeof rowRir === 'function' ? rowRir(r) : null), i: i });
  });
  return Object.keys(byDate).sort().map(f => {
    const sets = rxCleanSets(byDate[f]);
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
// Registro de los planes que viste (para el panel «¿te funciona el plan?»): fecha, ejercicio, objetivo y RIR. Y desde cuándo usas el plan.
function rxLogKey(){ return 'rxPlanLog_' + getProfile(); }
function rxSchemeKey(){ return 'rxSchemeStart_' + getProfile(); }
function rxPlanLog(){ try { const l = JSON.parse(localStorage.getItem(rxLogKey()) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function rxSchemeStart(){ try { return localStorage.getItem(rxSchemeKey()) || null; } catch (e) { return null; } }
function rxLogPlan(ejercicio, variante, plan){
  const hoy = localDateStr(), l = rxPlanLog().filter(x => !(x.fecha === hoy && x.ej === ejercicio && x.v === (variante || '')));
  l.push({ fecha: hoy, ej: ejercicio, v: variante || '', peso: plan.peso, targets: plan.sets.map(s => s.reps), rir: plan.sets.map(s => s.rir) });
  try { localStorage.setItem(rxLogKey(), JSON.stringify(l.slice(-600))); if (!rxSchemeStart()) localStorage.setItem(rxSchemeKey(), hoy); } catch (e) {}
}
function rxSavePlan(ejercicio, variante, plan){
  rxLogPlan(ejercicio, variante, plan);
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
  const spec = prescriptionSpec(ex, variante), step = rxStep(ex, spec, variante), lo = spec.rango[0], hi = spec.rango[1];
  let microAsk = false;   // se cumple la condición del salto pequeño pero aún no has dicho si lo tienes
  const mk = (peso, reps, motivo, extra) => Object.assign({
    peso: peso, sets: reps.map((r, i) => ({ n: i + 1, reps: r, rir: spec.rir[i] })), motivo: motivo, descanso: rxRestSeconds(spec), spec: spec, primera: false, cambioCarga: 0, microAsk: microAsk,
  }, extra || {});
  const sessions = rxSessions(ex.name, variante || '');
  if (!sessions.length) {
    return mk(null, [lo, lo, lo], spec.timed ? 'Primera vez: empieza cómodo y apunta el tiempo.' : 'Primera vez con esta máquina: elige una carga con la que llegues a ' + lo + ' repeticiones dejando ' + spec.rir[0] + ' en reserva.', { primera: true });
  }
  const last = sessions[sessions.length - 1];
  const L = spec.timed ? 0 : rxModalLoad(last.sets);
  const atL = last.sets.filter(s => s.peso === L).map(s => s.reps);
  const R = [0, 1, 2].map(i => atL[i] !== undefined ? atL[i] : atL[atL.length - 1]);
  // Capacidad de cada serie: lo que hiciste + el RIR que anotaste (si no lo anotaste, se supone que acabaste cerca del fallo)
  const atLr = last.sets.filter(s => s.peso === L).map(s => s.rir);
  const Rir = [0, 1, 2].map(i => { const v = atLr[i] !== undefined ? atLr[i] : atLr[atLr.length - 1]; return (v === null || v === undefined) ? null : v; });
  const rirKnown = Rir.some(v => v !== null);
  const cap = [0, 1, 2].map(i => R[i] + (Rir[i] === null ? 0 : Rir[i]));
  const prev = rxLoadPlans()[ex.name + '|' + (variante || '')];
  const havePrev = prev && prev.fecha === last.fecha && prev.peso === L && Array.isArray(prev.targets) && prev.targets.length === 3;

  // 1) Tope del rango en las 3 series: sube la carga (o, si es por tiempo, el objetivo)
  if (R.every(r => r >= hi) && atL.length >= 3) {
    if (spec.timed) return mk(0, [hi, hi, hi], 'Superaste ' + hi + ' s en las 3 series: añade dificultad (lastre o una variante más exigente).');
    return mk(L + step, [lo, lo, lo], 'Completaste ' + hi + ' repeticiones en las 3 series: sube ' + fmtNum(step, 2) + ' kg y vuelve a ' + lo + '.', { cambioCarga: step });
  }
  // 1b) Tope del rango en la serie 1 dos sesiones seguidas con esta carga (pero no en las 3): si tienes un salto más pequeño
  //     que el habitual, se sube solo eso y las repeticiones se recalculan con tu capacidad (si no anotaste el RIR, el del plan)
  if (!spec.timed && R[0] >= hi && sessions.length >= 2) {
    const prevS = sessions[sessions.length - 2], prevAt = prevS.sets.filter(s => s.peso === L);
    if (rxModalLoad(prevS.sets) === L && prevAt.length && prevAt[0].reps >= hi) {
      const micro = typeof hyMicro === 'function' ? hyMicro(ex.name, variante) : 0;
      if (micro > 0 && micro < step) {
        const P = Math.round((L + micro) * 100) / 100;
        const reps = [0, 1, 2].map(i => { const c = R[i] + (Rir[i] === null ? spec.rir[i] : Rir[i]); return Math.max(lo, Math.min(hi, Math.round(30 * (L * (1 + c / 30) / P - 1)) - spec.rir[i])); });
        return mk(P, reps, 'Llegaste a ' + hi + ' en la serie 1 dos sesiones seguidas: sube solo ' + fmtNum(micro, 2) + ' kg (tu salto pequeño) y sigue sumando repeticiones.', { cambioCarga: micro, micro: micro });
      }
      if (micro === null) microAsk = true;
    }
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
  const T = [0, 1, 2].map(i => cap[i] - spec.rir[i]);
  if (T[0] < lo) {
    const nuevo = rxLoadFor(L, cap[0], lo + spec.rir[0], step);
    const cambio = Math.round((nuevo - L) * 100) / 100;
    if (nuevo < L) return mk(nuevo, [lo, lo, lo], 'Con ' + rxRirLabel(spec.rir[0]) + ' desde la primera serie, tu carga útil baja un poco: prueba ' + fmtNum(nuevo, 2) + ' kg y apunta a ' + lo + ' repeticiones.', { cambioCarga: cambio });
  }
  const reps = T.map(t => Math.max(lo, Math.min(hi, t)));
  return mk(L, reps, 'Parte de ' + R.join('·') + ' (' + fmtNum(L, 2) + ' kg)' + (rirKnown ? ' y del RIR que anotaste (' + Rir.map(v => v === null ? '?' : v).join('·') + ')' : '') + ': reparto sostenible dejando margen en las primeras series.');
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

// ---------- Ajuste en vivo ----------
// El plan de hoy sale de sesiones anteriores; si HOY una serie no sale como estaba previsto (otro peso, otras repeticiones u
// otro RIR), las series que faltan se recalculan con lo que acabas de hacer:
//   capacidad de hoy = repeticiones + RIR anotado (si no lo anotaste, el que pedía el plan) -> 1RM estimado (Epley)
//   -> repeticiones posibles con el peso que tengas puesto - cansancio acumulado - RIR de esa serie.
// El cansancio entre series (≈1 repetición por serie con estos descansos, cerca del fallo) es criterio práctico, no un dato exacto.
const RX_FATIGUE_REPS = 1;

// sets: series de trabajo de HOY de este ejercicio (en orden); plan: rxPlan; idx: serie que toca; pesoNow: el peso del selector.
// Devuelve null si no hay nada que ajustar; si no, { reps: [objetivo por serie desde idx], sugPeso, motivo, ref }.
function rxLive(plan, todaySets, idx, pesoNow, step){
  const spec = plan.spec, n = plan.sets.length;
  if (spec.timed || !todaySets.length || idx >= n || !(pesoNow > 0)) return null;
  const j = todaySets.length - 1, ref = todaySets[j];
  if (!(ref.peso > 0) || !(ref.reps > 0)) return null;
  const tj = plan.sets[Math.min(j, n - 1)];
  const rirRef = ref.rir === null || ref.rir === undefined ? tj.rir : ref.rir;
  // Si la serie salió como estaba prevista y no has tocado el peso, manda el plan (no se recalcula por ruido)
  const asPlanned = plan.peso != null && Math.abs(ref.peso - plan.peso) < 0.01 && Math.abs(ref.reps - tj.reps) <= 1 && Math.abs(rirRef - tj.rir) <= 1;
  if (asPlanned && Math.abs(pesoNow - ref.peso) < 0.01) return null;
  const e1 = ref.peso * (1 + (ref.reps + rirRef) / 30);
  const capAt = p => 30 * (e1 / p - 1);
  const lo = spec.rango[0], hi = spec.rango[1];
  const repsAt = (p, i) => Math.max(1, Math.min(30, Math.round(capAt(p) - RX_FATIGUE_REPS * (i - j) - plan.sets[i].rir)));
  const reps = [];
  for (let i = idx; i < n; i++) reps.push(repsAt(pesoNow, i));
  // Fuera del rango: peso que te devuelve a él en la serie que toca (redondeado a tu salto de carga)
  let sugPeso = null, motivo = 'Ajustado a tu serie anterior (' + fmtNum(ref.peso, 2) + ' kg × ' + ref.reps + (ref.rir === null || ref.rir === undefined ? '' : ', RIR ' + ref.rir) + ').';
  const need = c => e1 / (1 + c / 30), extra = RX_FATIGUE_REPS * (idx - j) + plan.sets[idx].rir;
  if (reps[0] < lo) {
    const p = Math.max(step, Math.floor(need(lo + extra) / step + 1e-9) * step);
    if (p < pesoNow - 0.001) { sugPeso = Math.round(p * 100) / 100; motivo += ' Con ' + fmtNum(pesoNow, 2) + ' kg te quedarías por debajo de ' + lo + ': baja a ' + fmtNum(sugPeso, 2) + ' kg para entrar en el rango.'; }
  } else if (reps[0] > hi && !plan.descarga) {
    const p = Math.ceil(need(hi + extra) / step - 1e-9) * step;
    if (p > pesoNow + 0.001 && repsAt(p, idx) >= lo) { sugPeso = Math.round(p * 100) / 100; motivo += ' Con ' + fmtNum(pesoNow, 2) + ' kg te pasarías de ' + hi + ': sube a ' + fmtNum(sugPeso, 2) + ' kg.'; }
  }
  if (!ref.rir && ref.rir !== 0) motivo += ' Anota el RIR de cada serie y el ajuste será más fino.';
  return { reps: reps, sugPeso: sugPeso, motivo: motivo, ref: ref };
}

// Series de esta semana (día + ejercicio) en el orden registrado: lo ya hecho de la tanda actual
function rxWeekSets(dia, ejercicio){
  const weekStart = getWeekStart();
  return myRows()
    .filter(r => r['Día'] === dia && r['Ejercicio'] === ejercicio && !isWarmupRow(r) && parseLocalDate(r['Fecha']) >= weekStart)
    .map((r, i) => ({ peso: Number(r['Peso (kg)']) || 0, reps: Number(r['Reps']) || 0, variante: r['Variante'] || '', fecha: String(r['Fecha']).slice(0, 10), id: r['ID'], rir: (typeof rowRir === 'function' ? rowRir(r) : null), i: i }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.i - b.i);
}
