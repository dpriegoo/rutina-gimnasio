// =====================================================================
// Capa de datos  (api.js)
// postToSheet(payload) es el único punto por el que la app lee/escribe datos: usa
// Supabase (por defecto) o Apps Script (?backend=sheets). postToSheetChecked trata
// "unauthorized" de forma centralizada.
// Depende de: config, api-supabase, auth.
// =====================================================================

function postToSheet(payload){
  if (getBackend() === 'supabase') return sbRespond(payload);
  const body = Object.assign({}, payload, { sessionToken: getSessionToken() });
  return fetch(getSheetUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });
}

// Envuelve postToSheet: si el servidor responde "unauthorized" (sesión caducada),
// lo trata de forma centralizada (mensaje claro + pantalla de login) en vez de que
// cada función lo confunda con un fallo genérico de red.
async function postToSheetChecked(payload){
  try {
    const res = await postToSheet(payload);
    const data = await res.json();
    if (data && data.error === 'unauthorized') {
      handleUnauthorized();
      return { ok: false, unauthorized: true };
    }
    return data;
  } catch (e) {
    return { ok: false };
  }
}

async function fetchSheetData(){
  const res = await postToSheet({ action: 'list' });
  return res.json();
}
