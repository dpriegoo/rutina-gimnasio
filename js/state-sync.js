// =====================================================================
// Estado de la app en el servidor  (state-sync.js)
// La semana de descarga y los chequeos diarios vivían solo en el dispositivo. Aquí se guardan también en el servidor
// (supabase/estado.sql) para no perderlos al cambiar de móvil o borrar los datos del navegador. Gana el cambio más reciente.
// Sin el SQL, o sin red, todo sigue funcionando en local y se reintenta en la siguiente sincronización.
// Depende de: api, utils, deload, checkin.
// =====================================================================

const STATE_KEYS = {
  deload:   { storage: () => deloadListKey(), apply: () => { if (typeof renderDeloadCard === 'function') renderDeloadCard(); if (typeof renderTabs === 'function') renderTabs(); } },
  checkins: { storage: () => checkinKey(),    apply: () => { if (typeof renderCheckinCard === 'function') renderCheckinCard(); if (typeof renderDeloadCard === 'function') renderDeloadCard(); } },
};
function stateMetaKey(){ return 'stateMeta_' + getProfile(); }
function stateMeta(){ try { return JSON.parse(localStorage.getItem(stateMetaKey()) || '{}'); } catch (e) { return {}; } }
function stateMetaSet(key, u){ const m = stateMeta(); m[key] = u; try { localStorage.setItem(stateMetaKey(), JSON.stringify(m)); } catch (e) {} }
function stateRead(key){ try { return JSON.parse(localStorage.getItem(STATE_KEYS[key].storage()) || 'null'); } catch (e) { return null; } }

// Se llama tras cada cambio local: anota cuándo y lo envía poco después
const _statePushTimers = {};
function stateTouch(key){
  if (!getProfile() || !STATE_KEYS[key]) return;
  stateMetaSet(key, Date.now());
  clearTimeout(_statePushTimers[key]);
  _statePushTimers[key] = setTimeout(() => { statePush(key); }, 800);
}

async function statePush(key){
  if (!getSessionToken() || !STATE_KEYS[key]) return false;
  const value = stateRead(key); if (value === null) return false;
  try {
    const r = await postToSheet({ action: 'stateSet', key: key === 'deload' ? 'deload' : key, value: value });
    const j = await r.json();
    if (j && j.ok) { const t = Date.parse(j.updated_at); stateMetaSet(key, isFinite(t) ? Math.max(t, stateMeta()[key] || 0) : (stateMeta()[key] || Date.now())); return true; }
  } catch (e) {}
  return false;
}

// Al abrir la app: por cada clave, gana lo más reciente (servidor o dispositivo)
async function stateSync(){
  if (!getSessionToken() || !getProfile()) return { unavailable: false };
  let unavailable = false;
  for (const key of Object.keys(STATE_KEYS)) {
    try {
      const r = await postToSheet({ action: 'stateGet', key: key }), j = await r.json();
      if (!j || j.unavailable) { unavailable = true; break; }
      const local = stateRead(key), lu = stateMeta()[key] || 0;
      if (j.missing) { if (local !== null && (Array.isArray(local) ? local.length : true)) await statePush(key); continue; }
      const su = Date.parse(j.updated_at) || 0;
      if (su > lu) {
        try { localStorage.setItem(STATE_KEYS[key].storage(), JSON.stringify(j.value)); } catch (e) {}
        stateMetaSet(key, su); STATE_KEYS[key].apply();
      } else if (lu > su) await statePush(key);
    } catch (e) { /* sin red: se reintenta en la siguiente */ }
  }
  try { localStorage.setItem('stateServer', unavailable ? '0' : '1'); } catch (e) {}
  return { unavailable: unavailable };
}
