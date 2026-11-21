// =====================================================================
// RIR real por serie  (rir.js)
// Anotar (opcional) cuántas repeticiones te quedaban al acabar una serie, el texto que lo explica y la calibración
// (comparar lo que CREES que te queda con lo que de verdad te queda al llegar al fallo, en una máquina).
// El valor se guarda siempre en el dispositivo (rirMap) y, si existe la columna sets.rir (supabase/rir.sql), también en el servidor.
// Depende de: utils, outbox, api, ui-icons.
// =====================================================================

// ---------- Guardado ----------
function rirMapKey(){ return 'rirMap_' + getProfile(); }
function rirMap(){ try { return JSON.parse(localStorage.getItem(rirMapKey()) || '{}'); } catch (e) { return {}; } }
function rirStore(id, v){
  const m = rirMap();
  if (v === null) delete m[String(id)]; else m[String(id)] = v;
  const ks = Object.keys(m); if (ks.length > 4000) ks.slice(0, ks.length - 4000).forEach(k => delete m[k]);   // no crece sin límite
  try { localStorage.setItem(rirMapKey(), JSON.stringify(m)); } catch (e) {}
}
// RIR de una fila de la caché: el del servidor si lo hay; si no, el anotado en este dispositivo; null = sin anotar
function rowRir(r){
  const v = r['RIR'];
  if (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) return Number(v);
  const m = rirMap()[String(r['ID'])];
  return m === undefined ? null : Number(m);
}

// Anota o corrige el RIR de una serie ya guardada: al instante en local; en su entrada si aún está en la cola de envío;
// y, si ya está en el servidor y existe la columna, se envía.
async function rirAnnotate(id, rir){
  id = String(id);
  const v = (rir === null || rir === undefined) ? null : Math.max(0, Math.min(10, Math.round(Number(rir))));
  rirStore(id, v);
  const row = (window._progressCache || []).find(r => String(r['ID']) === id);
  if (row) row['RIR'] = v === null ? '' : v;
  let inQueue = false;
  const ob = getOutbox().map(e => { if (String(e.id) === id) { inQueue = true; return Object.assign({}, e, { rir: v }); } return e; });
  if (inQueue) saveOutbox(ob);
  else if (typeof rirColumnReady === 'function' && rirColumnReady()) { try { await postToSheet({ action: 'setRir', id: id, rir: v }); } catch (e) {} }
  return v;
}

// ---------- Anotar desde la tarjeta de descanso ----------
const RIR_CHIPS = [0, 1, 2, 3];   // 3 = «3 o más»
function rirChipsHtml(current, fn){
  return RIR_CHIPS.map(n => '<button type="button" class="rir-pick" data-r="' + n + '" aria-pressed="' + (current === n) + '" onclick="' + fn + '(' + n + ')">' + (n === 3 ? '3+' : n) + '</button>').join('');
}
function rirPick(n){
  if (!restState || !restState.setId) return;
  rirAnnotate(restState.setId, n);
  restState.rir = n;
  const rb = document.getElementById('rcRir'); if (rb) rb.classList.add('picked');   // una vez anotado, el recordatorio sobra y la tarjeta se encoge
  document.querySelectorAll('#rcRir .rir-pick').forEach(b => b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-r')) === n)));
  if (typeof updateCardHighlights === 'function') updateCardHighlights();   // repinta los planes: la serie hecha enseña su RIR
}

// ---------- El texto que lo explica ----------
function rirHelpHtml(){
  const b = typeof rirBias === 'function' ? rirBias() : null;
  return '<p>Al acabar la serie, pregúntate: <b>«¿habría podido hacer otra repetición con la misma técnica, sin rebotes ni ayuda?»</b></p>' +
    '<ul class="rir-list"><li><b>0</b>: no, esa era la última.</li><li><b>1</b>: una más, pero costando mucho.</li><li><b>2</b>: dos más.</li><li><b>3+</b>: iba cómodo; me quedaban tres o más.</li></ul>' +
    '<p>Una pista: si las últimas repeticiones fueron <b>claramente más lentas</b>, suelen ser 1–2 en reserva; si apenas se frenó la velocidad, 3 o más.</p>' +
    '<p>Solemos quedarnos cortos al estimar: de media sobra cerca de 1 repetición más de las que parece, y más aún con más de 12 repeticiones. No pasa nada por equivocarse; solo sirve para que el plan se ajuste a ti.</p>' +
    (b && b.n >= 3 ? '<p class="rir-mine">En tus calibraciones, de media te sobraban <b>' + fmtNum(Math.abs(b.mean), 1) + '</b> repeticiones ' + (b.mean >= 0 ? 'más' : 'menos') + ' de las que creías (' + b.n + ' series).</p>' : '');
}
let _rirPrev = null;
function rirHelpOpen(){
  document.getElementById('rirHelpBody').innerHTML = rirHelpHtml();
  const box = document.getElementById('rirSheet'); box.style.display = 'flex';
  _rirPrev = document.activeElement; document.getElementById('rirCard').focus({ preventScroll: true });
}
function rirHelpClose(){
  document.getElementById('rirSheet').style.display = 'none';
  if (_rirPrev && _rirPrev.focus && document.contains(_rirPrev)) _rirPrev.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isShown('rirSheet')) rirHelpClose(); });

// =====================================================================
// Calibración: lo que CREES que te queda frente a lo que de verdad te queda
// Se hace en una máquina o polea (nunca con barra libre): una serie normal que paras cuando crees que te quedan N repeticiones,
// y sigues hasta el fallo técnico contando cuántas más haces. real - creído = cuánto te quedas corto al estimar.
// Los resultados se guardan en el dispositivo.
// =====================================================================
function rirCalKey(){ return 'rirCal_' + getProfile(); }
function rirCalList(){ try { const l = JSON.parse(localStorage.getItem(rirCalKey()) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function rirCalAdd(rec){
  const l = rirCalList(); l.push(rec);
  try { localStorage.setItem(rirCalKey(), JSON.stringify(l.slice(-80))); } catch (e) {}
}
// Sesgo medio: positivo = te sobran más repeticiones de las que crees
function rirBias(){
  const l = rirCalList().filter(x => isFinite(x.pred) && isFinite(x.real));
  if (!l.length) return null;
  const d = l.map(x => x.real - x.pred), mean = d.reduce((a, b) => a + b, 0) / d.length;
  const sd = d.length > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (d.length - 1)) : 0;
  return { n: d.length, mean: mean, sd: sd, more: d.filter(x => x > 0).length, equal: d.filter(x => x === 0).length, less: d.filter(x => x < 0).length };
}
// Ejercicios en los que es razonable llegar al fallo para calibrar: accesorios en máquina o polea (no barra libre)
function rirCalExercises(){
  const seen = {}, out = [];
  (typeof DAYS !== 'undefined' ? DAYS : []).forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => {
    const sp = prescriptionSpec(ex, '');
    if (seen[ex.name] || sp.cat !== 'accesorio' || sp.timed || !rxIsMachineVariant(ex.primary)) return;
    seen[ex.name] = true; out.push({ name: ex.name, primary: ex.primary });
  })));
  return out;
}

let calState = { step: 0, ej: '', pred: 2, real: 0 }, _calPrev = null;
function calOpen(){
  calState = { step: 0, ej: (rirCalExercises()[0] || {}).name || '', pred: 2, real: 0 };
  calRender();
  document.getElementById('calSheet').style.display = 'flex';
  _calPrev = document.activeElement; document.getElementById('calCard').focus({ preventScroll: true });
}
function calClose(){
  document.getElementById('calSheet').style.display = 'none';
  if (_calPrev && _calPrev.focus && document.contains(_calPrev)) _calPrev.focus({ preventScroll: true });
  if (typeof renderCalCard === 'function') renderCalCard();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isShown('calSheet')) calClose(); });
function calGo(step){ if (step === 1) calState.real = 0; calState.step = step; calRender(); }   // una serie nueva empieza a contar de cero
function calSetEj(v){ calState.ej = v; }
function calPred(n){ calState.pred = n; calRender(); }
function calStepReal(d){ calState.real = Math.max(0, Math.min(30, calState.real + d)); calRender(); }
function calSave(){
  rirCalAdd({ fecha: localDateStr(), ej: calState.ej, pred: calState.pred, real: calState.real });
  calGo(3);
}

function calRender(){
  const body = document.getElementById('calBody'), s = calState, ex = rirCalExercises();
  const btn = (cls, fn, txt, dis) => '<button type="button" class="' + cls + '" ' + (dis ? 'disabled ' : '') + 'onclick="' + fn + '">' + txt + '</button>';
  let h = '';
  if (s.step === 0) {
    h = '<p class="cal-p">Vamos a comprobar <b>cuántas repeticiones te quedan de verdad</b> cuando crees que te quedan 1, 2 o 3. Son tres pasos y te lleva dos o tres minutos.</p>' +
      '<p class="cal-p cal-warn">Solo en <b>máquinas o poleas</b>, donde llegar al fallo es seguro. <b>Nunca</b> con barra libre (press banca, sentadilla, peso muerto…).</p>' +
      (ex.length
        ? '<label class="lbl" for="calEj">Ejercicio</label><select id="calEj" class="metric-select" onchange="calSetEj(this.value)">' + ex.map(e => '<option value="' + escHtml(e.name) + '"' + (e.name === s.ej ? ' selected' : '') + '>' + escHtml(e.name) + '</option>').join('') + '</select>'
        : '<div class="empty-note">No hay ejercicios de máquina o polea en tu rutina. Añade alguno (por ejemplo, aperturas en máquina) para calibrar.</div>') +
      '<div class="sd-btns">' + btn('pri', 'calGo(1)', 'Empezar', !ex.length) + btn('', 'calClose()', 'Cancelar') + '</div>';
  } else if (s.step === 1) {
    h = '<p class="cal-p"><b>Paso 1.</b> Haz una serie normal con tu carga habitual. <b>Para cuando creas que te quedan</b>:</p>' +
      '<div class="rir-chips">' + [1, 2, 3].map(n => '<button type="button" class="rir-pick" aria-pressed="' + (s.pred === n) + '" onclick="calPred(' + n + ')">' + n + '</button>').join('') + '<span></span></div>' +
      '<p class="cal-p mini-sub">Para de verdad y apunta mentalmente tu número: no sigas todavía.</p>' +
      '<div class="sd-btns">' + btn('pri', 'calGo(2)', 'Ya paré: sigo hasta el fallo') + btn('', 'calGo(0)', 'Atrás') + '</div>';
  } else if (s.step === 2) {
    h = '<p class="cal-p"><b>Paso 2.</b> Sin soltar, <b>sigue hasta el fallo técnico</b> (la última repetición con buena técnica, sin rebotes). ¿Cuántas repeticiones más has hecho desde que paraste?</p>' +
      '<div class="stp cal-stp"><button type="button" aria-label="Una menos" onclick="calStepReal(-1)">' + uiIcon('minus') + '</button><div class="v">' + s.real + '</div><button type="button" aria-label="Una más" onclick="calStepReal(1)">' + uiIcon('plus') + '</button></div>' +
      '<div class="sd-btns">' + btn('pri', 'calSave()', 'Guardar') + btn('', 'calGo(1)', 'Atrás') + '</div>';
  } else {
    const d = s.real - s.pred, b = rirBias();
    h = '<div class="cal-res">Creías que te quedaban <b>' + s.pred + '</b> y te quedaban <b>' + s.real + '</b>.</div>' +
      '<p class="cal-p">' + (d > 0 ? 'Te sobraban <b>' + d + '</b> más de las que creías: es lo habitual (solemos quedarnos cortos al estimar).' : (d === 0 ? 'Buen cálculo: acertaste.' : 'Te quedaste sin fuerza antes de lo que pensabas: hoy estimaste de más.')) + '</p>' +
      (b && b.n >= 3 ? '<p class="cal-p rir-mine">Con tus ' + b.n + ' calibraciones, de media te sobran <b>' + fmtNum(b.mean, 1) + '</b> repeticiones ' + (b.mean >= 0 ? 'más' : 'menos') + ' de las que crees (' + b.more + ' veces más, ' + b.equal + ' igual, ' + b.less + ' menos).</p>' : '<p class="cal-p mini-sub">Con 3 o más calibraciones, la app te dirá tu desviación media.</p>') +
      '<div class="sd-btns">' + btn('pri', 'calClose()', 'Listo') + btn('', 'calGo(1)', 'Otra serie') + '</div>';
  }
  body.innerHTML = h;
}

// Tarjeta de Métricas > Ejercicios
function renderCalCard(){
  const el = document.getElementById('calStatBody'); if (!el) return;
  const b = rirBias();
  el.innerHTML = (b
    ? '<div class="cal-big">' + (b.mean >= 0 ? '+' : '−') + fmtNum(Math.abs(b.mean), 1) + '</div><div class="metric-sub" style="margin:0 0 10px;">repeticiones de media entre lo que crees que te queda y lo que te queda de verdad (' + b.n + ' ' + (b.n === 1 ? 'serie' : 'series') + (b.n < 3 ? ': aún pocas para fiarse' : '') + '). ' + (b.mean > 0.4 ? 'Te quedas corto: cuando creas que te queda 1, probablemente te queden ' + Math.round(1 + b.mean) + '.' : (b.mean < -0.4 ? 'Tiendes a estimar de más.' : 'Estimas bien.')) + '</div>'
    : '<div class="metric-sub" style="margin:0 0 10px;">Aún no has calibrado. Es una serie en una máquina, hasta el fallo, para ver cuánto te quedas corto al estimar el RIR.</div>') +
    '<button type="button" class="log-add" style="width:100%" onclick="calOpen()">' + (b ? 'Calibrar otra vez' : 'Empezar calibración') + '</button>';
}
