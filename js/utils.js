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
