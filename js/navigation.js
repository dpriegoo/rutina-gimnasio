// =====================================================================
// Navegación entre vistas  (navigation.js)
// Cambio entre Rutina / Métricas / Editar.
// Depende de: metrics, editor, day-picker.
// =====================================================================

let _currentView = 'rutina';
function currentViewName(){ return _currentView; }

function setView(v){
  if (typeof coachClose === 'function') coachClose();   // el entrenador es una pestaña más: al cambiar de pestaña se cierra
  _currentView = v;
  setInDay(v === 'rutina' && dayScreenOpen);   // cabecera compacta solo dentro de un día
  document.getElementById('rutinaView').style.display = v === 'rutina' ? '' : 'none';
  document.getElementById('metricasView').style.display = v === 'metricas' ? '' : 'none';
  document.getElementById('editView').style.display = v === 'editar' ? '' : 'none';
  document.getElementById('viewBtnRutina').classList.toggle('active', v === 'rutina');
  document.getElementById('viewBtnMetricas').classList.toggle('active', v === 'metricas');
  document.getElementById('viewBtnEditar').classList.toggle('active', v === 'editar');
  ['Rutina', 'Metricas', 'Editar'].forEach(n => document.getElementById('viewBtn' + n).setAttribute('aria-pressed', String(v === n.toLowerCase())));
  const cb = document.getElementById('viewBtnCoach'); if (cb) { cb.classList.remove('active'); cb.setAttribute('aria-pressed', 'false'); }
  if (v === 'editar') renderEditView();
  if (v === 'metricas') { setMetricsSection(metricsSectionSaved()); renderSyncTiming(); exportInit(); }
  if (v === 'metricas' && !metricsLoadedOnce) {
    metricsLoadedOnce = true;
    loadMetrics(false);
  }
}

// Escape cierra la pantalla superpuesta que esté arriba (el aviso de reequilibrio pide una decisión y no se cierra así)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (isShown('dayRenameModal')) return closeDayRename();
  if (isShown('exerciseEditorModal')) return closeExerciseEditor();
  if (isShown('dayCompareScreen')) return hideDayComparison();
  if (isShown('summaryScreen')) return hideWeekSummary();
});

// Los indicadores que son un <div>/<span> pulsable (usuario, sincronización) también se activan con Enter o espacio
document.addEventListener('keydown', e => {
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') {
    e.preventDefault();
    t.click();
  }
});
