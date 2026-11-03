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

async function loadMetrics(force){
  const btn = document.getElementById('refreshBtn');
  btn.textContent = '⏳ Cargando…';
  try {
    const data = await fetchSheetData();
    if (data && data.error === 'unauthorized') { handleUnauthorized(); return; }
    window._progressCache = data;
    try { localStorage.setItem('progressCache', JSON.stringify(data)); } catch(e) {}
    applyOutboxToCache();
    renderHeatmap();
    populateExerciseSelect();
    renderHistorial();
    renderProgressChart();
    renderVolumeChart();
    renderStrengthIndexChart();
    renderTabs();
    updateCardHighlights();
    loadBodyStats();
    maybeShowRebalanceModal();
    btn.textContent = '🔄 Actualizar datos';
  } catch (err) {
    btn.textContent = '⚠️ No se pudo cargar — reintentar';
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
  const sess = exercise ? exerciseSessions(exercise) : [];

  const labels = sess.map(s => s.fecha.slice(5));
  const values = sess.map(s => Math.round(s.value * 10) / 10);
  const trend = pgTrend(values).map(v => Math.round(v * 10) / 10);
  const T = chartTheme();

  const subEl = document.getElementById('progressSub');
  const ctx = document.getElementById('progressChart');
  if (progressChartInstance) { progressChartInstance.destroy(); progressChartInstance = null; }

  if (!window.Chart) {
    subEl.textContent = '⚠️ No se pudo cargar la librería de gráficos (revisa tu conexión y recarga).';
    return;
  }
  if (!exercise || labels.length === 0) {
    subEl.textContent = rows.length === 0
      ? 'Aún no hay registros para tu perfil.'
      : 'No hay registros de "' + exercise + '" todavía.';
    return;
  }

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
    subEl.textContent = 'Línea azul: fuerza estimada de cada sesión (media de tus series de trabajo) · línea ámbar: tendencia (media de 3 sesiones). Toca “Peso de la mejor serie” en la leyenda para verlo también.';
  }
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
    subEl.textContent = '⚠️ No se pudo cargar la librería de gráficos (revisa tu conexión y recarga).';
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
// registrada; cada semana es la media de esos porcentajes entre todos los ejercicios.
function computeStrengthIndexByWeek(profile){
  const names = [];
  myRows().forEach(r => { const ex = r['Ejercicio']; if (ex && !isWarmupRow(r) && !isTimedExercise(ex) && names.indexOf(ex) < 0) names.push(ex); });
  if (names.length === 0) return { labels: [], values: [] };

  const baseline = {}, byWeekEx = {};
  names.forEach(ex => {
    const sess = exerciseSessions(ex);
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
  if (!window.Chart) { subEl.textContent = '⚠️ No se pudo cargar la librería de gráficos.'; return; }
  if (!profile) return;

  const { labels, values } = computeStrengthIndexByWeek(profile);
  if (labels.length < 2) {
    subEl.textContent = 'Necesitas un par de semanas con registros para ver la tendencia de fondo.';
    return;
  }
  subEl.textContent = '100% = tu primera sesión registrada de cada ejercicio (fuerza estimada: media de tus series de trabajo, sin calentamientos). Por encima de 100%, vas a más de media.';

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
