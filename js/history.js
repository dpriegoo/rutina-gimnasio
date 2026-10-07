// =====================================================================
// Historial  (history.js)
// Pestaña Métricas > Historial: elegir día y ejercicio, editar y borrar series.
// Depende de: api, routine, utils.
// =====================================================================

let editingHistId = null;

function startEditHist(id){
  editingHistId = id;
  renderHistorial();
}

function cancelEditHist(){
  editingHistId = null;
  renderHistorial();
}

async function saveEditHist(id){
  const row = document.querySelector(`[data-hist-id="${id}"]`);
  const existing = (window._progressCache || []).find(r => String(r['ID']) === String(id));
  const timed = existing && isTimedExercise(existing['Ejercicio']);
  let peso, reps, series;
  if (timed) {
    reps = row.querySelector('.edit-reps').value;
    peso = '0';
    series = existing ? existing['Series'] : 1;
  } else {
    peso = row.querySelector('.edit-peso').value.replace(',', '.').trim();
    reps = row.querySelector('.edit-reps').value;
    series = row.querySelector('.edit-series').value;
  }
  const queuedEntry = getOutbox().find(e => String(e.id) === String(id));
  if (queuedEntry) {
    // Aún no ha llegado al servidor: se corrige directamente en la cola
    queuedEntry.peso = peso; queuedEntry.reps = reps; queuedEntry.series = series;
    saveOutbox(getOutbox().map(e => String(e.id) === String(id) ? queuedEntry : e));
  } else {
    const data = await postToSheetChecked({ action: 'update', id, peso, reps, series });
    if (!data || !data.ok) {
      if (!data.unauthorized) showToast('⚠️ No se pudo actualizar, revisa tu conexión');
      return;
    }
  }
  const row2 = window._progressCache.find(r => String(r['ID']) === String(id));
  if (row2) { row2['Peso (kg)'] = peso; row2['Reps'] = reps; row2['Series'] = series; }
  editingHistId = null;
  showToast('Registro actualizado ✓');
  renderHistorial();
  renderProgressChart();
  renderVolumeChart();
}

async function deleteHist(id){
  const isQueued = getOutbox().some(e => String(e.id) === String(id));
  if (isQueued) {
    // Aún no ha llegado al servidor: basta con quitarla de la cola
    saveOutbox(getOutbox().filter(e => String(e.id) !== String(id)));
  } else {
    const data = await postToSheetChecked({ action: 'delete', id });
    if (!data || !data.ok) {
      if (!data.unauthorized) showToast('⚠️ No se pudo borrar, revisa tu conexión');
      return;
    }
  }
  window._progressCache = window._progressCache.filter(r => String(r['ID']) !== String(id));
  showToast('Registro borrado ✓');
  renderHeatmap();
  populateExerciseSelect();
  renderHistorial();
  renderProgressChart();
  renderVolumeChart();
  renderTabs();
  updateCardHighlights();
}

function populateHistorialDaySelect(){
  const daySel = document.getElementById('historialDaySelect');
  if (!daySel) return;
  const prevValue = daySel.value;
  daySel.innerHTML = '<option value="">Elige un día…</option>' +
    DAYS.map(d => `<option value="${d.name}">${d.name.split('·')[0].trim()}</option>`).join('');
  if (DAYS.some(d => d.name === prevValue)) daySel.value = prevValue;
}

function onHistorialDayChange(){
  populateHistorialExerciseSelect();
  renderHistorial();
}

function populateHistorialExerciseSelect(){
  const daySel = document.getElementById('historialDaySelect');
  const exSel = document.getElementById('historialExerciseSelect');
  if (!exSel) return;
  const dia = daySel ? daySel.value : '';
  if (!dia) {
    exSel.innerHTML = '<option value="">Elige un día primero…</option>';
    return;
  }
  const day = (ROUTINE ? ROUTINE.days : DAYS).find(d => d.name === dia);
  const names = day ? day.groups.flatMap(g => g.exercises.map(ex => ex.name)) : [];
  const prevValue = exSel.value;
  exSel.innerHTML = '<option value="">Elige un ejercicio…</option>' +
    names.map(n => `<option value="${n}">${n}</option>`).join('');
  if (names.includes(prevValue)) exSel.value = prevValue;
}

function renderHistorial(){
  const listEl = document.getElementById('historialList');
  const daySel = document.getElementById('historialDaySelect');
  const exSel = document.getElementById('historialExerciseSelect');
  const dia = daySel ? daySel.value : '';
  const exercise = exSel ? exSel.value : '';

  if (!dia) {
    listEl.innerHTML = '<div class="draft-empty">Elige un día arriba para ver su historial.</div>';
    return;
  }
  if (!exercise) {
    listEl.innerHTML = '<div class="draft-empty">Elige un ejercicio arriba para ver su historial.</div>';
    return;
  }

  const rows = myRows()
    .filter(r => r['ID'] && r['Día'] === dia && r['Ejercicio'] === exercise)
    .sort((a,b) => String(b['Fecha']).localeCompare(String(a['Fecha'])))
    .slice(0, 20);

  if (rows.length === 0) {
    listEl.innerHTML = '<div class="draft-empty">Aún no hay registros de "' + exercise + '".</div>';
    return;
  }

  listEl.innerHTML = rows.map(r => {
    const id = r['ID'];
    const timed = isTimedExercise(r['Ejercicio']);
    if (editingHistId === id) {
      if (timed) {
        return `
          <div class="draft-item" data-hist-id="${id}">
            <div class="draft-edit-form">
              <input class="edit-reps" type="number" inputmode="numeric" value="${r['Reps']}" placeholder="segundos">
              <button class="draft-edit-save" onclick="saveEditHist('${id}')">OK</button>
            </div>
            <button class="draft-del" onclick="cancelEditHist()">✕</button>
          </div>
        `;
      }
      return `
        <div class="draft-item" data-hist-id="${id}">
          <div class="draft-edit-form">
            <input class="edit-peso" type="text" inputmode="decimal" value="${r['Peso (kg)']}" placeholder="kg">
            <input class="edit-reps" type="number" inputmode="numeric" value="${r['Reps']}" placeholder="reps">
            <input class="edit-series" type="number" inputmode="numeric" value="${r['Series']}" placeholder="series">
            <button class="draft-edit-save" onclick="saveEditHist('${id}')">OK</button>
          </div>
          <button class="draft-del" onclick="cancelEditHist()">✕</button>
        </div>
      `;
    }
    const badges = [
      isWarmupRow(r) ? '🔥 calentamiento' : '',
      r['Variante'] ? '🔀 ' + r['Variante'] : '',
      r['Nota'] ? '📝 ' + r['Nota'] : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="draft-item" data-hist-id="${id}">
        <div class="di-text">${r['Ejercicio']}<div class="di-sub">${String(r['Fecha']).slice(0,10)} · ${timed ? r['Reps'] + ' seg' : r['Peso (kg)'] + ' kg · ' + r['Reps'] + ' reps'} · ${r['Series']} series</div>${badges ? `<div class="di-sub" style="color:var(--amber);">${badges}</div>` : ''}</div>
        <button class="draft-edit" onclick="startEditHist('${id}')">✏️</button>
        <button class="draft-del" onclick="deleteHist('${id}')">✕</button>
      </div>
    `;
  }).join('');
}
