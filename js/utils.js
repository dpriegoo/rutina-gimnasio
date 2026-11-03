// =====================================================================
// Utilidades  (utils.js)
// Funciones pequeñas y sin estado propio: fechas/semana, escape de HTML, avisos (toast),
// filas de progreso.
// Depende de: config.
// =====================================================================

function myRows(){
  const data = window._progressCache || [];
  const profile = getProfile();
  return data.filter(r => (r['Perfil'] || '') === profile);
}

function mondayOf(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function toggleLog(id){
  const form = document.getElementById(id);
  form.classList.toggle('open');
}

function toggleAdvanced(logId){
  const adv = document.getElementById('adv-' + logId);
  if (adv) adv.classList.toggle('open');
}

function localDateStr(d){
  d = d || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function parseLocalDate(dateStr){
  const parts = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getWeekStart(){
  const d = new Date();
  d.setHours(0,0,0,0);
  const dow = (d.getDay() + 6) % 7; // 0=lunes ... 6=domingo
  d.setDate(d.getDate() - dow);
  return d;
}

function getWeekStartOffset(offsetWeeks){
  const d = getWeekStart();
  d.setDate(d.getDate() + offsetWeeks * 7);
  return d;
}

function rowVolume(r){
  return (Number(r['Peso (kg)']) || 0) * (Number(r['Reps']) || 0) * (Number(r['Series']) || 0);
}

function escHtml(s){
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Para meter un texto dentro de onclick="fn('...')"
function jsArg(s){
  return escHtml(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

function cleanText(s, max){
  return String(s == null ? '' : s).replace(/[<>"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}

function cloneJson(o){ return JSON.parse(JSON.stringify(o)); }

function $id(id){ return document.getElementById(id); }

function isWarmupRow(r){
  const v = r['Calentamiento'];
  return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1';
}

// Números en español, siempre igual en toda la app: coma decimal y punto de millar
// (toLocaleString('es-ES') no agrupa los de 4 cifras: "1234" frente a "15.161"). dec = decimales máximos.
function fmtNum(v, dec){
  const n = Number(v);
  if (!isFinite(n)) return '–';
  dec = dec == null ? 1 : dec;
  const f = Math.pow(10, dec);
  const r = Math.round(Math.abs(n) * f) / f;
  const parts = r.toFixed(dec).split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = (parts[1] || '').replace(/0+$/, '');
  return (n < 0 && r !== 0 ? '-' : '') + int + (frac ? ',' + frac : '');
}
function fmtKg(v, dec){ return fmtNum(v, dec == null ? 2 : dec) + ' kg'; }

// Colores del tema para Chart.js y SVG: se leen de las variables de styles.css (una sola fuente).
// El segundo argumento es el valor por defecto (por si no hay CSS, p. ej. en las pruebas).
function themeColor(name, fallback){
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
    return v || fallback;
  } catch (e) { return fallback; }
}
function chartTheme(){
  if (typeof window !== 'undefined' && window.Chart && window.Chart.defaults) window.Chart.defaults.locale = 'es-ES';
  return {
    text: themeColor('muted', '#9aa1ab'), grid: themeColor('card-border', '#2a2e35'),
    blue: themeColor('blue', '#3f7cf0'), amber: themeColor('amber', '#f2a93b'), green: themeColor('green', '#4caf7d'),
    blueFill: 'rgba(63,124,240,0.15)', greenFill: 'rgba(76,175,125,0.15)',
  };
}

// Foco al abrir/cerrar pantallas superpuestas (resumen, comparativa, diálogos): al abrir pasa al botón de cerrar
// (o al propio diálogo) y al cerrar vuelve a donde estaba, para quien navega con teclado o lector de pantalla.
const _focusStack = [];
function focusOpen(containerId){
  _focusStack.push(document.activeElement);
  const el = document.getElementById(containerId);
  if (!el) return;
  let t = el.querySelector('.summary-close');
  if (!t) { t = el.querySelector('.modal-card'); if (t) t.setAttribute('tabindex', '-1'); }
  if (t && t.focus) t.focus({ preventScroll: true });
}
function focusClose(){
  const prev = _focusStack.pop();
  if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
}
function isShown(id){ const el = document.getElementById(id); return !!el && !!el.style.display && el.style.display !== 'none'; }
