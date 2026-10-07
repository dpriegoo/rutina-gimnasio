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
    if (n <= 2) return '#1e3a72';
    if (n <= 5) return '#274a94';
    if (n <= 9) return '#3f7cf0';
    return '#8ab4ff';
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

function renderProgressChart(){
  const rows = myRows().filter(r => !isWarmupRow(r));
  const exercise = document.getElementById('exerciseSelect').value;
  const timed = isTimedExercise(exercise);
  const filtered = rows
    .filter(r => r['Ejercicio'] === exercise)
    .sort((a,b) => String(a['Fecha']).localeCompare(String(b['Fecha'])));

  const labels = filtered.map(r => String(r['Fecha']).slice(5));
  const weights = filtered.map(r => Number(r['Peso (kg)']) || 0);
  const seconds = filtered.map(r => Number(r['Reps']) || 0);
  const oneRM = filtered.map(r => {
    const p = Number(r['Peso (kg)']) || 0;
    const reps = Number(r['Reps']) || 0;
    return reps ? Math.round(p * (1 + reps / 30) * 10) / 10 : 0;
  });

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

  if (timed) {
    subEl.textContent = 'Ejercicio por tiempo: segundos aguantados en cada serie';
    progressChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Segundos',
          data: seconds,
          borderColor: '#4caf7d',
          backgroundColor: 'rgba(76,175,125,0.15)',
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
          x: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' } },
          y: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' } }
        }
      }
    });
    return;
  }

  subEl.textContent = 'Línea azul: peso levantado · línea ámbar: 1RM estimado (fórmula de Epley)';

  progressChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Peso (kg)',
          data: weights,
          borderColor: '#3f7cf0',
          backgroundColor: 'rgba(63,124,240,0.15)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
        {
          label: '1RM estimado',
          data: oneRM,
          borderColor: '#f2a93b',
          backgroundColor: 'transparent',
          borderDash: [5, 4],
          tension: 0.3,
          fill: false,
          pointRadius: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#9aa1ab', font: { size: 11 }, boxWidth: 12 }
        }
      },
      scales: {
        x: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' } },
        y: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' } }
      }
    }
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
        backgroundColor: '#3f7cf0',
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' } }
      }
    }
  });
}

// ---- Índice de fuerza (tendencia de fondo, no solo esta semana vs. la pasada) ----
function computeStrengthIndexByWeek(profile){
  const cache = window._progressCache || [];
  const rows = cache.filter(r => (r['Perfil'] || '') === profile && !isWarmupRow(r) && !isTimedExercise(r['Ejercicio']));
  if (rows.length === 0) return { labels: [], values: [] };

  function rm(r){
    const p = Number(r['Peso (kg)']) || 0, rp = Number(r['Reps']) || 0;
    return rp ? p * (1 + rp / 30) : 0;
  }

  // Línea base: primer 1RM>0 registrado de cada ejercicio (por orden de fecha)
  const baseline = {};
  const sorted = rows.slice().sort((a, b) => String(a['Fecha']).localeCompare(String(b['Fecha'])));
  sorted.forEach(r => {
    const ex = r['Ejercicio'];
    const v = rm(r);
    if (v > 0 && !(ex in baseline)) baseline[ex] = v;
  });

  // Mejor 1RM por semana y ejercicio
  const byWeekEx = {};
  rows.forEach(r => {
    const v = rm(r);
    if (v <= 0) return;
    const ex = r['Ejercicio'];
    if (!(ex in baseline) || baseline[ex] <= 0) return;
    const wk = isoWeekLabel(String(r['Fecha']));
    if (!byWeekEx[wk]) byWeekEx[wk] = {};
    if (!byWeekEx[wk][ex] || v > byWeekEx[wk][ex]) byWeekEx[wk][ex] = v;
  });

  const weekKeys = Object.keys(byWeekEx).sort().slice(-12);
  const values = weekKeys.map(wk => {
    const exMap = byWeekEx[wk];
    const ratios = Object.keys(exMap).map(ex => (exMap[ex] / baseline[ex]) * 100);
    const avg = ratios.reduce((s, v) => s + v, 0) / ratios.length;
    return Math.round(avg * 10) / 10;
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
  subEl.textContent = '100% = tu primera marca registrada de cada ejercicio (1RM estimado, sin calentamientos). Por encima de 100%, vas a más de media.';

  strengthIndexChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Índice de fuerza',
        data: values,
        borderColor: '#3f7cf0',
        backgroundColor: 'rgba(63,124,240,0.15)',
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
        x: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' } },
        y: { ticks: { color: '#9aa1ab', font: { size: 10 }, callback: v => v + '%' }, grid: { color: '#2a2e35' } }
      }
    }
  });
}
