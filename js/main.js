// =====================================================================
// Arranque  (main.js)
// Se carga el último: inicializa la rutina, pinta la pantalla y decide si se muestra el
// login. Comprueba también si hay una versión nueva de la app.
// Depende de todo lo anterior.
// =====================================================================

migratePendingKeys();

loadRoutineForProfile(getProfile());

loadCachedProgress();

renderTabs();

renderDay();

initGoogleSignIn();

if (getProfile() && getSessionToken()) {
  document.getElementById('profileScreen').style.display = 'none';
  updateProfileIndicator();
  flushOutbox();
  fetchProgressSilently();
} else {
  // Sin sesión propia válida (p. ej. quedó un idToken del sistema anterior): login directo
  localStorage.removeItem('idToken');
  updateProfileIndicator();
}

// ---- Comprobación de versión -------------------------------------------------
// GitHub Pages guarda en caché cada archivo ~10 min, así que tras una actualización
// el móvil puede arrancar con archivos mezclados (unos viejos, otros nuevos).
// version.json (sin caché) dice cuál es la versión vigente: si no coincide con la
// que cargó esta página, se recarga UNA vez saltándose la caché.
// El número lo escribe tools/stamp.js; tú no tocas nada.
async function checkForNewVersion(){
  try {
    if (!window.IRONLOG_BUILD || window.IRONLOG_BUILD.indexOf('__') === 0) return; // desarrollo local
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const v = (await res.json()).version;
    if (v && v !== window.IRONLOG_BUILD && sessionStorage.getItem('ironlogReloadedFor') !== v) {
      sessionStorage.setItem('ironlogReloadedFor', v); // evita bucles de recarga
      location.replace(location.pathname + '?v=' + v);
    }
  } catch (e) {}
}
checkForNewVersion();

// Al volver a la app tras >30 min en segundo plano (y sin estar escribiendo), se vuelve a comprobar
let hiddenSince = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenSince = Date.now(); return; }
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (hiddenSince && Date.now() - hiddenSince > 30 * 60 * 1000 && !/INPUT|TEXTAREA|SELECT/.test(tag)) checkForNewVersion();
});
