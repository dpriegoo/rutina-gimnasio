// =====================================================================
// Carga de progreso y refresco  (progress.js)
// Descarga silenciosa del progreso, caché local y refrescos automáticos (volver a la
// app, red recuperada, cada 2 min).
// Depende de: api, outbox, routine, planning, day-view.
// =====================================================================

async function fetchProgressSilently(retriesLeft){
  if (retriesLeft === undefined) retriesLeft = 2; // reintentos automáticos ante fallos de red puntuales
  if (!getSessionToken()) return;
  try {
    const data = await fetchSheetData();
    if (data && data.error === 'unauthorized') { handleUnauthorized(); return; }
    window._progressCache = data;
    try { localStorage.setItem('progressCache', JSON.stringify(data)); } catch(e) {}
    applyOutboxToCache();
    renderTabs();
    updateCardHighlights();
    maybeShowRebalanceModal();
    const [heightRes, weightsRes] = await Promise.all([
      postToSheet({ action: 'getHeight' }).then(r => r.json()).catch(() => null),
      postToSheet({ action: 'listWeights' }).then(r => r.json()).catch(() => [])
    ]);
    window._height = heightRes && heightRes.altura ? heightRes.altura : null;
    window._weightHistory = Array.isArray(weightsRes) ? weightsRes : [];
    onServerInfo(heightRes);
  } catch (e) {
    if (retriesLeft > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return fetchProgressSilently(retriesLeft - 1);
    }
    showToast('⚠️ No se pudieron actualizar los datos, revisa tu conexión');
  }
}

// Refresco automático: al entrar/volver a la app y cada cierto tiempo mientras
// esté abierta, para no depender de darle manualmente a "Actualizar datos".
function refreshProgressIfLoggedIn(){
  if (getProfile() && getSessionToken()) {
    flushOutbox();
    fetchProgressSilently();
  }
}

window.addEventListener('online', () => { flushAttempt = 0; flushOutbox(); });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshProgressIfLoggedIn();
  }
});

window.addEventListener('pageshow', (evt) => {
  if (evt.persisted) refreshProgressIfLoggedIn(); // vuelta desde el caché de "atrás/adelante" del navegador (típico en iOS al reabrir la app)
});

// Si hay más de una pestaña/instancia abierta a la vez (frecuente en Android:
// una pestaña normal + la app instalada), este evento avisa a las demás en
// cuanto una de ellas cambia las series pendientes, para que no se queden con
// una vista desactualizada que luego pueda sobrescribir lo nuevo.
window.addEventListener('storage', (evt) => {
  if (evt.key === 'syncOutbox') {
    // Otra pestaña ha guardado/sincronizado series: se refleja aquí sin esperar al siguiente refresco
    applyOutboxToCache();
    updateSyncBadge();
    renderTabs();
    updateCardHighlights();
  }
  if (evt.key === 'pendingRows') {
    document.querySelectorAll('.pending-wrap[id]').forEach(el => {
      const logId = el.id.replace(/^pendingWrap-/, '');
      renderPendingWrap(logId);
    });
  }
});

setInterval(() => {
  if (document.visibilityState === 'visible') refreshProgressIfLoggedIn();
}, 120000);
 // cada 2 minutos mientras la app esté visible en primer plano

function loadCachedProgress(){
  try {
    const cached = localStorage.getItem('progressCache');
    if (cached) window._progressCache = JSON.parse(cached);
  } catch (e) {}
  applyOutboxToCache();
}
