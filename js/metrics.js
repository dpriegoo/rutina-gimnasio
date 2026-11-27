// =====================================================================
// Métricas y gráficas  (metrics.js)
// Pestaña Métricas: mapa de calor, progreso por ejercicio, volumen semanal, índice de
// fuerza.
// Depende de: api, utils, muscles, history, body.
// =====================================================================

// ---- View switching ----
let metricsLoadedOnce = false;

// ---- Metrics: fetch + render ----
let progressChartInstance = null;

let volumeChartInstance = null;

// ---- Secciones de Métricas (Resumen · Cuerpo · Ejercicios · Datos): una pantalla por tema en vez de un scroll de 5 pantallas ----
const MT_SECTIONS = ['resumen', 'cuerpo', 'ejercicios', 'datos'];
function metricsSectionSaved(){
  let s = 'resumen';
  try { s = localStorage.getItem('mtSection') || 'resumen'; } catch (e) {}
  return MT_SECTIONS.indexOf(s) >= 0 ? s : 'resumen';
}
function setMetricsSection(sec){
  if (MT_SECTIONS.indexOf(sec) < 0) sec = 'resumen';
  try { localStorage.setItem('mtSection', sec); } catch (e) {}
  document.querySelectorAll('#metricasView [data-msec]').forEach(el => el.classList.toggle('mt-hidden', el.getAttribute('data-msec') !== sec));
  if (sec === 'ejercicios') { renderBaseCard(); if (typeof renderCalCard === 'function') renderCalCard(); if (typeof renderPlanPanel === 'function') renderPlanPanel(); }
  MT_SECTIONS.forEach(n => {
    const b = document.getElementById('mtTab' + n.charAt(0).toUpperCase() + n.slice(1)); if (!b) return;
    b.classList.toggle('on', n === sec); b.setAttribute('aria-pressed', String(n === sec));
  });
  // Chart.js mide mal un lienzo mientras está oculto: al enseñarlo se reajusta
  [progressChartInstance, volumeChartInstance, strengthIndexChartInstance, typeof weightChartInstance !== 'undefined' ? weightChartInstance : null]
    .forEach(c => { try { if (c) c.resize(); } catch (e) {} });
}

// Con muy pocos puntos una curva suavizada inventa formas que no existen: se avisa en lugar de dibujarla
const CHART_MIN_POINTS = 4;
function chartWrapOf(ctx){ return ctx && ctx.parentElement; }
function chartShow(ctx, show){ const w = chartWrapOf(ctx); if (w) w.style.display = show ? '' : 'none'; }

async function loadMetrics(force){
  const btn = document.getElementById('refreshBtn');
  btn.textContent = 'Cargando…';
  try {
    const data = await fetchSheetData();
    if (data && data.error === 'unauthorized') { handleUnauthorized(); return; }
    window._progressCache = data;
    window._lastSyncAt = Date.now();   // última vez que se leyó la base de datos (lo usa la exportación)
    try { localStorage.setItem('progressCache', JSON.stringify(data)); } catch(e) {}
    applyOutboxToCache();
    renderHeatmap();
    populateExerciseSelect();
    preloadHistorial();
    renderHistorial();
    renderProgressChart();
    renderVolumeChart();
    renderStrengthIndexChart();
    renderBaseCard();
    renderTabs();
    updateCardHighlights();
    loadBodyStats();
    maybeShowRebalanceModal();
    btn.innerHTML = uiIcon('refresh') + ' Actualizar datos';
  } catch (err) {
    btn.textContent = 'No se pudo cargar: reintentar';
  }
}

function renderHeatmap(){
  const rows = myRows();
  const counts = {};
  rows.forEach(r => {
    const f = String(r['Fecha']).slice(0,10);
    counts[f] = (counts[f] || 0) + 1;
  });

  const today = new Date();
  today.setHours(0,0,0,0);
  let days = [];
  for (let i = 97; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  while (days[0].getDay() !== 1) {
    const prev = new Date(days[0]);
    prev.setDate(prev.getDate() - 1);
    days.unshift(prev);
  }
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  function heatColor(n){
    if (!n) return 'var(--card-border)';
    if (n <= 2) return themeColor('heat1', '#1e3a72');
    if (n <= 5) return themeColor('heat2', '#274a94');
    if (n <= 9) return themeColor('heat3', '#3f7cf0');
    return themeColor('heat4', '#8ab4ff');
  }

  const grid = document.getElementById('heatmapGrid');
  grid.innerHTML = weeks.map(week => `
    <div class="heatmap-week">
      ${week.map(d => {
        const key = localDateStr(d);
        const n = counts[key] || 0;
        return `<div class="heatmap-cell" style="background:${heatColor(n)}" title="${key}: ${n} series"></div>`;
      }).join('')}
    </div>
  `).join('');

  const totalDays = Object.keys(counts).length;
  document.getElementById('heatmapSub').textContent = totalDays + ' días entrenados en los últimos ~3 meses';
}

function populateExerciseSelect(){
  const rows = myRows();
  const names = [...new Set(rows.map(r => r['Ejercicio']))].filter(Boolean);
  const sel = document.getElementById('exerciseSelect');
  const prevValue = sel.value;
  sel.innerHTML = names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (names.includes(prevValue)) sel.value = prevValue;

  populateHistorialDaySelect();
  populateHistorialExerciseSelect();
}

// Progresión de un ejercicio. Misma métrica que la hoja de cada ejercicio y el Resumen (ver progress-chart.js):
// una "fuerza estimada" por sesión (media de las series de trabajo) y su tendencia (media de 3 sesiones).
function renderProgressChart(){
  const rows = myRows().filter(r => !isWarmupRow(r));
  const exercise = document.getElementById('exerciseSelect').value;
  const timed = isTimedExercise(exercise);
  const ser = exercise ? exerciseSeries(exercise) : { sessions: [], machines: [], adjusted: 0, excluded: 0, ref: '' };
  const sess = ser.sessions;

  const labels = sess.map(s => s.fecha.slice(5));
  const values = sess.map(s => Math.round(s.value * 10) / 10);
  const trend = pgTrend(values).map(v => Math.round(v * 10) / 10);
  const T = chartTheme();

  const subEl = document.getElementById('progressSub');
  const ctx = document.getElementById('progressChart');
  if (progressChartInstance) { progressChartInstance.destroy(); progressChartInstance = null; }

  if (!window.Chart) {
    subEl.textContent = 'No se pudo cargar la librería de gráficos (revisa tu conexión y recarga).';
    return;
  }
  if (!exercise || labels.length === 0) {
    subEl.textContent = rows.length === 0
      ? 'Aún no hay registros para tu perfil.'
      : (ser.beforeBase ? 'El progreso de "' + exercise + '" cuenta desde el ' + pgDate(ser.base) + ' y aún no hay sesiones desde entonces.' : 'No hay registros de "' + exercise + '" todavía.');
    chartShow(ctx, false);
    return;
  }
  if (labels.length < CHART_MIN_POINTS) {
    subEl.textContent = 'Aún pocos datos: llevas ' + labels.length + (labels.length === 1 ? ' sesión' : ' sesiones') + ' de este ejercicio. Con ' + CHART_MIN_POINTS + ' o más verás la evolución.';
    chartShow(ctx, false);
    return;
  }
  chartShow(ctx, true);

  const common = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: T.text, font: { size: 11 } }, grid: { color: T.grid } },
      y: { ticks: { color: T.text, font: { size: 11 } }, grid: { color: T.grid } }
    }
  };

  if (timed) {
    subEl.textContent = 'Ejercicio por tiempo: mejor serie de cada sesión (segundos) · línea ámbar: tendencia (media de 3 sesiones)';
  } else {
    subEl.textContent = 'Línea azul: fuerza estimada de cada sesión (media de tus series de trabajo; con RIR anotado, cuenta reps + RIR) · línea ámbar: tendencia (media de 3 sesiones). Toca “Peso de la mejor serie” en la leyenda para verlo también.' +
      (ser.machines.length > 1 ? ' Varias máquinas: referencia ' + (ser.ref || 'habitual') + (ser.adjusted ? ', con ' + ser.adjusted + ' sesión(es) de otras máquinas ajustadas' : '') + (ser.excluded ? ', ' + ser.excluded + ' sin ajustar no entran' : '') + '.' : '');
  }
  if (ser.base) subEl.textContent += ' Cuenta desde el ' + pgDate(ser.base) + (ser.beforeBase ? ' (' + ser.beforeBase + ' sesiones anteriores no entran)' : '') + '.';
  const datasets = [
    { label: timed ? 'Mejor serie (s)' : 'Fuerza estimada (kg)', data: values, borderColor: timed ? T.green : T.blue,
      backgroundColor: timed ? T.greenFill : T.blueFill, tension: 0.3, fill: true, pointRadius: 3 },
    { label: 'Tendencia (media de 3)', data: trend, borderColor: T.amber, backgroundColor: 'transparent',
      borderDash: [5, 4], tension: 0.3, fill: false, pointRadius: 0, borderWidth: 3 },
  ];
  if (!timed) {
    datasets.push({ label: 'Peso de la mejor serie (kg)', data: sess.map(s => s.peso), borderColor: T.text, backgroundColor: 'transparent',
      tension: 0.3, fill: false, pointRadius: 2, borderWidth: 1.5, hidden: true });
  }
  progressChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: Object.assign({}, common, { plugins: { legend: { display: true, labels: { color: T.text, font: { size: 12 }, boxWidth: 12 } } } })
  });
}

function isoWeekLabel(dateStr){
  const d = parseLocalDate(dateStr);
  const monday = new Date(d);
  const day = (d.getDay() + 6) % 7;
  monday.setDate(d.getDate() - day);
  return localDateStr(monday).slice(5,10);
}

function renderVolumeChart(){
  const rows = myRows().filter(r => !isWarmupRow(r));
  const volumeByWeek = {};
  rows.forEach(r => {
    const week = isoWeekLabel(String(r['Fecha']));
    const vol = (Number(r['Peso (kg)']) || 0) * (Number(r['Reps']) || 0) * (Number(r['Series']) || 0);
    volumeByWeek[week] = (volumeByWeek[week] || 0) + vol;
  });
  const weekKeys = Object.keys(volumeByWeek).sort().slice(-10);
  const labels = weekKeys;
  const values = weekKeys.map(k => Math.round(volumeByWeek[k]));

  const subEl = document.getElementById('volumeSub');
  const ctx = document.getElementById('volumeChart');
  if (volumeChartInstance) { volumeChartInstance.destroy(); volumeChartInstance = null; }

  if (!window.Chart) {
    subEl.textContent = 'No se pudo cargar la librería de gráficos (revisa tu conexión y recarga).';
    return;
  }
  if (labels.length === 0) {
    subEl.textContent = 'Aún no hay suficientes registros para calcular el volumen semanal.';
    return;
  }
  subEl.textContent = 'Peso × reps × series sumado por semana — el mejor indicador de progreso para ganar músculo';

  volumeChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Volumen (kg)',
        data: values,
        backgroundColor: chartTheme().blue,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'Volumen: ' + fmtNum(c.parsed.y, 0) + ' kg' } } },
      scales: {
        x: { ticks: { color: chartTheme().text, font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: chartTheme().text, font: { size: 11 }, callback: v => fmtNum(v, 0) }, grid: { color: chartTheme().grid } }
      }
    }
  });
}

// ---- Índice de fuerza (tendencia de fondo, no solo esta semana vs. la pasada) ----
// Para cada ejercicio, su fuerza estimada (media de series de cada sesión) relativa a su primera sesión
// desde su fecha base (si no hay, la primera registrada); cada semana es la media de esos porcentajes entre todos los ejercicios.
function computeStrengthIndexByWeek(profile){
  const names = [];
  myRows().forEach(r => { const ex = r['Ejercicio']; if (ex && !isWarmupRow(r) && !isTimedExercise(ex) && names.indexOf(ex) < 0) names.push(ex); });
  if (names.length === 0) return { labels: [], values: [] };

  const baseline = {}, byWeekEx = {};
  names.forEach(ex => {
    const sess = exerciseSeries(ex).sessions;
    if (!sess.length || !(sess[0].value > 0)) return;
    baseline[ex] = sess[0].value;
    sess.forEach(x => {
      const wk = isoWeekLabel(x.fecha);
      if (!byWeekEx[wk]) byWeekEx[wk] = {};
      if (!byWeekEx[wk][ex]) byWeekEx[wk][ex] = [];
      byWeekEx[wk][ex].push(x.value);
    });
  });

  const weekKeys = Object.keys(byWeekEx).sort().slice(-12);
  const values = weekKeys.map(wk => {
    const exMap = byWeekEx[wk];
    const ratios = Object.keys(exMap).map(ex => (pgMean(exMap[ex]) / baseline[ex]) * 100);
    return Math.round(pgMean(ratios) * 10) / 10;
  });

  return { labels: weekKeys, values };
}

let strengthIndexChartInstance = null;

function renderStrengthIndexChart(){
  const profile = getProfile();
  const subEl = document.getElementById('strengthIndexSub');
  const ctx = document.getElementById('strengthIndexChart');
  if (strengthIndexChartInstance) { strengthIndexChartInstance.destroy(); strengthIndexChartInstance = null; }
  if (!subEl || !ctx) return;
  if (!window.Chart) { subEl.textContent = 'No se pudo cargar la librería de gráficos.'; return; }
  if (!profile) return;

  const { labels, values } = computeStrengthIndexByWeek(profile);
  if (labels.length < 3) {
    subEl.textContent = 'Aún pocos datos: necesitas al menos 3 semanas con registros para ver la tendencia de fondo (llevas ' + labels.length + ').';
    chartShow(ctx, false);
    return;
  }
  chartShow(ctx, true);
  const anyBase = typeof pgBasePrefs === 'function' && Object.keys(pgBasePrefs()).some(k => pgValidDate(pgBasePrefs()[k]));
  subEl.textContent = '100% = tu primera sesión ' + (anyBase ? 'desde la fecha en que cuenta cada ejercicio' : 'registrada de cada ejercicio') + ' (fuerza estimada: media de tus series de trabajo, sin calentamientos). Por encima de 100%, vas a más de media.';

  strengthIndexChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Índice de fuerza',
        data: values,
        borderColor: chartTheme().blue,
        backgroundColor: chartTheme().blueFill,
        tension: 0.3,
        fill: true,
        pointRadius: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: chartTheme().text, font: { size: 11 } }, grid: { color: chartTheme().grid } },
        y: { ticks: { color: chartTheme().text, font: { size: 11 }, callback: v => v + '%' }, grid: { color: chartTheme().grid } }
      }
    }
  });
}

// ---- Desde cuándo cuenta tu progreso (fecha base; la lógica está en progress-chart.js) ----
// Tarjeta de Métricas > Ejercicios: fecha general, ejercicios con fecha propia y reinicios de carga detectados
// (sugerencias que solo se aplican si las aceptas).
function baseExerciseNames(){
  const names = [];
  myRows().forEach(r => { const ex = r['Ejercicio']; if (ex && !isWarmupRow(r) && !isTimedExercise(ex) && names.indexOf(ex) < 0) names.push(ex); });
  return names.sort((a, b) => a.localeCompare(b, 'es'));
}
function baseSuggestions(){
  const out = [];
  baseExerciseNames().forEach(ex => {
    if (pgBaseInfo(ex).scope === 'ejercicio') return;   // ya elegiste a mano
    const s = pgSuggestBase(ex); if (s) out.push(Object.assign({ ej: ex }, s));
  });
  return out;
}
let _baseSug = [], _baseOwn = [];
function renderBaseCard(){
  const el = document.getElementById('baseCardBody'); if (!el || typeof pgBasePrefs !== 'function') return;
  const p = pgBasePrefs(), gen = pgValidDate(p[PG_BASE_ALL]) ? p[PG_BASE_ALL] : '';
  _baseSug = baseSuggestions();
  _baseOwn = Object.keys(p).filter(k => k !== PG_BASE_ALL).sort((a, b) => a.localeCompare(b, 'es'));
  const dm = f => pgDate(f) + ' ' + f.slice(0, 4);
  let h = '<div class="metric-sub" style="margin:0 0 10px;">Si al empezar la técnica era otra (más peso del que tocaba, que luego bajaste para hacerlo bien), esas sesiones no son comparables y hunden las gráficas. Elige desde cuándo cuentan: lo anterior se queda guardado, pero no entra en la gráfica, la tendencia, los avisos de estancamiento ni el índice de fuerza.</div>' +
    '<div class="metric-sub" style="margin:0 0 10px;">No hace falta empezar en el plan guiado: si anotas el RIR, la fuerza estimada cuenta reps + RIR, así que dejarte repeticiones en reserva no se ve como una bajada.</div>';
  h += '<label class="exp-field" for="baseGenDate">Fecha general (para todos los ejercicios sin fecha propia)<input type="date" id="baseGenDate" class="exp-date" value="' + gen + '" max="' + localDateStr() + '" onchange="baseSetGeneral(this.value)"></label>' +
    '<div class="metric-sub" style="margin:6px 0 0;">' + (gen ? 'Ahora cuenta desde el ' + dm(gen) + '. <button type="button" class="link-btn" onclick="baseSetGeneral(\'\')">Contar todo el historial</button>' : 'Ahora cuenta todo el historial.') + '</div>';
  if (_baseSug.length) {
    h += '<div class="metric-title" style="margin-top:14px;">Reinicios detectados</div>' +
      '<div class="metric-sub" style="margin:0 0 6px;">Bajaste la carga de golpe y no volviste arriba enseguida: suele ser rehacer la técnica. Revisa que sea eso antes de aplicarlo.</div>' +
      '<ul class="pp-read">' + _baseSug.map((s, i) => '<li><b>' + escHtml(s.ej) + '</b>: el ' + dm(s.fecha) + ' (de ' + fmtNum(s.from, 2) + ' a ' + fmtNum(s.to, 2) + ' kg). <button type="button" class="link-btn" onclick="baseApplySug(' + i + ')">Contar desde ahí</button></li>').join('') + '</ul>' +
      (_baseSug.length > 1 ? '<button type="button" class="log-add" style="width:100%" onclick="baseApplySug(-1)">Aplicar las ' + _baseSug.length + '</button>' : '');
  }
  if (_baseOwn.length) {
    h += '<div class="metric-title" style="margin-top:14px;">Con fecha propia</div><ul class="pp-read">' +
      _baseOwn.map((ex, i) => '<li><b>' + escHtml(ex) + '</b>: ' + (pgValidDate(p[ex]) ? 'desde el ' + dm(p[ex]) : 'todo el historial') + '. <button type="button" class="link-btn" onclick="baseClearOwn(' + i + ')">Usar la general</button></li>').join('') + '</ul>';
  }
  h += '<div class="metric-sub" style="margin:10px 0 0;">También puedes elegirla en la hoja de cada ejercicio (toca su gráfica).</div>';
  el.innerHTML = h;
}
function baseSetGeneral(v){ pgSetBase('', pgValidDate(v) ? v : undefined); }
function baseApplySug(i){
  const list = i < 0 ? _baseSug : [_baseSug[i]];
  list.forEach(s => { if (s && typeof hySetPref === 'function') hySetPref('base', s.ej, s.fecha); });
  pgRefreshAfterBase();
}
function baseClearOwn(i){ const ex = _baseOwn[i]; if (ex !== undefined) pgSetBase(ex, undefined); }
