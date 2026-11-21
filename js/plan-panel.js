// =====================================================================
// ¿Te funciona el plan?  (plan-panel.js)
// Tarjeta de Métricas > Ejercicios: compara, con TUS datos, el periodo anterior a usar el plan serie a serie con el actual:
// cuánto caen las repeticiones entre la serie 1 y la 3, cuántas sesiones tienen la serie 3 dentro del rango, cómo evoluciona la
// fuerza estimada, cuánto del plan cumples y, si anotas el RIR, cuánto te acercas al fallo de lo previsto.
// Es una OBSERVACIÓN, no una prueba: no hay grupo de control, y también influyen el sueño, la comida y el estrés.
// Depende de: prescription, rir, deload, progress-chart (exerciseSeries), utils.
// =====================================================================

const PP_BEFORE_WEEKS = 6;     // semanas anteriores al plan que se usan de referencia
const PP_MIN_SESSIONS = 8;     // sesiones mínimas en cada periodo para comparar
const PP_MIN_WEEKS = 2;        // semanas mínimas usando el plan

function ppSpec(name){
  let found = null;
  (typeof DAYS !== 'undefined' ? DAYS : []).forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => { if (!found && ex.name === name) found = ex; })));
  return found ? prescriptionSpec(found, '') : null;
}

// Sesiones (ejercicio × fecha × máquina) con 3 series de trabajo o más entre dos fechas (sin semanas de descarga)
function ppSessions(from, to){
  const g = {};
  myRows().filter(r => !isWarmupRow(r)).forEach((r, i) => {
    const f = String(r['Fecha']).slice(0, 10);
    if (f < from || f > to || (typeof deloadOn === 'function' && deloadOn(f))) return;
    const k = f + '|' + r['Ejercicio'] + '|' + (r['Variante'] || '');
    (g[k] = g[k] || { fecha: f, ej: r['Ejercicio'], v: r['Variante'] || '', sets: [] }).sets.push({ peso: Number(r['Peso (kg)']) || 0, reps: Number(r['Reps']) || 0, rir: rowRir(r), i: i });
  });
  return Object.keys(g).map(k => { const s = g[k]; s.sets = rxCleanSets(s.sets); return s; }).filter(s => s.sets.length >= 3);
}

function ppMean(a){ return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function ppMedian(a){ if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = Math.floor(b.length / 2); return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }

// Métricas de un conjunto de sesiones
function ppMetrics(sessions, from, to){
  const same = sessions.filter(s => s.sets[0].peso === s.sets[1].peso && s.sets[1].peso === s.sets[2].peso && s.sets[0].peso > 0);
  const drops = same.map(s => s.sets[0].reps - s.sets[2].reps);
  let inRange = 0, rated = 0;
  same.forEach(s => { const sp = ppSpec(s.ej); if (!sp || sp.timed) return; rated++; if (s.sets[2].reps >= sp.rango[0]) inRange++; });
  // Cambio de la fuerza estimada: por ejercicio, media de sus 2 últimas sesiones del periodo frente a las 2 primeras (mediana entre ejercicios)
  const ch = [];
  const names = []; sessions.forEach(s => { if (names.indexOf(s.ej) < 0) names.push(s.ej); });
  names.forEach(ej => {
    if (isTimedExercise(ej)) return;
    const ss = exerciseSeries(ej).sessions.filter(x => x.fecha >= from && x.fecha <= to && x.value > 0);
    if (ss.length < 4) return;
    const a = ppMean(ss.slice(0, 2).map(x => x.value)), b = ppMean(ss.slice(-2).map(x => x.value));
    if (a > 0) ch.push((b / a - 1) * 100);
  });
  return { n: sessions.length, nSame: same.length, drop: ppMean(drops), s3ok: rated ? Math.round(inRange / rated * 100) : null, rated: rated, change: ch.length >= 3 ? ppMedian(ch) : null, nChange: ch.length };
}

// Cumplimiento del plan y RIR anotado desde que usas el plan (según el registro de planes)
function ppPlanStats(from, to){
  const log = rxPlanLog().filter(x => x.fecha >= from && x.fecha <= to);
  const rows = myRows().filter(r => !isWarmupRow(r));
  let planned = 0, met = 0, rated = 0, closer = 0, same = 0, farther = 0;
  log.forEach(x => {
    rows.filter(r => r['Ejercicio'] === x.ej && String(r['Fecha']).slice(0, 10) === x.fecha && (r['Variante'] || '') === x.v).slice(0, 3).forEach((r, i) => {
      if (x.targets[i] !== undefined) { planned++; if ((Number(r['Reps']) || 0) >= x.targets[i]) met++; }
      const rr = rowRir(r);
      if (rr !== null && x.rir && x.rir[i] !== undefined) { rated++; if (rr < x.rir[i]) closer++; else if (rr === x.rir[i]) same++; else farther++; }
    });
  });
  return { planned: planned, met: met, adherence: planned ? Math.round(met / planned * 100) : null, rated: rated, closer: closer, same: same, farther: farther };
}

function ppData(){
  const start = rxSchemeStart(); if (!start) return { state: 'none' };
  const hoy = localDateStr();
  const weeks = Math.floor((parseLocalDate(hoy) - parseLocalDate(start)) / (7 * 864e5));
  const bFrom = deloadAddDays(start, -7 * PP_BEFORE_WEEKS), bTo = deloadAddDays(start, -1);
  const before = ppMetrics(ppSessions(bFrom, bTo), bFrom, bTo), after = ppMetrics(ppSessions(start, hoy), start, hoy);
  const stats = ppPlanStats(start, hoy);
  const enough = weeks >= PP_MIN_WEEKS && after.n >= PP_MIN_SESSIONS && before.n >= PP_MIN_SESSIONS;
  return { state: enough ? 'ok' : 'few', start: start, weeks: weeks, before: before, after: after, stats: stats };
}

function ppFmt(v, kind){
  if (v === null || v === undefined) return '—';
  if (kind === 'pct') return fmtNum(v, 0) + ' %';
  if (kind === 'chg') return (v >= 0 ? '+' : '−') + fmtNum(Math.abs(v), 1) + ' %';
  return fmtNum(v, 1);
}

// Lecturas en lenguaje llano; solo cuando la diferencia es clara y siempre como observación
function ppReadings(d){
  const out = [], b = d.before, a = d.after;
  if (b.drop !== null && a.drop !== null) {
    if (a.drop <= b.drop - 0.4) out.push('La serie 3 cae menos que antes respecto a la 1 (' + ppFmt(b.drop) + ' → ' + ppFmt(a.drop) + ' repeticiones).');
    else if (a.drop >= b.drop + 0.4) out.push('La serie 3 cae más que antes respecto a la 1 (' + ppFmt(b.drop) + ' → ' + ppFmt(a.drop) + ' repeticiones).');
  }
  if (b.s3ok !== null && a.s3ok !== null) {
    if (a.s3ok >= b.s3ok + 10) out.push('Más sesiones con la serie 3 dentro del rango (' + b.s3ok + ' % → ' + a.s3ok + ' %).');
    else if (a.s3ok <= b.s3ok - 10) out.push('Menos sesiones con la serie 3 dentro del rango (' + b.s3ok + ' % → ' + a.s3ok + ' %).');
  }
  if (b.change !== null && a.change !== null && Math.abs(a.change - b.change) >= 1.5) out.push('La fuerza estimada ' + (a.change > b.change ? 'mejora más' : 'mejora menos') + ' que antes (' + ppFmt(b.change, 'chg') + ' → ' + ppFmt(a.change, 'chg') + ').');
  if (d.stats.rated >= 6) {
    const pc = Math.round(d.stats.closer / d.stats.rated * 100), pf = Math.round(d.stats.farther / d.stats.rated * 100);
    if (pc >= 40) out.push('En el ' + pc + ' % de las series con RIR anotado acabaste más cerca del fallo de lo previsto: quizá te estés pasando de esfuerzo.');
    else if (pf >= 50) out.push('En el ' + pf + ' % de las series con RIR anotado acabaste más lejos del fallo de lo previsto: quizá puedas apretar algo más o subir carga.');
  }
  if (!out.length) out.push('Sin diferencias claras todavía entre antes y ahora.');
  return out;
}

function renderPlanPanel(){
  const el = document.getElementById('planPanelBody'); if (!el) return;
  const d = ppData();
  const note = '<div class="metric-sub" style="margin:10px 0 0;">Es una observación, no una prueba: no hay grupo de control, y también influyen el sueño, la comida y el estrés (y que antes entrenabas más cerca del fallo).</div>';
  if (d.state === 'none') { el.innerHTML = '<div class="metric-sub" style="margin:0;">Todavía no has usado el plan serie a serie. Cuando registres series con «Hecha», aquí verás en unas semanas si te funciona: cuánto caen las repeticiones entre series, cuántas sesiones llegan al rango y cómo evoluciona tu fuerza.</div>'; return; }
  const row = (l, a, b) => '<tr><th scope="row">' + l + '</th><td>' + a + '</td><td>' + b + '</td></tr>';
  const b = d.before, a = d.after, s = d.stats, bias = rirBias();
  let html = '';
  if (d.state === 'few') html += '<div class="empty-note" style="margin-bottom:12px;">Llevas ' + d.weeks + (d.weeks === 1 ? ' semana' : ' semanas') + ' y ' + a.n + ' sesiones con el plan (y ' + b.n + ' antes). Para comparar hacen falta al menos ' + PP_MIN_WEEKS + ' semanas y ' + PP_MIN_SESSIONS + ' sesiones en cada periodo. Mientras tanto, esto es lo que hay:</div>';
  html += '<div class="pp-wrap"><table class="pp-table"><thead><tr><th></th><th>Antes (' + PP_BEFORE_WEEKS + ' sem.)</th><th>Con el plan</th></tr></thead><tbody>' +
    row('Caída de repeticiones entre la serie 1 y la 3', ppFmt(b.drop), ppFmt(a.drop)) +
    row('Sesiones con la serie 3 dentro del rango', ppFmt(b.s3ok, 'pct'), ppFmt(a.s3ok, 'pct')) +
    row('Cambio de la fuerza estimada en el periodo', ppFmt(b.change, 'chg'), ppFmt(a.change, 'chg')) +
    row('Series que llegaron a lo previsto', '—', ppFmt(s.adherence, 'pct')) +
    row('Sesiones usadas', String(b.n), String(a.n)) + '</tbody></table></div>';
  if (s.rated) html += '<div class="metric-sub" style="margin:10px 0 0;">Con RIR anotado (' + s.rated + ' series): más cerca del fallo de lo previsto ' + s.closer + ', igual ' + s.same + ', más lejos ' + s.farther + '.</div>';
  if (bias && bias.n >= 3) html += '<div class="metric-sub" style="margin:6px 0 0;">Tu sesgo al estimar el RIR: ' + (bias.mean >= 0 ? '+' : '−') + fmtNum(Math.abs(bias.mean), 1) + ' repeticiones (' + bias.n + ' calibraciones).</div>';
  if (d.state === 'ok') html += '<ul class="pp-read">' + ppReadings(d).map(t => '<li>' + escHtml(t) + '</li>').join('') + '</ul>';
  el.innerHTML = html + note;
}
