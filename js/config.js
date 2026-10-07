// =====================================================================
// Configuración  (config.js)
// Constantes del proyecto (Google, Supabase), elección de backend
// (?backend=supabase|sheets) y cuentas permitidas.
// Sin dependencias: se carga el primero.
// =====================================================================

// ---- Selección de backend: ?backend=supabase o ?backend=sheets (se recuerda) ----
(function(){
  try {
    // Si la sesión guardada es de otro backend (p. ej. la antigua de Sheets), se descarta: hay que entrar de nuevo una vez
    const tok = localStorage.getItem('sessionToken');
    const isSb = localStorage.getItem('backend') !== 'sheets';
    if (tok && ((isSb && tok !== 'sb') || (!isSb && tok === 'sb'))) {
      localStorage.removeItem('profile');
      localStorage.removeItem('sessionToken');
    }
    const m = /[?&]backend=(supabase|sheets)/.exec(location.search);
    if (m) {
      if (localStorage.getItem('backend') !== m[1]) {
        localStorage.setItem('backend', m[1]);
        localStorage.removeItem('profile');
        localStorage.removeItem('sessionToken');
      }
      history.replaceState(null, '', location.pathname + location.hash);
    }
  } catch(e) {}
})();

// ---- Login real con Google ----
const GOOGLE_CLIENT_ID = '681503048133-btp3sc7qud8libfnglb2tc728uir57n6.apps.googleusercontent.com';

const EMAIL_TO_PROFILE = {
  'dpriegooliva@gmail.com': 'David',
  'valleromeropedro@gmail.com': 'Pedro'
};

// ---- Google Sheet config ----
const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbwgIxhB_Pym24bLJETzkQ5wEiE7lgeN_jb-yTj4FntarGEwns7gy3JxhFLbOPk31D_V/exec';

function getSheetUrl(){
  return localStorage.getItem('sheetUrl') || DEFAULT_SHEET_URL;
}

// ======================= Backend Supabase =======================
const SUPABASE_URL = 'https://cqulyecdgkqjlzerfeue.supabase.co';

const SUPABASE_KEY = 'sb_publishable_yZc9G5Pg_422VlW7tEzyjg_VUtWyBzw';

function getBackend(){
  return localStorage.getItem('backend') === 'sheets' ? 'sheets' : 'supabase';
}
