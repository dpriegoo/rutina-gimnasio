// =====================================================================
// Más músculo  (hypertrophy.js)
// 1) Series por músculo y semana: lo hecho + lo que queda de tu rutina, frente a la referencia de 10–20 series duras.
// 2) Estancamiento con acción: 8 sesiones sin tendencia al alza -> primero una descarga; si ya descargaste, un bloque
//    de unas semanas con otra variante (la tarjeta la deja elegida mientras dure).
// 3) Saltos pequeños: si llegas al tope del rango en la serie 1 dos sesiones seguidas, se pregunta si tienes un salto
//    menor que el habitual (disco de 1,25 kg, acople) y el plan sube solo eso (la lógica está en prescription.js).
// 4) Orden sugerido: el orden lo deciden las máquinas libres; esto solo dice cuál conviene antes si está libre.
// Las preferencias (saltos, bloques y avisos pospuestos) se guardan también en el servidor (clave «ajustes»).
// Depende de: utils, routine, planning, prescription, deload, progress-chart, day-view, day-picker.
// =====================================================================

// ---------- Preferencias ----------
function hyKey(){ return 'hyPrefs_' + getProfile(); }
function hyPrefs(){
  try { const p = JSON.parse(localStorage.getItem(hyKey()) || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch (e) { return {}; }
}
function hyPref(sec){ return hyPrefs()[sec] || {}; }
function hySetPref(sec, k, v){
  const p = hyPrefs(); p[sec] = p[sec] || {};
  if (v === undefined) delete p[sec][k]; else p[sec][k] = v;
  try { localStorage.setItem(hyKey(), JSON.stringify(p)); } catch (e) {}
  if (typeof stateTouch === 'function') stateTouch('ajustes');
}
function hyAddDays(n){ const d = new Date(); d.setDate(d.getDate() + n); return localDateStr(d); }
function hyDM(s){ return s.slice(8, 10) + '/' + s.slice(5, 7); }

// ---------- 1) Series por músculo ----------
// Las series de un músculo que solo ayuda cuentan media (p. ej. tríceps en el press banca): es el recuento que mejor
// predijo el crecimiento en el metaanálisis de Pelland y cols. (2024). 10–20 series duras por semana es la referencia
// habitual (Schoenfeld y cols. 2017: 10 o más crecen más que menos); por encima la ganancia se aplana y la fatiga no.
const HY_MUSCLES = {
  pecho: 'Pectoral', espalda: 'Dorsales y espalda', hombros: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps',
  cuadriceps: 'Cuádriceps', femoral: 'Femoral y glúteo', core: 'Core',
};
const HY_RANGE = [10, 20];
const HY_MAP = {
  'press banca plano':               { pecho: 1, triceps: 0.5 },
  'press superior con mancuernas':   { pecho: 1, triceps: 0.5, hombros: 0.5 },
  'press superior mancuernas':       { pecho: 1, triceps: 0.5, hombros: 0.5 },
  'aperturas en maquina':            { pecho: 1 },
  'elevaciones laterales sentado':   { hombros: 1 },
  'posterior en maquina':            { hombros: 1 },
  'press de hombros en maquina':     { hombros: 1, triceps: 0.5 },
  'extension de triceps en polea':   { triceps: 1 },
  'ext. triceps con cuerda overhead':{ triceps: 1 },
  'jalon al pecho agarre neutro':    { espalda: 1, biceps: 0.5 },
  'jalon al pecho agarre supino':    { espalda: 1, biceps: 0.5 },
  'remo en maquina':                 { espalda: 1, biceps: 0.5 },
  'remo en polea baja agarre v':     { espalda: 1, biceps: 0.5 },
  'remo con barra o maquina':        { espalda: 1, biceps: 0.5 },
  'pullover serrato polea alta':     { espalda: 1 },
  'curl de biceps con barra':        { biceps: 1 },
  'curl martillo con cuerda':        { biceps: 1 },
  'curl predicador biceps':          { biceps: 1 },
  'sentadillas':                     { cuadriceps: 1, femoral: 0.5 },
  'prensa':                          { cuadriceps: 1, femoral: 0.5 },
  'zancadas con mancuernas':         { cuadriceps: 1, femoral: 0.5 },
  'ext. de cuadriceps':              { cuadriceps: 1 },
  'peso muerto rumano':              { femoral: 1 },
  'femoral sentado o tumbado':       { femoral: 1 },
  'elevacion de piernas tumbado':    { core: 1 },
  'crunch abdominal':                { core: 1 },
  'planchas abdominales':            { core: 1 },
};
const HY_GROUP_MUSCLE = { 'Pectoral': 'pecho', 'Dorsales': 'espalda', 'Deltoides': 'hombros', 'Hombros': 'hombros', 'Bíceps': 'biceps', 'Tríceps': 'triceps', 'Core': 'core' };

// Músculos que trabaja un ejercicio ({ músculo: 1 | 0,5 }): la tabla; si no está (los que añades tú), su grupo de la rutina
function hyContrib(exName, grupo){
  const t = HY_MAP[rxKey(exName)]; if (t) return t;
  const m = HY_GROUP_MUSCLE[grupo];
  if (m) return { [m]: 1 };
  if (grupo === 'Piernas') return /femoral|isquio|rumano|gluteo|hip thrust|curl de pierna|leg curl/.test(rxKey(exName)) ? { femoral: 1 } : { cuadriceps: 1 };
  return {};
}
function hyExGroup(ex, groupLabel){ return groupLabel === 'Brazos' ? (ex.canonical || null) : groupLabel; }

// [{ key, label, done, left, total, status: 'bajo'|'ok'|'alto'|'info' }]
function hyWeekVolume(){
  const ws = getWeekStart(), done = {}, left = {};
  Object.keys(HY_MUSCLES).forEach(m => { done[m] = 0; left[m] = 0; });
  myRows().forEach(r => {
    if (isWarmupRow(r) || parseLocalDate(r['Fecha']) < ws) return;
    const n = Number(r['Series']) || 0; if (!n) return;
    const c = hyContrib(r['Ejercicio'], (typeof preciseGroupForRow === 'function' && preciseGroupForRow(r)) || r['Grupo']);
    Object.keys(c).forEach(m => { if (done[m] !== undefined) done[m] += n * c[m]; });
  });
  const target = weeklyTarget();
  (typeof DAYS !== 'undefined' ? DAYS : []).forEach(day => effectiveDayGroups(day).forEach(g => g.exercises.forEach(ex => {
    const n = Math.max(0, target - weeklySeriesCount(day.name, ex.name)); if (!n) return;
    const c = hyContrib(ex.name, hyExGroup(ex, g.label));
    Object.keys(c).forEach(m => { if (left[m] !== undefined) left[m] += n * c[m]; });
  })));
  return Object.keys(HY_MUSCLES).map(m => {
    const total = done[m] + left[m];
    const status = m === 'core' ? 'info' : (total < HY_RANGE[0] ? 'bajo' : (total > HY_RANGE[1] ? 'alto' : 'ok'));
    return { key: m, label: HY_MUSCLES[m], done: done[m], left: left[m], total: total, status: status };
  });
}

function renderHyVolume(){
  const el = document.getElementById('hyVolList'); if (!el) return;
  if (!getProfile()) { el.innerHTML = ''; return; }
  const vol = hyWeekVolume(), deload = deloadActive();
  const scale = Math.max(24, Math.ceil(Math.max.apply(null, vol.map(v => v.total)) + 2));
  const pc = x => Math.max(0, Math.min(100, x / scale * 100)).toFixed(1) + '%';
  el.innerHTML = vol.map(v => {
    const msg = deload || v.status === 'info' || v.status === 'ok' ? '' :
      (v.status === 'bajo'
        ? 'Con lo que queda de tu rutina te quedas en ' + fmtNum(v.total, 1) + ': por debajo de ' + HY_RANGE[0] + ' series semanales se suele crecer menos. Añade un ejercicio de este músculo (Editar) o préstalo de otro día.'
        : 'Más de ' + HY_RANGE[1] + ': a partir de ahí se gana poco más y la fatiga sigue subiendo. Si te cuesta recuperar, quita alguna serie de este músculo.');
    const aria = v.label + ': ' + fmtNum(v.done, 1) + ' series hechas, ' + fmtNum(v.total, 1) + ' si completas la semana';
    return '<div class="hy-row hy-' + v.status + '">' +
      '<div class="hy-top"><span class="hy-name">' + escHtml(v.label) + '</span><span class="hy-num"><b>' + fmtNum(v.done, 1) + '</b> hechas · ' + fmtNum(v.total, 1) + ' con lo que queda</span></div>' +
      '<div class="hy-bar" role="img" aria-label="' + escHtml(aria) + '">' +
        '<span class="hy-left" style="width:' + pc(v.total) + '"></span><span class="hy-done" style="width:' + pc(v.done) + '"></span>' +
        (v.status === 'info' ? '' : '<span class="hy-band" style="left:' + pc(HY_RANGE[0]) + ';width:' + pc(HY_RANGE[1] - HY_RANGE[0]) + '"></span>') + '</div>' +
      (msg ? '<div class="hy-msg">' + escHtml(msg) + '</div>' : '') + '</div>';
  }).join('') +
  '<div class="hy-legend"><span><i class="hy-k done"></i>Hechas</span><span><i class="hy-k left"></i>Lo que queda de tu rutina</span><span><i class="hy-k band"></i>' + HY_RANGE[0] + '–' + HY_RANGE[1] + ' series</span></div>' +
  (deload ? '<div class="hy-msg">Semana de descarga: el volumen baja a propósito.</div>' : '');
}

// ---------- 2) Estancamiento ----------
const HY_STALL_SNOOZE_DAYS = 28;
const HY_BLOCK_DAYS = 42;   // unas 6 semanas con la otra variante: lo bastante para ver si vuelve a progresar

function hyBlock(exName){ const b = hyPref('block')[exName]; return b && b.hasta >= localDateStr() ? b : null; }

// Sin progreso en las últimas 8 sesiones de la máquina de referencia (la misma regla que la gráfica: < 1,5 % de cambio)
function hyIsStalled(exName){
  if (isTimedExercise(exName)) return null;
  const ser = exerciseSeries(exName), ti = pgTrendInfo(ser.sessions.map(s => s.value));
  return ti && ti.stagnant ? { ser: ser, ti: ti } : null;
}

// null o { pct, n, action: 'descarga' | 'variante' | 'rango', alts }
function hyStall(ex, variante){
  if (!ex || deloadActive()) return null;
  const sn = hyPref('stallSnooze')[ex.name]; if (sn && localDateStr() <= sn) return null;
  if (hyBlock(ex.name)) return null;
  const s = hyIsStalled(ex.name); if (!s || (variante || '') !== s.ser.ref) return null;   // si ya entrenas en otra máquina, el aviso sobra
  const sess = s.ser.sessions, from = sess[sess.length - PG_TREND_N].fecha;
  const deloaded = deloadList().some(p => p.end >= from);
  const alts = (ex.alts || []).filter(a => a && a !== s.ser.ref);
  return { pct: s.ti.pct, n: s.ti.n, action: !deloaded ? 'descarga' : (alts.length ? 'variante' : 'rango'), alts: alts };
}

function hyStallHtml(logId, ex, variante){
  const s = hyStall(ex, variante); if (!s) return '';
  const head = 'Sin progreso en tus últimas ' + s.n + ' sesiones (' + (s.pct >= 0 ? '+' : '−') + fmtNum(Math.abs(s.pct), 1) + ' %).';
  let body = '', btns = '';
  if (s.action === 'descarga') {
    body = 'Antes de cambiar nada, una semana de descarga: soltar fatiga suele bastar para volver a progresar.';
    btns = '<button type="button" class="dl-btn pri" onclick="deloadStart()">Empezar descarga</button>';
  } else if (s.action === 'variante') {
    body = 'Ya descargaste y sigue igual: prueba unas ' + Math.round(HY_BLOCK_DAYS / 7) + ' semanas con otra variante. Su plan y sus marcas van aparte, y la tarjeta la dejará elegida mientras dure.';
    btns = s.alts.slice(0, 2).map(a => '<button type="button" class="dl-btn" onclick="hyBlockStart(\'' + logId + '\', \'' + jsArg(a) + '\')">' + escHtml(a) + '</button>').join('');
  } else {
    body = 'Ya descargaste y sigue igual: prueba unas semanas con otro rango de repeticiones (en Editar), por ejemplo más alto si estabas en 6–8.';
  }
  return '<div class="plan-stall">' + '<div class="ps-t">' + uiIcon('info', 's') + ' <b>' + escHtml(head) + '</b></div><div class="ps-b">' + escHtml(body) + '</div>' +
    '<div class="ps-btns">' + btns + '<button type="button" class="link-btn" onclick="hyStallSnooze(\'' + logId + '\')">Ahora no</button></div></div>';
}

function hyStallSnooze(logId){
  const card = trainCard(logId); if (!card) return;
  hySetPref('stallSnooze', card._ex.name, hyAddDays(HY_STALL_SNOOZE_DAYS));
  renderPlan(card);
}
function hyBlockStart(logId, alt){
  const card = trainCard(logId); if (!card) return;
  const hasta = hyAddDays(HY_BLOCK_DAYS);
  hySetPref('block', card._ex.name, { v: alt, desde: localDateStr(), hasta: hasta });
  useMachine(logId, alt);
  showToast('Hasta el ' + hyDM(hasta) + ' entrenarás con: ' + alt);
}
function hyBlockEnd(logId){
  const card = trainCard(logId); if (!card) return;
  hySetPref('block', card._ex.name, undefined);
  useMachine(logId, '');
}
// Al pintar el día, la variante del bloque queda elegida
function hyApplyBlock(card){
  const b = card && card._ex && hyBlock(card._ex.name); if (!b) return;
  const sel = card.querySelector('.inp-variante');
  if (sel && [].some.call(sel.options, o => o.value === b.v)) sel.value = b.v;
}
function hyBlockNoteHtml(logId, exName, variante){
  const b = hyBlock(exName); if (!b || b.v !== variante) return '';
  return '<div class="mb-block">' + uiIcon('refresh', 's') + '<span>Bloque con esta variante hasta el ' + hyDM(b.hasta) + '</span><button type="button" class="link-btn" onclick="hyBlockEnd(\'' + logId + '\')">Volver a la habitual</button></div>';
}

// ---------- 3) Saltos pequeños ----------
// undefined: no lo has dicho; 0: no tienes; > 0: el salto pequeño de ese ejercicio en esa máquina
function hyMicro(exName, variante){ const v = hyPref('micro')[exName + '|' + (variante || '')]; return v === undefined ? null : Number(v); }
function hyMicroOptions(step){ return [0.5, 1, 1.25, 2].filter(x => x < step - 0.001); }
function hyMicroSet(logId, n){
  const card = trainCard(logId); if (!card) return;
  hySetPref('micro', card._ex.name + '|' + cardVariant(card), n === null ? undefined : n);
  const st = trainSt(logId); delete st.peso; st.reps = {};
  renderPlan(card);
  if (n > 0) showToast('Salto pequeño: ' + fmtNum(n, 2) + ' kg');
}
function hyMicroAskHtml(logId, plan, step){
  const opts = hyMicroOptions(step); if (!opts.length) return '';
  return '<div class="plan-micro"><div class="ps-b">' + uiIcon('info', 's') + ' Llevas 2 sesiones llegando a ' + plan.spec.rango[1] + ' repeticiones en la serie 1. Subir ' + fmtNum(step, 2) + ' kg de golpe te haría perder bastantes repeticiones: <b>¿tienes un salto más pequeño en esta máquina?</b> (un disco pequeño o un acople)</div>' +
    '<div class="ps-btns">' + opts.map(o => '<button type="button" class="rir-pick" onclick="hyMicroSet(\'' + logId + '\', ' + o + ')">' + fmtNum(o, 2) + ' kg</button>').join('') +
    '<button type="button" class="link-btn" onclick="hyMicroSet(\'' + logId + '\', 0)">No tengo</button></div></div>';
}

// ---------- 4) Orden sugerido ----------
// Lo que haces primero rinde más (llegas más fresco): conviene empezar por los multiarticulares pesados y por los
// músculos que van cortos de series esta semana. Pero manda la máquina que esté libre: es solo una preferencia.
function hyOrder(){
  const short = {}; hyWeekVolume().forEach(v => { if (v.status === 'bajo') short[v.key] = true; });
  return exerciseCards().map((c, i) => {
    if (c.classList.contains('done') || !c._ex) return null;
    const ex = c._ex, grupo = (c.querySelector('.grouptag') || {}).textContent || '';
    const contrib = hyContrib(ex.name, hyExGroup(ex, grupo)), main = Object.keys(contrib).find(k => contrib[k] === 1);
    let score = 0, why = '';
    if (prescriptionSpec(ex, '').cat === 'pesado') { score += 2; why = 'multiarticular pesado: rinde más si llegas fresco'; }
    if (main && short[main]) { score += 3; why = HY_MUSCLES[main] + ' va corto de series esta semana'; }
    return { i: i, name: ex.name, score: score, why: why };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.i - b.i);
}

function renderHyOrder(){
  const el = document.getElementById('hyOrder'); if (!el) return;
  const o = typeof dayScreenOpen !== 'undefined' && dayScreenOpen ? hyOrder() : [];
  if (o.length < 2) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const top = o.slice(0, 3);
  el.innerHTML = '<div class="hy-order-t">Si la máquina está libre, mejor antes:</div><div class="hy-chips">' +
    top.map((x, k) => '<button type="button" class="hy-chip" onclick="goToExercise(' + x.i + ')"' + (x.why ? ' title="' + escHtml(x.why) + '"' : '') + '><b>' + (k + 1) + '</b> ' + escHtml(x.name) + '</button>').join('') + '</div>' +
    (top[0].why ? '<div class="hy-order-why">' + escHtml(top[0].name + ': ' + top[0].why + '.') + '</div>' : '');
}
