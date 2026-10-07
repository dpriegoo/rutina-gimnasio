// =====================================================================
// Peso corporal y altura  (body.js)
// Registro, tendencia y gráfica de peso; altura.
// Depende de: api, utils.
// =====================================================================

// ---- Peso corporal y altura ----
window._weightHistory = [];

window._height = null;

async function loadBodyStats(){
  try {
    const [heightRes, weightsRes] = await Promise.all([
      postToSheet({ action: 'getHeight' }).then(r => r.json()),
      postToSheet({ action: 'listWeights' }).then(r => r.json())
    ]);
    window._height = heightRes && heightRes.altura ? heightRes.altura : null;
    window._weightHistory = Array.isArray(weightsRes) ? weightsRes : [];
    onServerInfo(heightRes);
    if (window._height) document.getElementById('heightInput').value = window._height;
    renderWeightTrend();
    renderWeightChart();
  } catch (e) {}
}

function getWeightTrend(){
  const weights = window._weightHistory || [];
  if (weights.length === 0) return { pesoActual: null, pesoHaceSemana: null };
  const sorted = weights.slice().sort((a,b) => a.fecha.localeCompare(b.fecha));
  const pesoActual = sorted[sorted.length - 1].peso;
  const weekAgoStr = localDateStr(new Date(Date.now() - 7*24*60*60*1000));
  let pesoHaceSemana = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].fecha <= weekAgoStr) { pesoHaceSemana = sorted[i].peso; break; }
  }
  return { pesoActual, pesoHaceSemana };
}

function daysSinceLastWeight(){
  const weights = window._weightHistory || [];
  if (weights.length === 0) return null;
  const sorted = weights.slice().sort((a,b) => a.fecha.localeCompare(b.fecha));
  const last = sorted[sorted.length - 1].fecha;
  const lastDate = parseLocalDate(last);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((today - lastDate) / (24*60*60*1000));
}

let weightChartInstance = null;

function computeMovingAverage(sorted){
  return sorted.map(w => {
    const d = parseLocalDate(w.fecha);
    const windowStart = new Date(d);
    windowStart.setDate(windowStart.getDate() - 6);
    const inWindow = sorted.filter(x => {
      const xd = parseLocalDate(x.fecha);
      return xd >= windowStart && xd <= d;
    });
    const avg = inWindow.reduce((s, x) => s + x.peso, 0) / inWindow.length;
    return Math.round(avg * 10) / 10;
  });
}

function dailyVolumeMap(){
  const profile = getProfile();
  const cache = window._progressCache || [];
  const map = {};
  cache
    .filter(r => (r['Perfil'] || '') === profile && !isWarmupRow(r))
    .forEach(r => {
      const f = String(r['Fecha']).slice(0, 10);
      map[f] = (map[f] || 0) + rowVolume(r);
    });
  return map;
}

function renderWeightChart(){
  const subEl = document.getElementById('weightChartSub');
  const ctx = document.getElementById('weightChart');
  if (weightChartInstance) { weightChartInstance.destroy(); weightChartInstance = null; }

  const weights = window._weightHistory || [];
  if (!window.Chart) {
    subEl.textContent = '⚠️ No se pudo cargar la librería de gráficos.';
    return;
  }
  if (weights.length === 0) {
    subEl.textContent = 'Registra algún peso para ver la gráfica.';
    return;
  }

  const sorted = weights.slice().sort((a,b) => a.fecha.localeCompare(b.fecha));
  const labels = sorted.map(w => w.fecha.slice(5));
  const raw = sorted.map(w => w.peso);
  const movingAvg = computeMovingAverage(sorted);
  const volMap = dailyVolumeMap();
  const volData = sorted.map(w => Math.round(volMap[w.fecha] || 0));

  subEl.textContent = 'Puntos y línea verde: peso (media 7 días) · barras ámbar: volumen movido ese día en el gimnasio';

  weightChartInstance = new Chart(ctx, {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: 'Volumen ese día (kg)',
          data: volData,
          backgroundColor: 'rgba(242,169,59,0.35)',
          yAxisID: 'y1',
          order: 3,
          borderRadius: 3,
        },
        {
          type: 'line',
          label: 'Peso (kg)',
          data: raw,
          borderColor: 'rgba(63,124,240,0.35)',
          backgroundColor: 'transparent',
          pointRadius: 3,
          pointBackgroundColor: 'rgba(63,124,240,0.6)',
          borderWidth: 1,
          tension: 0.2,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Media 7 días',
          data: movingAvg,
          borderColor: '#4caf7d',
          backgroundColor: 'rgba(76,175,125,0.12)',
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.3,
          fill: true,
          yAxisID: 'y',
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: '#9aa1ab', font: { size: 11 }, boxWidth: 12 } }
      },
      scales: {
        x: { ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' } },
        y: { position: 'left', ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { color: '#2a2e35' }, title: { display: true, text: 'kg corporales', color: '#9aa1ab', font: { size: 10 } } },
        y1: { position: 'right', ticks: { color: '#9aa1ab', font: { size: 10 } }, grid: { display: false }, title: { display: true, text: 'volumen gym (kg)', color: '#9aa1ab', font: { size: 10 } } }
      }
    }
  });
}

function renderWeightTrend(){
  const el = document.getElementById('weightTrendText');
  const { pesoActual, pesoHaceSemana } = getWeightTrend();
  const dias = daysSinceLastWeight();

  if (!pesoActual) {
    el.innerHTML = 'Aún no has registrado ningún peso. Para una tendencia fiable, ideal pesarse cada 2-3 días (o a diario) siempre en las mismas condiciones.';
    return;
  }

  let text = 'Peso actual: ' + pesoActual + ' kg';
  if (pesoHaceSemana) {
    const delta = Math.round((pesoActual - pesoHaceSemana) * 10) / 10;
    text += ' (' + (delta >= 0 ? '+' : '') + delta + ' kg vs. hace una semana)';
  }
  if (dias !== null && dias >= 3) {
    text += '<br><span style="color:var(--amber);">⚠️ Han pasado ' + dias + ' días desde tu último peso — te iría bien registrar uno hoy.</span>';
  }
  el.innerHTML = text;
}

async function saveHeightValue(){
  const val = document.getElementById('heightInput').value.replace(',', '.').trim();
  if (!val || isNaN(parseFloat(val))) { showToast('Pon una altura válida'); return; }
  const data = await postToSheetChecked({ action: 'saveHeight', altura: val });
  if (data && data.ok) {
    window._height = val;
    showToast('Altura guardada ✓');
  } else if (!data.unauthorized) {
    showToast('No se pudo guardar la altura, revisa tu conexión');
  }
}

async function saveWeightValue(){
  const val = document.getElementById('weightInput').value.replace(',', '.').trim();
  if (!val || isNaN(parseFloat(val))) { showToast('Pon un peso válido'); return; }
  const data = await postToSheetChecked({ action: 'saveWeight', peso: val, fecha: localDateStr() });
  if (data && data.ok) {
    const today = localDateStr();
    window._weightHistory = (window._weightHistory || []).filter(w => w.fecha !== today);
    window._weightHistory.push({ fecha: today, peso: parseFloat(val) });
    document.getElementById('weightInput').value = '';
    renderWeightTrend();
    renderWeightChart();
    showToast('Peso registrado ✓');
  } else if (!data.unauthorized) {
    showToast('No se pudo registrar el peso, revisa tu conexión');
  }
}
