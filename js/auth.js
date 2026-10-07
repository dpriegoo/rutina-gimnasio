// =====================================================================
// Sesión y login  (auth.js)
// Login con Google, cierre de sesión, y qué hacer cuando el servidor rechaza la sesión
// (con reintento antes de expulsar).
// Depende de: config, api, api-supabase.
// =====================================================================

function getProfile(){
  return localStorage.getItem('profile');
}

function getSessionToken(){
  return localStorage.getItem('sessionToken') || '';
}

function decodeJwt(token){
  try {
    const payload = token.split('.')[1];
    const json = decodeURIComponent(
      atob(payload.replace(/-/g,'+').replace(/_/g,'/'))
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch(e) { return null; }
}

async function handleCredentialResponse(response){
  const errEl = document.getElementById('loginError');
  const payload = decodeJwt(response.credential);
  if (!payload || !payload.email) {
    errEl.textContent = 'No se pudo verificar la cuenta.';
    errEl.style.display = 'block';
    return;
  }
  const profile = EMAIL_TO_PROFILE[payload.email];
  if (!profile) {
    errEl.textContent = 'La cuenta ' + payload.email + ' no tiene acceso a esta app.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  // Se canjea el token de Google (dura 1h) por una sesión propia en el servidor,
  // que dura semanas y se renueva sola mientras uses la app (no hace falta reloguear
  // por caducidad del token de Google).
  const statusEl = document.getElementById('loginStatus');
  if (statusEl) statusEl.style.display = 'block';
  let data = null;
  try {
    if (getBackend() === 'supabase') {
      data = await sbLogin(response.credential);
    } else {
      const res = await fetch(getSheetUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'login', idToken: response.credential })
      });
      data = await res.json();
    }
  } catch(e) { window._loginDetail = String((e && e.message) || e); }
  if (statusEl) statusEl.style.display = 'none';
  if (!data || !data.sessionToken) {
    errEl.textContent = 'No se pudo iniciar sesión. Inténtalo de nuevo.' + (window._loginDetail ? ' (' + window._loginDetail + ')' : '');
    errEl.style.display = 'block';
    return;
  }
  localStorage.setItem('sessionToken', data.sessionToken);
  localStorage.setItem('profile', data.profile);
  document.getElementById('profileScreen').style.display = 'none';
  updateProfileIndicator();
  const routineChanged = loadRoutineForProfile(data.profile);
  renderTabs();
  if (routineChanged) renderDay(); // si la rutina es la misma no se redibuja, para no borrar lo que se estuviera tecleando
  updateCardHighlights();
  fetchProgressSilently();
  flushOutbox();
}

function initGoogleSignIn(){
  if (!window.google || !google.accounts || !google.accounts.id) {
    setTimeout(initGoogleSignIn, 300);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
  const btn = document.getElementById('googleSignInBtn');
  if (btn) {
    google.accounts.id.renderButton(btn, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with' });
  }
}

let unauthorizedCheck = null;

// Antes de cerrar la sesión por un "unauthorized" se confirma con una segunda
// petición: un fallo puntual del servidor ya no te echa de la app.
function handleUnauthorized(){
  if (unauthorizedCheck) return unauthorizedCheck;
  const tokenAtStart = getSessionToken();
  unauthorizedCheck = (async () => {
    try {
      await new Promise(r => setTimeout(r, 1500));
      if (getSessionToken() !== tokenAtStart) return; // ya hay otra sesión (login nuevo)
      let still = true;
      try {
        const res = await postToSheet({ action: 'getHeight' });
        const d = await res.json();
        still = !!(d && d.error === 'unauthorized');
      } catch (e) { still = false; } // sin red: no es un rechazo de sesión
      if (!still) return;
      try { localStorage.setItem('lastLogoutReason', 'unauthorized ' + new Date().toISOString()); } catch(e) {}
      localStorage.removeItem('profile');
      localStorage.removeItem('sessionToken');
      document.getElementById('loginError').textContent = 'Tu sesión ya no es válida, inicia sesión de nuevo.';
      document.getElementById('loginError').style.display = 'block';
      document.getElementById('profileScreen').style.display = 'flex';
      updateProfileIndicator();
    } finally { unauthorizedCheck = null; }
  })();
  return unauthorizedCheck;
}

function showProfileScreen(){
  if (getSessionToken() && !confirm('¿Cerrar sesión?')) return;
  // Cerrar sesión: se invalida también en el servidor
  if (getSessionToken()) postToSheetChecked({ action: 'logout' }).catch(() => {});
  localStorage.removeItem('profile');
  localStorage.removeItem('sessionToken');
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('profileScreen').style.display = 'flex';
  updateProfileIndicator();
}

function updateProfileIndicator(){
  const p = getProfile();
  const el = document.getElementById('profileIndicator');
  el.textContent = p ? ('👤 ' + p + ' · cerrar sesión') : '';
  updateSyncBadge();
}
