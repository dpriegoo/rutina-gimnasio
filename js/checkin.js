// =====================================================================
// Chequeo diario  (checkin.js)
// Tres preguntas de 10 segundos antes de entrenar: sueño, agujetas y energía (1 = mal, 3 = bien). Solo sirve como UNA señal más para
// proponer una semana de descarga. No hay evidencia verificada de que añada algo a tus datos de entreno: es opcional y se puede ignorar.
// Depende de: utils, deload, state-sync, ui-icons.
// =====================================================================

const CHECKIN_FIELDS = [
  { k: 'sueno',    label: 'Sueño',    opts: ['Mal', 'Normal', 'Bien'] },
  { k: 'agujetas', label: 'Agujetas', opts: ['Muchas', 'Algunas', 'Pocas'] },
  { k: 'energia',  label: 'Energía',  opts: ['Baja', 'Normal', 'Alta'] },
];
const CHECKIN_LOW = 5;            // suma de las tres respuestas (3 a 9) igual o por debajo: día «bajo»
const CHECKIN_WINDOW_DAYS = 10;   // chequeos de los últimos 10 días
const CHECKIN_MIN = 4;            // chequeos mínimos para fiarse
const CHECKIN_LOW_COUNT = 3;      // de los últimos 5, cuántos «bajos» cuentan como señal

function checkinKey(){ return 'checkins_' + getProfile(); }
function checkinSkipKey(){ return 'checkinSkip_' + getProfile(); }
function checkinList(){ try { const l = JSON.parse(localStorage.getItem(checkinKey()) || '[]'); return Array.isArray(l) ? l.filter(x => x && x.fecha) : []; } catch (e) { return []; } }
function checkinSave(l){ try { localStorage.setItem(checkinKey(), JSON.stringify(l.slice(-60))); } catch (e) {} if (typeof stateTouch === 'function') stateTouch('checkins'); }
function checkinToday(){ const t = localDateStr(); return checkinList().find(x => x.fecha === t) || null; }
function checkinScore(x){ return (Number(x.sueno) || 0) + (Number(x.agujetas) || 0) + (Number(x.energia) || 0); }
function checkinComplete(x){ return !!x && CHECKIN_FIELDS.every(f => x[f.k] >= 1 && x[f.k] <= 3); }

let checkinOpen = false;
function checkinOpenToggle(){ checkinOpen = !checkinOpen; renderCheckinCard(); }
function checkinSet(field, v){
  const l = checkinList(), t = localDateStr();
  let x = l.find(e => e.fecha === t); if (!x) { x = { fecha: t }; l.push(x); }
  x[field] = v;
  checkinSave(l);
  renderCheckinCard();
  if (typeof renderDeloadCard === 'function') renderDeloadCard();
}
function checkinSkip(){ try { localStorage.setItem(checkinSkipKey(), localDateStr()); } catch (e) {} renderCheckinCard(); }
function checkinReopen(){ try { localStorage.removeItem(checkinSkipKey()); } catch (e) {} const l = checkinList().filter(e => e.fecha !== localDateStr()); checkinSave(l); renderCheckinCard(); }

// Señal para la descarga: de los últimos 5 chequeos completos de los últimos 10 días, ¿cuántos «bajos»?
function checkinLow(){
  const from = deloadAddDays(localDateStr(), -CHECKIN_WINDOW_DAYS);
  const l = checkinList().filter(x => x.fecha >= from && checkinComplete(x)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-5);
  if (l.length < CHECKIN_MIN) return null;
  const low = l.filter(x => checkinScore(x) <= CHECKIN_LOW).length;
  return { n: l.length, low: low, signal: low >= CHECKIN_LOW_COUNT };
}

function renderCheckinCard(){
  const el = document.getElementById('checkinCard'); if (!el) return;
  if (!getProfile()) { el.innerHTML = ''; return; }
  const x = checkinToday(), skipped = localStorage.getItem(checkinSkipKey()) === localDateStr();
  if (checkinComplete(x)) {
    el.className = 'checkin-card ck-done';
    el.innerHTML = '<span class="ck-sum">' + uiIcon('check', 's') + ' Chequeo de hoy: ' + CHECKIN_FIELDS.map(f => f.label.toLowerCase() + ' ' + f.opts[x[f.k] - 1].toLowerCase()).join(' · ') + '</span><button type="button" class="link-btn" onclick="checkinReopen()">Cambiar</button>';
    return;
  }
  if (skipped) { el.className = 'checkin-card ck-none'; el.innerHTML = ''; return; }
  // Cerrado por defecto: una línea. Se abre al pulsar «Responder» (o si ya has contestado algo hoy)
  if (!checkinOpen && !x) {
    el.className = 'checkin-card ck-line';
    el.innerHTML = '<span class="ck-sum">¿Cómo vienes hoy? <span class="ck-opt">(opcional · 10 s)</span></span><span class="grow"></span><button type="button" class="link-btn" onclick="checkinOpenToggle()">Responder</button><button type="button" class="link-btn" onclick="checkinSkip()">Hoy no</button>';
    return;
  }
  el.className = 'checkin-card';
  el.innerHTML = '<div class="ck-head"><span class="ck-title">¿Cómo vienes hoy?</span><span class="ck-opt">(opcional · 10 s)</span><span class="grow"></span><button type="button" class="link-btn" onclick="checkinSkip()">Hoy no</button></div>' +
    CHECKIN_FIELDS.map(f => '<div class="ck-row"><span class="ck-lbl">' + f.label + '</span><div class="ck-chips" role="group" aria-label="' + f.label + '">' +
      f.opts.map((o, i) => '<button type="button" class="ck-chip" aria-pressed="' + (x && x[f.k] === i + 1) + '" onclick="checkinSet(\'' + f.k + '\', ' + (i + 1) + ')">' + o + '</button>').join('') + '</div></div>').join('');
}
