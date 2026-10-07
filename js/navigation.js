// =====================================================================
// Navegación entre vistas  (navigation.js)
// Cambio entre Rutina / Métricas / Editar.
// Depende de: metrics, editor.
// =====================================================================

function setView(v){
  document.getElementById('rutinaView').style.display = v === 'rutina' ? '' : 'none';
  document.getElementById('metricasView').style.display = v === 'metricas' ? '' : 'none';
  document.getElementById('editView').style.display = v === 'editar' ? '' : 'none';
  document.getElementById('viewBtnRutina').classList.toggle('active', v === 'rutina');
  document.getElementById('viewBtnMetricas').classList.toggle('active', v === 'metricas');
  document.getElementById('viewBtnEditar').classList.toggle('active', v === 'editar');
  if (v === 'editar') renderEditView();
  if (v === 'metricas') renderSyncTiming();
  if (v === 'metricas' && !metricsLoadedOnce) {
    metricsLoadedOnce = true;
    loadMetrics(false);
  }
}
