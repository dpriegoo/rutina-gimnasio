// =====================================================================
// Gráficas de progresión por ejercicio  (progress-chart.js)
// Mini gráfica en cada tarjeta (últimas sesiones) y hoja de detalle al tocarla.
// Los datos salen de window._progressCache filtrando por NOMBRE de ejercicio (no por día):
// un ejercicio que se hace en varios días (p. ej. press banca) junta todas sus sesiones.
// El calentamiento nunca cuenta (regla transversal). Sin librerías: SVG a mano.
// Depende de: utils (myRows, isWarmupRow, parseLocalDate, localDateStr, escHtml, jsArg),
//             routine (isTimedExercise).
// =====================================================================

const PG_CARD_POINTS = 8;    // sesiones que se dibujan en la tarjeta
const PG_SHEET_POINTS = 12;  // sesiones que se dibujan en la hoja de detalle
const PG_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function pgNum(v){ return String(Math.round(v * 10) / 10); }
// Cargas reales (discos de 1,25 kg): hasta 2 decimales, sin ceros sobrantes
function pgKg(v){ return String(Math.round(v * 100) / 100); }

function pgDate(fecha){
  const d = parseLocalDate(fecha);
  return d.getDate() + ' ' + PG_MONTHS[d.getMonth()];
}

// Una entrada por fecha: su mejor serie (1RM Epley, o segundos en ejercicios por tiempo),
// el volumen total de ese día y la variante/día con que se hizo esa mejor serie.
function exerciseSessions(ejercicio){
  const timed = isTimedExercise(ejercicio);
  const byDate = {};
  myRows().forEach(r => {
    if (r['Ejercicio'] !== ejercicio || isWarmupRow(r)) return;
    const fecha = String(r['Fecha']).slice(0, 10);
    const peso = Number(r['Peso (kg)']) || 0;
    const reps = Number(r['Reps']) || 0;
    const series = Number(r['Series']) || 1;
    const value = timed ? reps : (reps ? peso * (1 + reps / 30) : 0);
    if (!(value > 0)) return;
    const s = byDate[fecha] || (byDate[fecha] = { fecha: fecha, value: 0, peso: 0, reps: 0, variante: '', dia: '', volume: 0, timed: timed });
    s.volume += timed ? reps * series : peso * reps * series;
    if (value > s.value) {
      s.value = value; s.peso = peso; s.reps = reps;
      s.variante = r['Variante'] || '';
      s.dia = r['Día'] || '';
    }
  });
  return Object.keys(byDate).sort().map(k => byDate[k]);
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

// true si las últimas 3 sesiones no han subido (variación < 1,5 % entre máximo y mínimo)
function pgIsStagnant(values){
  if (values.length < 3) return false;
  const l = values.slice(-3);
  const hi = Math.max.apply(null, l), lo = Math.min.apply(null, l);
  return hi > 0 && (hi - lo) / hi < 0.015;
}

function pgDeltaPct(values){
  if (values.length < 2) return null;
  const prev = values[values.length - 2], cur = values[values.length - 1];
  return prev > 0 ? (cur / prev - 1) * 100 : null;
}

// ---------- Mini gráfica (tarjeta) ----------
function pgSparkline(values){
  const W = 300, H = 60, p = 10, n = values.length;
  const mn = Math.min.apply(null, values), mx = Math.max.apply(null, values), sp = Math.max(mx - mn, 1);
  const pts = values.map((v, i) => [p + i * (W - 2 * p) / (n - 1), H - p - (v - mn) / sp * (H - 2 * p)]);
  const line = pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const area = 'M' + pts[0][0].toFixed(1) + ',' + H + ' L' + line.replace(/ /g, ' L') + ' L' + last[0].toFixed(1) + ',' + H + 'Z';
  return '<svg class="pg-spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
    '<path class="pg-area" d="' + area + '"/><polyline class="pg-line" points="' + line + '"/>' +
    '<circle class="pg-halo" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="9"/>' +
    '<circle class="pg-dot" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4.5"/></svg>';
}

// Rellena el bloque .pg de una tarjeta (se llama desde updateCardHighlights)
function renderCardProgress(cardEl){
  const box = cardEl.querySelector('.pg');
  if (!box) return;
  const name = cardEl.getAttribute('data-exercise');
  const timed = isTimedExercise(name);
  const sess = exerciseSessions(name).slice(-PG_CARD_POINTS);
  if (sess.length === 0) {
    box.disabled = true;
    box.innerHTML = '<div class="pg-empty">Aún sin historial: tu primera sesión aparecerá aquí como gráfica.</div>';
    return;
  }
  box.disabled = false;
  const values = sess.map(s => s.value);
  const cur = values[values.length - 1];
  const delta = pgDeltaPct(values);
  let deltaHtml = '';
  if (delta !== null) {
    const cls = Math.abs(delta) < 0.05 ? '' : (delta > 0 ? ' up' : ' down');
    const txt = Math.abs(delta) < 0.05 ? 'Sin cambios' : (delta > 0 ? '▲ +' : '▼ ') + pgNum(delta) + ' %';
    deltaHtml = '<span class="pg-delta' + cls + '">' + txt + '</span>';
  }
  const cap = (timed ? 'Mejor serie' : '1RM estimado') + ' · ' + (sess.length > 1 ? 'últimas ' + sess.length + ' sesiones' : 'primera sesión');
  box.innerHTML =
    '<div class="pg-row"><div><div class="pg-big">' + pgNum(cur) + '<small>' + (timed ? 's' : 'kg') + '</small></div>' +
    '<div class="pg-cap">' + cap + '</div></div>' + deltaHtml + '</div>' +
    (sess.length > 1 ? pgSparkline(values) : '') +
    '<div class="pg-more">Toca para ver el detalle</div>';
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
  let s = '<svg class="pg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución de ' + (timed ? 'la mejor serie' : 'tu 1RM estimado') + '">';
  [lo, (lo + hi) / 2, hi].forEach(t => {
    s += '<line class="pg-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/>' +
         '<text class="pg-tk" x="' + (L - 6) + '" y="' + (y(t) + 3.5).toFixed(1) + '" text-anchor="end">' + Math.round(t) + '</text>';
  });
  s += '<line class="pg-pr" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(best).toFixed(1) + '" y2="' + y(best).toFixed(1) + '"/>';
  s += '<text class="pg-prl" x="' + L + '" y="' + (y(best) - 5).toFixed(1) + '">Mejor ' + Math.round(best) + '</text>';
  if (n > 1) s += '<polyline class="pg-ln" points="' + sess.map((q, i) => x(i).toFixed(1) + ',' + y(q.value).toFixed(1)).join(' ') + '"/>';
  sess.forEach((q, i) => {
    if (i === n - 1) s += '<circle class="pg-halo" cx="' + x(i).toFixed(1) + '" cy="' + y(q.value).toFixed(1) + '" r="11"/>';
    s += '<circle class="pg-pt' + (q.variante ? ' hol' : '') + '" cx="' + x(i).toFixed(1) + '" cy="' + y(q.value).toFixed(1) + '" r="' + (i === n - 1 ? 6 : 4.5) + '"/>';
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

function openProgressSheet(ejercicio){
  const timed = isTimedExercise(ejercicio);
  const sess = exerciseSessions(ejercicio).slice(-PG_SHEET_POINTS);
  if (sess.length === 0) return;
  const values = sess.map(s => s.value);
  const cur = values[values.length - 1];
  const best = Math.max.apply(null, values);
  const first = values[0];
  const unit = timed ? 's' : 'kg';
  const days = exerciseDayLabels(ejercicio);

  let note;
  if (sess.length < 3) {
    note = 'Con 3 o más sesiones verás aquí si estás subiendo o estancado.';
  } else if (pgIsStagnant(values)) {
    note = '<b>3 sesiones sin subir.</b> Lo estimado lleva estable desde el ' + pgDate(sess[sess.length - 3].fecha) + '. Puede ser buen momento para añadir una repetición antes de subir peso.';
  } else {
    const tot = (cur / first - 1) * 100;
    note = '<b>Vas ' + (tot >= 0 ? 'arriba' : 'abajo') + ' un ' + pgNum(Math.abs(tot)) + ' %</b> desde el ' + pgDate(sess[0].fecha) + (days.length > 1 ? ', sumando todos los días en que haces este ejercicio.' : '.');
  }
  const hasVariant = sess.some(s => s.variante);
  const rows = sess.slice().reverse().slice(0, 6).map(s => {
    const detail = timed ? s.reps + ' s' : pgKg(s.peso) + ' kg × ' + s.reps;
    const dayShort = String(s.dia).split('·')[0].trim();
    return '<div class="pg-sess"><span>' + (s.fecha === localDateStr() ? 'Hoy' : pgDate(s.fecha)) + '</span>' +
      '<span>' + detail + (s.variante ? ' <small>(' + escHtml(s.variante) + ')</small>' : '') + '</span>' +
      '<small>' + escHtml(dayShort) + (timed ? '' : ' · 1RM ' + pgNum(s.value)) + '</small></div>';
  }).join('');

  const sheet = ensurePgSheet();
  sheet.style.setProperty('--c', (typeof dayColorVar === 'function' ? dayColorVar(currentDay) : 'var(--blue)'));
  sheet.innerHTML = '<div class="pg-grab"></div>' +
    '<div class="pg-shead"><div><h2>' + escHtml(ejercicio) + '</h2>' +
    (days.length ? '<div class="pg-where">' + days.map(d => '<span class="pg-chip">' + escHtml(d) + '</span>').join('') + '</div>' : '') +
    '</div><button class="pg-close" type="button" id="pgClose" aria-label="Cerrar">✕</button></div>' +
    (days.length > 1 ? '<p class="pg-hint">Este ejercicio se hace en varios días: la gráfica los junta todos.</p>' : '') +
    '<div class="pg-stats"><div class="pg-stat"><b>' + pgNum(cur) + '</b><span>' + (timed ? 'Última (s)' : '1RM actual (kg)') + '</span></div>' +
    '<div class="pg-stat"><b>' + pgNum(best) + '</b><span>' + (timed ? 'Mejor (s)' : 'Mejor marca (kg)') + '</span></div>' +
    '<div class="pg-stat"><b>' + sess.length + '</b><span>Sesiones</span></div></div>' +
    pgBigChart(sess, timed) +
    '<div class="pg-leg"><span><i></i>Sesión</span>' + (hasVariant ? '<span><i class="h"></i>Otra variante de máquina</span>' : '') + '<span>Línea punteada: mejor marca</span></div>' +
    '<div class="pg-note">' + note + '</div>' +
    '<div class="pg-sec">Volumen por sesión</div>' + pgVolumeChart(sess) +
    '<div class="pg-sec">Últimas sesiones</div>' + rows;
  sheet.querySelector('#pgClose').onclick = closeProgressSheet;

  _pgPrevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.getElementById('pgScrim').classList.add('on');
  sheet.classList.add('on');
  sheet.scrollTop = 0;
  sheet.querySelector('#pgClose').focus();
}

function closeProgressSheet(){
  const sheet = document.getElementById('pgSheet');
  if (!sheet || !sheet.classList.contains('on')) return;
  sheet.classList.remove('on');
  document.getElementById('pgScrim').classList.remove('on');
  document.body.style.overflow = _pgPrevOverflow;
}
