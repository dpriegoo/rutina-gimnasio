// =====================================================================
// Gráficas de progresión por ejercicio  (progress-chart.js)
// Mini gráfica en cada tarjeta (últimas sesiones) y hoja de detalle al tocarla.
// Los datos salen de window._progressCache filtrando por NOMBRE de ejercicio (no por día):
// un ejercicio que se hace en varios días (p. ej. press banca) junta todas sus sesiones.
// El calentamiento nunca cuenta (regla transversal). Sin librerías: SVG a mano.
//
// MÉTRICA ("fuerza estimada"): media de las series de trabajo de la sesión, con  carga × reps^0,10
// (tipo Lombardi). Se eligió comparando métricas con simulaciones (sim_progresion.py):
//  - mezclar peso y repeticiones detecta mucho mejor la progresión que el peso máximo o el volumen
//    total (el volumen sube con solo añadir una serie extra, el peso máximo ignora las reps);
//  - promediar las series es más estable que la mejor serie suelta;
//  - dar a las reps un peso moderado (0,10-0,15) rinde mejor que Epley, que las sobrepesa y se
//    infla con muchas repeticiones.
// Por eso NO coincide con el 1RM de Epley que usan Métricas y las marcas personales.
// El cambio se mide con medias de varias sesiones (más fiable que comparar con la anterior) y el
// aviso de "sin tendencia" usa una regresión sobre 8 sesiones (sim_estancamiento*.py).
// Depende de: utils (myRows, isWarmupRow, parseLocalDate, localDateStr, escHtml, jsArg),
//             routine (isTimedExercise).
// =====================================================================

const PG_CARD_POINTS = 8;    // sesiones que se dibujan en la tarjeta
const PG_SHEET_POINTS = 12;  // sesiones que se dibujan en la hoja de detalle
const PG_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function pgNum(v){ return fmtNum(v, 1); }
// Cargas reales (discos de 1,25 kg): hasta 2 decimales, sin ceros sobrantes
function pgKg(v){ return fmtNum(v, 2); }

function pgDate(fecha){
  const d = parseLocalDate(fecha);
  return d.getDate() + ' ' + PG_MONTHS[d.getMonth()];
}

// Exponente de las repeticiones en la fuerza estimada (0 = solo peso; Epley equivale a ~0,2-0,3)
const PG_EXP = 0.10;
const PG_TREND_N = 8;   // sesiones para decidir "tendencia al alza / sin tendencia"

function pgStrength(peso, reps){ return peso * Math.pow(reps, PG_EXP); }

// Una entrada por fecha Y MÁQUINA (variante). Sesión normal: media (ponderada por nº de series) de la
// fuerza de todas las series de trabajo. Ejercicio por tiempo: la mejor serie en segundos. Se guarda también
// la mejor serie (para mostrarla), el volumen total y la máquina (variante; '' = la habitual).
// Si un mismo día se usan dos máquinas salen dos entradas: cada una con su propio peso.
function exerciseSessions(ejercicio, dia){
  const timed = isTimedExercise(ejercicio);
  const byKey = {};
  myRows().forEach(r => {
    if (r['Ejercicio'] !== ejercicio || isWarmupRow(r)) return;
    if (dia && r['Día'] !== dia) return;   // opcional: solo las filas de un día concreto
    const fecha = String(r['Fecha']).slice(0, 10);
    const peso = Number(r['Peso (kg)']) || 0;
    const reps = Number(r['Reps']) || 0;
    const n = Math.max(1, Number(r['Series']) || 1);
    const val = timed ? reps : (peso > 0 && reps > 0 ? pgStrength(peso, reps) : 0);
    if (!(val > 0)) return;
    const variante = r['Variante'] || '';
    const key = fecha + '|' + variante;
    const s = byKey[key] || (byKey[key] = { fecha: fecha, variante: variante, sumVal: 0, sumN: 0, best: 0, peso: 0, reps: 0, dia: '', volume: 0, timed: timed });
    s.sumVal += val * n; s.sumN += n;
    s.volume += timed ? reps * n : peso * reps * n;
    if (val > s.best) { s.best = val; s.peso = peso; s.reps = reps; s.dia = r['Día'] || ''; }
  });
  return Object.keys(byKey).sort().map(k => {
    const s = byKey[k];
    s.value = timed ? s.best : s.sumVal / s.sumN;
    s.nSets = s.sumN;
    return s;
  });
}

// ---------- Máquinas (variantes) ----------
// Una sesión en la máquina secundaria mueve otro peso (a veces +25 %, a veces -20 %). Mezclada con las de la
// habitual mete mucho ruido: en simulación (tools/sim/sim_variantes.py) anunciaba una mejora o un retroceso
// falsos en el 61-73 % de los casos sin cambio real (y en el 100 % si las últimas sesiones eran en la secundaria).
// Lo que se hace: se toma una máquina de REFERENCIA (la más usada en las últimas 8 sesiones, normalmente la
// habitual) y las demás se AJUSTAN a su escala con el cociente típico frente a las sesiones de referencia vecinas
// (solo si hay al menos 2 sesiones de esa máquina entre sesiones de referencia; si no, no entran). Con esto la
// detección queda casi como sin variantes (49-51 % frente a 53 %) y las falsas alarmas en el 14 %.
const PG_REF_WINDOW = 8;
const PG_MIN_BRACKETS = 2;

function pgMachineLabel(name){ return name || 'Habitual'; }

function pgReferenceMachine(sess){
  const cnt = {};
  sess.slice(-PG_REF_WINDOW).forEach(x => { cnt[x.variante] = (cnt[x.variante] || 0) + 1; });
  let best = '', bc = -1;
  Object.keys(cnt).forEach(m => { if (cnt[m] > bc || (cnt[m] === bc && m === '')) { best = m; bc = cnt[m]; } });
  return best;
}

// { máquina: factor } que lleva sus sesiones a la escala de la de referencia (solo las que se pueden ajustar)
function pgMachineFactors(sess, ref){
  const ratios = {};
  sess.forEach((x, i) => {
    if (x.variante === ref) return;
    let b = null, a = null;
    for (let j = i - 1; j >= 0; j--) if (sess[j].variante === ref) { b = sess[j].value; break; }
    for (let j = i + 1; j < sess.length; j++) if (sess[j].variante === ref) { a = sess[j].value; break; }
    if (b !== null && a !== null && x.value > 0) (ratios[x.variante] = ratios[x.variante] || []).push(((b + a) / 2) / x.value);
  });
  const out = {};
  Object.keys(ratios).forEach(m => {
    if (ratios[m].length < PG_MIN_BRACKETS) return;
    const r = ratios[m].slice().sort((p, q) => p - q), h = r.length >> 1;
    out[m] = r.length % 2 ? r[h] : (r[h - 1] + r[h]) / 2;
  });
  return out;
}

// Serie que se dibuja y de la que salen cambio, tendencia y avisos.
//   mode 'auto'  -> máquina de referencia + las demás ajustadas (si se puede)
//   mode 'm:<nombre>' -> solo esa máquina, sin ajustar ('m:' = la habitual)
// Devuelve { sessions, ref, machines:[{name,n}], factors, adjusted, excluded }.
function pgBuildSeries(sess, mode){
  const ref = pgReferenceMachine(sess);
  const cnt = {};
  sess.forEach(x => { cnt[x.variante] = (cnt[x.variante] || 0) + 1; });
  const machines = Object.keys(cnt).map(m => ({ name: m, n: cnt[m] }))
    .sort((p, q) => (p.name === ref ? -1 : q.name === ref ? 1 : q.n - p.n));
  const factors = pgMachineFactors(sess, ref);
  let out, adjusted = 0;
  if (mode && mode.indexOf('m:') === 0) {
    const only = mode.slice(2);
    out = sess.filter(x => x.variante === only).map(x => Object.assign({}, x, { adj: null }));
  } else {
    out = [];
    sess.forEach(x => {
      if (x.variante === ref) out.push(Object.assign({}, x, { adj: null }));
      else if (factors[x.variante]) { adjusted++; out.push(Object.assign({}, x, { rawValue: x.value, value: x.value * factors[x.variante], adj: factors[x.variante] })); }
    });
  }
  return { sessions: out, ref: ref, machines: machines, factors: factors, adjusted: adjusted, excluded: sess.length - out.length };
}

// Serie estándar de un ejercicio (la que usan tarjeta, hoja, Resumen y Métricas)
function exerciseSeries(ejercicio, dia, mode){
  return pgBuildSeries(exerciseSessions(ejercicio, dia), mode || 'auto');
}

// Valor de un ejercicio en una semana (la que empieza en weekStart): media de sus sesiones de esa semana
// (en la métrica de fuerza estimada) y la mejor serie para mostrarla. null si no hay sesiones. dia es opcional.
function pgWeekValue(ejercicio, weekStart, dia){
  const end = new Date(weekStart); end.setDate(end.getDate() + 7);
  const sess = exerciseSeries(ejercicio, dia).sessions.filter(x => { const f = parseLocalDate(x.fecha); return f >= weekStart && f < end; });
  if (!sess.length) return null;
  const best = sess.reduce((a, b) => (b.best > a.best ? b : a));
  return { value: pgMean(sess.map(x => x.value)), peso: best.peso, reps: best.reps, variante: best.variante, sessions: sess.length, timed: best.timed };
}

// ¿Hubo alguna sesión (de cualquier máquina) en esa semana? Para distinguir "no se hizo" de "solo en otra máquina"
function pgWeekHasAny(ejercicio, weekStart, dia){
  const end = new Date(weekStart); end.setDate(end.getDate() + 7);
  return exerciseSessions(ejercicio, dia).some(x => { const f = parseLocalDate(x.fecha); return f >= weekStart && f < end; });
}

// Días de la rutina en los que se ha registrado este ejercicio (nombres cortos, p. ej. "Día 1")
function exerciseDayLabels(ejercicio){
  const seen = [];
  myRows().forEach(r => {
    if (r['Ejercicio'] !== ejercicio || isWarmupRow(r)) return;
    const d = String(r['Día'] || '').split('·')[0].trim();
    if (d && seen.indexOf(d) < 0) seen.push(d);
  });
  return seen.sort();
}

function pgMean(a){ return a.reduce((x, y) => x + y, 0) / a.length; }

// Media móvil de hasta 3 sesiones (la que acaba en cada punto): la línea "de tendencia"
function pgTrend(values){
  return values.map((_, i) => pgMean(values.slice(Math.max(0, i - 2), i + 1)));
}

// Cambio reciente: media de las últimas w sesiones frente a las w anteriores (w = 3 si hay 6+ sesiones;
// con pocas sesiones se reduce hasta comparar con la anterior). Devuelve { pct, w } o null.
function pgChange(values){
  const n = values.length;
  if (n < 2) return null;
  const w = Math.min(3, Math.floor(n / 2));
  const prior = pgMean(values.slice(-2 * w, -w));
  return prior > 0 ? { pct: (pgMean(values.slice(-w)) / prior - 1) * 100, w: w } : null;
}

function pgChangeLabel(w){ return w === 1 ? 'frente a la sesión anterior' : 'últimas ' + w + ' frente a las ' + w + ' anteriores'; }

// Con 8+ sesiones: cambio total estimado por regresión lineal sobre las últimas 8, en %.
// "sin tendencia" si es < 1,5 % (en simulación avisa en el 82 % de los casos planos y solo en el 25 % de los que suben 6 %).
function pgTrendInfo(values){
  if (values.length < PG_TREND_N) return null;
  const v = values.slice(-PG_TREND_N), n = v.length;
  const mx = (n - 1) / 2, my = pgMean(v);
  let num = 0, den = 0;
  v.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) * (i - mx); });
  const pct = my > 0 ? (num / den) * (n - 1) / my * 100 : 0;
  return { pct: pct, n: n, stagnant: pct < 1.5 };
}

// ---------- Mini gráfica (tarjeta) ----------
function pgSparkline(values){
  const W = 300, H = 60, p = 10, n = values.length;
  const mn = Math.min.apply(null, values), mx = Math.max.apply(null, values), sp = Math.max(mx - mn, 1);
  const xy = vs => vs.map((v, i) => [p + i * (W - 2 * p) / (n - 1), H - p - (v - mn) / sp * (H - 2 * p)]);
  const str = pts => pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const raw = xy(values);
  const trendOn = n >= 3;
  const main = trendOn ? xy(pgTrend(values)) : raw;
  const last = main[main.length - 1];
  const area = 'M' + main[0][0].toFixed(1) + ',' + H + ' L' + str(main).replace(/ /g, ' L') + ' L' + last[0].toFixed(1) + ',' + H + 'Z';
  return '<svg class="pg-spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
    '<path class="pg-area" d="' + area + '"/>' +
    (trendOn ? '<polyline class="pg-line" pathLength="1" points="' + str(raw) + '"/>' : '') +
    '<polyline class="pg-trend" pathLength="1" points="' + str(main) + '"/>' +
    '<circle class="pg-halo" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="9"/>' +
    '<circle class="pg-dot" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4.5"/></svg>';
}

// Aviso breve bajo la gráfica cuando hay más de una máquina
function pgMachineNote(ser){
  const t = [];
  if (ser.ref) t.push('Máquina de referencia: ' + escHtml(ser.ref));
  if (ser.adjusted) t.push('incluye ' + ser.adjusted + (ser.adjusted === 1 ? ' sesión' : ' sesiones') + ' de otra máquina, ajustada' + (ser.adjusted === 1 ? '' : 's'));
  if (!ser.adjusted && ser.excluded) t.push(ser.excluded + (ser.excluded === 1 ? ' sesión en otra máquina no entra' : ' sesiones en otra máquina no entran') + ' (faltan datos para ajustarla)');
  return t.length ? '<div class="pg-mnote">' + t.join(' · ') + '</div>' : '';
}

// Rellena el bloque .pg de una tarjeta (se llama desde updateCardHighlights)
function renderCardProgress(cardEl){
  const box = cardEl.querySelector('.pg');
  if (!box) return;
  const name = cardEl.getAttribute('data-exercise');
  const timed = isTimedExercise(name);
  const ser = exerciseSeries(name);
  const sess = ser.sessions.slice(-PG_CARD_POINTS);
  if (sess.length === 0) {
    box.disabled = true;
    box.innerHTML = '<div class="pg-empty">Aún sin historial: tu primera sesión aparecerá aquí como gráfica.</div>';
    return;
  }
  box.disabled = false;
  const values = sess.map(s => s.value);
  const cur = values[values.length - 1];
  const ch = pgChange(values);
  let deltaHtml = '';
  if (ch) {
    const cls = Math.abs(ch.pct) < 0.05 ? '' : (ch.pct > 0 ? ' up' : ' down');
    const txt = Math.abs(ch.pct) < 0.05 ? 'Sin cambios' : (ch.pct > 0 ? '▲ +' : '▼ ') + pgNum(ch.pct) + ' %';
    deltaHtml = '<span class="pg-delta' + cls + '" title="Cambio: ' + pgChangeLabel(ch.w) + '">' + txt + '</span>';
  }
  const cap = (timed ? 'Mejor serie' : 'Fuerza estimada') + ' · ' + (ch ? 'cambio ' + pgChangeLabel(ch.w) : 'primera sesión');
  box.innerHTML =
    '<div class="pg-row"><div><div class="pg-big">' + pgNum(cur) + '<small>' + (timed ? 's' : 'kg') + '</small></div>' +
    '<div class="pg-cap">' + cap + '</div></div>' + deltaHtml + '</div>' +
    (sess.length > 1 ? pgSparkline(values) : '') +
    pgMachineNote(ser) +
    '<div class="pg-more">Toca para ver el detalle</div>';
  pgDrawWhenVisible(box);
}

// La línea se dibuja una vez, la primera vez que la tarjeta queda a la vista. Si ya se vio (o no hay
// IntersectionObserver / se pide reducir movimiento) la gráfica se muestra entera, sin animar.
function pgDrawWhenVisible(box){
  if (box.dataset.seen || typeof IntersectionObserver === 'undefined' || !motionOK()) return;
  const svg = box.querySelector('.pg-spark');
  if (!svg) return;
  svg.classList.add('pre');
  if (box._pgObs) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      box.dataset.seen = '1';
      const cur = box.querySelector('.pg-spark');
      if (cur) { cur.classList.remove('pre'); cur.classList.add('draw'); }
      io.disconnect(); box._pgObs = null;
    });
  }, { threshold: 0.6 });
  box._pgObs = io;
  io.observe(box);
}

// ---------- Gráfica grande (hoja de detalle) ----------
function pgBigChart(sess, timed){
  const W = 340, H = 200, L = 38, R = 14, T = 18, B = 28, n = sess.length;
  const vals = sess.map(s => s.value);
  const lo = Math.max(0, Math.floor((Math.min.apply(null, vals) - 1) / 5) * 5);
  let hi = Math.ceil((Math.max.apply(null, vals) + 1) / 5) * 5;
  if (hi - lo < 10) hi = lo + 10;
  const x = i => n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const best = Math.max.apply(null, vals);
  const today = localDateStr();
  let s = '<svg class="pg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución de ' + (timed ? 'la mejor serie' : 'tu fuerza estimada') + '">';
  [lo, (lo + hi) / 2, hi].forEach(t => {
    s += '<line class="pg-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/>' +
         '<text class="pg-tk" x="' + (L - 6) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end">' + Math.round(t) + '</text>';
  });
  s += '<line class="pg-pr" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(best).toFixed(1) + '" y2="' + y(best).toFixed(1) + '"/>';
  s += '<text class="pg-prl" x="' + L + '" y="' + (y(best) - 5).toFixed(1) + '">Mejor ' + Math.round(best) + '</text>';
  if (n > 1) s += '<polyline class="pg-ln" points="' + sess.map((q, i) => x(i).toFixed(1) + ',' + y(q.value).toFixed(1)).join(' ') + '"/>';
  if (n >= 3) s += '<polyline class="pg-trendln" points="' + pgTrend(vals).map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '"/>';
  sess.forEach((q, i) => {
    if (i === n - 1) s += '<circle class="pg-halo" cx="' + x(i).toFixed(1) + '" cy="' + y(q.value).toFixed(1) + '" r="11"/>';
    s += '<circle class="pg-pt' + (q.adj ? ' hol' : '') + '" cx="' + x(i).toFixed(1) + '" cy="' + y(q.value).toFixed(1) + '" r="' + (i === n - 1 ? 6 : 4.5) + '"/>';
  });
  s += '<text class="pg-tk" x="' + x(0).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (n === 1 ? 'middle' : 'start') + '">' + pgDate(sess[0].fecha) + '</text>';
  if (n > 1) s += '<text class="pg-tk" x="' + x(n - 1).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="end">' + (sess[n - 1].fecha === today ? 'Hoy' : pgDate(sess[n - 1].fecha)) + '</text>';
  return s + '</svg>';
}

function pgVolumeChart(sess){
  const W = 340, H = 64, n = sess.length, gap = 6;
  const vols = sess.map(s => s.volume);
  const mx = Math.max.apply(null, vols) || 1;
  const bw = (W - gap * (n - 1)) / n;
  let s = '<svg class="pg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Volumen por sesión">';
  vols.forEach((v, i) => {
    const h = Math.max(6, v / mx * (H - 6));
    s += '<rect class="pg-bar' + (i === n - 1 ? ' last' : '') + '" x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4"/>';
  });
  return s + '</svg>';
}

// ---------- Hoja de detalle ----------
let _pgPrevOverflow = '';

function ensurePgSheet(){
  let sheet = document.getElementById('pgSheet');
  if (sheet) return sheet;
  const scrim = document.createElement('div');
  scrim.id = 'pgScrim'; scrim.className = 'pg-scrim';
  scrim.onclick = closeProgressSheet;
  sheet = document.createElement('aside');
  sheet.id = 'pgSheet'; sheet.className = 'pg-sheet';
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  document.body.appendChild(scrim);
  document.body.appendChild(sheet);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProgressSheet(); });
  return sheet;
}

let _pgSheetEx = '', _pgSheetMode = 'auto', _pgSheetModes = [];

// Abre la hoja de detalle de un ejercicio (por defecto con la serie estándar: referencia + ajustadas)
function openProgressSheet(ejercicio){
  if (exerciseSessions(ejercicio).length === 0) return;
  _pgSheetEx = ejercicio; _pgSheetMode = 'auto';
  const sheet = ensurePgSheet();
  renderProgressSheet();
  _pgPrevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.getElementById('pgScrim').classList.add('on');
  sheet.classList.add('on');
  sheet.scrollTop = 0;
  sheet.querySelector('#pgClose').focus();
}

// Cambia de máquina en la hoja abierta (i = posición en la lista de opciones)
function pgPickMachine(i){
  if (!_pgSheetModes[i]) return;
  _pgSheetMode = _pgSheetModes[i];
  const sheet = document.getElementById('pgSheet'), top = sheet.scrollTop;
  renderProgressSheet();
  sheet.scrollTop = top;
  const btn = sheet.querySelector('.pg-mchip[aria-pressed="true"]');
  if (btn) btn.focus({ preventScroll: true });
}

function renderProgressSheet(){
  const ejercicio = _pgSheetEx, timed = isTimedExercise(ejercicio);
  const all = exerciseSessions(ejercicio);
  let ser = pgBuildSeries(all, _pgSheetMode);
  if (ser.sessions.length === 0) { _pgSheetMode = 'auto'; ser = pgBuildSeries(all, 'auto'); }
  const sess = ser.sessions.slice(-PG_SHEET_POINTS);
  const values = sess.map(s => s.value);
  const cur = values[values.length - 1];
  const best = Math.max.apply(null, values);
  const days = exerciseDayLabels(ejercicio);
  const sumDays = days.length > 1 ? ', sumando todos los días en que haces este ejercicio' : '';
  const single = _pgSheetMode.indexOf('m:') === 0;

  // Mensaje de tendencia: con 8+ sesiones, regresión; con 6-7, primeras 3 frente a últimas 3; con menos, no se afirma nada
  const info = pgTrendInfo(values);
  let note;
  if (info) {
    const p = pgNum(Math.abs(info.pct));
    if (info.stagnant && info.pct > -1.5) note = '<b>Sin tendencia al alza en las últimas ' + info.n + ' sesiones</b> (cambio estimado ' + (info.pct >= 0 ? '+' : '−') + p + ' %' + sumDays + '). Puede ser buen momento para añadir una repetición antes de subir peso.';
    else if (info.stagnant) note = '<b>Tendencia a la baja</b> en las últimas ' + info.n + ' sesiones (' + '−' + p + ' %' + sumDays + '). Revisa descanso, sueño o si cambió la variante.';
    else note = '<b>Tendencia al alza:</b> +' + p + ' % en las últimas ' + info.n + ' sesiones' + sumDays + '.';
  } else if (values.length >= 6) {
    const d = (pgMean(values.slice(-3)) / pgMean(values.slice(0, 3)) - 1) * 100;
    note = '<b>' + (d >= 0 ? '+' : '−') + pgNum(Math.abs(d)) + ' %</b> desde el ' + pgDate(sess[0].fecha) + ' (media de las últimas 3 sesiones frente a las 3 primeras' + sumDays + '). Con 8 sesiones podré decirte si hay tendencia o estancamiento.';
  } else {
    note = 'Con 8 o más sesiones verás aquí si hay tendencia al alza o estancamiento. Con pocas sesiones, un solo día flojo o bueno cambia mucho la lectura.';
  }

  // Selector de máquina (solo si se ha usado más de una)
  _pgSheetModes = [];
  let machinesHtml = '';
  if (ser.machines.length > 1) {
    const chip = (label, mode) => {
      _pgSheetModes.push(mode);
      return '<button type="button" class="pg-mchip" aria-pressed="' + (_pgSheetMode === mode) + '" onclick="pgPickMachine(' + (_pgSheetModes.length - 1) + ')">' + label + '</button>';
    };
    machinesHtml = '<div class="pg-mlabel">Máquina</div><div class="pg-machines">' +
      chip('Combinada', 'auto') +
      ser.machines.map(m => chip(escHtml(pgMachineLabel(m.name)) + ' (' + m.n + ')', 'm:' + m.name)).join('') + '</div>';
    let hint;
    if (single) {
      hint = 'Solo las sesiones en <b>' + escHtml(pgMachineLabel(_pgSheetMode.slice(2))) + '</b>. Las de otras máquinas no se muestran.';
    } else {
      const f = Object.keys(ser.factors).map(m => escHtml(pgMachineLabel(m)) + ' ×' + fmtNum(ser.factors[m], 2)).join(', ');
      hint = 'Referencia: <b>' + escHtml(pgMachineLabel(ser.ref)) + '</b>.' +
        (ser.adjusted ? ' Sesiones de otras máquinas ajustadas a su escala (' + f + '), para que un peso distinto no parezca progreso ni retroceso.' : '') +
        (ser.excluded ? ' ' + ser.excluded + (ser.excluded === 1 ? ' sesión no entra' : ' sesiones no entran') + ': para ajustar una máquina hacen falta al menos ' + PG_MIN_BRACKETS + ' sesiones suyas entre sesiones de la de referencia.' : '');
    }
    machinesHtml += '<p class="pg-hint">' + hint + '</p>';
  }

  // Últimas sesiones (de todas las máquinas), diciendo cuáles entran en la gráfica
  const included = {};
  ser.sessions.forEach(x => { included[x.fecha + '|' + x.variante] = x; });
  const rows = all.slice().reverse().slice(0, 6).map(x => {
    const detail = timed ? x.reps + ' s' : pgKg(x.peso) + ' kg × ' + x.reps;
    const inc = included[x.fecha + '|' + x.variante];
    let tag = '';
    if (x.variante || !inc) {
      const bits = [];
      if (x.variante) bits.push(escHtml(x.variante));
      if (inc && inc.adj) bits.push('ajustada ×' + fmtNum(inc.adj, 2));
      if (!inc) bits.push('no entra');
      tag = ' <small>(' + bits.join(', ') + ')</small>';
    }
    const dayShort = String(x.dia).split('·')[0].trim();
    return '<div class="pg-sess"><span>' + (x.fecha === localDateStr() ? 'Hoy' : pgDate(x.fecha)) + '</span>' +
      '<span>' + (timed ? '' : 'mejor ') + detail + tag + '</span>' +
      '<small>' + escHtml(dayShort) + (timed ? '' : ' · ' + pgNum(inc ? inc.value : x.value)) + '</small></div>';
  }).join('');

  const sheet = ensurePgSheet();
  sheet.style.setProperty('--c', (typeof dayColorVar === 'function' ? dayColorVar(currentDay) : 'var(--blue)'));
  sheet.setAttribute('aria-label', 'Progresión de ' + ejercicio);
  sheet.innerHTML = '<div class="pg-grab"></div>' +
    '<div class="pg-shead"><div><h2>' + escHtml(ejercicio) + '</h2>' +
    (days.length ? '<div class="pg-where">' + days.map(d => '<span class="pg-chip">' + escHtml(d) + '</span>').join('') + '</div>' : '') +
    '</div><button class="pg-close" type="button" id="pgClose" aria-label="Cerrar">✕</button></div>' +
    (days.length > 1 ? '<p class="pg-hint">Este ejercicio se hace en varios días: la gráfica los junta todos.</p>' : '') +
    machinesHtml +
    '<div class="pg-stats"><div class="pg-stat"><b>' + pgNum(cur) + '</b><span>' + (timed ? 'Última (s)' : 'Fuerza actual (kg)') + '</span></div>' +
    '<div class="pg-stat"><b>' + pgNum(best) + '</b><span>' + (timed ? 'Mejor (s)' : 'Mejor sesión (kg)') + '</span></div>' +
    '<div class="pg-stat"><b>' + sess.length + '</b><span>Sesiones</span></div></div>' +
    pgBigChart(sess, timed) +
    '<div class="pg-leg"><span><i></i>Sesión</span>' + (sess.length >= 3 ? '<span><i class="t"></i>Tendencia (media de 3)</span>' : '') + (sess.some(x => x.adj) ? '<span><i class="h"></i>Ajustada desde otra máquina</span>' : '') + '<span>Línea punteada: mejor marca</span></div>' +
    '<div class="pg-note">' + note + '</div>' +
    '<div class="pg-sec">Volumen por sesión</div>' + pgVolumeChart(sess) +
    '<div class="pg-hint" style="margin-top:6px">Mide cuánto trabajo acumulas, no cuánto de fuerte eres: sube si haces más series aunque no mejores' + (ser.machines.length > 1 ? ' (y no se ajusta entre máquinas)' : '') + '.</div>' +
    '<div class="pg-sec">Últimas sesiones</div>' + rows +
    (timed ? '' : '<div class="pg-foot">Fuerza estimada = media de tus series de trabajo con la fórmula peso × (reps elevadas a 0,10). Pesa menos las repeticiones que el 1RM de Epley, por eso no coincide con el 1RM de otras pantallas, pero detecta mejor si progresas.</div>');
  sheet.querySelector('#pgClose').onclick = closeProgressSheet;
}

function closeProgressSheet(){
  const sheet = document.getElementById('pgSheet');
  if (!sheet || !sheet.classList.contains('on')) return;
  sheet.classList.remove('on');
  document.getElementById('pgScrim').classList.remove('on');
  document.body.style.overflow = _pgPrevOverflow;
}
