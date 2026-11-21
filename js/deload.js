// =====================================================================
// Semana de descarga  (deload.js)
// Una semana de 7 días con MENOS volumen y la misma carga: 2 series por ejercicio (en vez de 3) y un RIR más.
// Lo que respalda la literatura (docs/evidencia-prescripcion.md): descargas típicas de 5-7 días; reducir el volumen
// manteniendo la carga preservó las adaptaciones; parar del todo una semana no mejoró nada en entrenados y redujo la fuerza máxima.
// NO hay ningún criterio validado sobre CUÁNDO descargar: la app solo lo PROPONE a partir de señales de tus datos
// (rendimiento a la baja, plan incumplido, semanas seguidas sin descarga), con el motivo a la vista, y decides tú.
// Depende de: utils, prescription (rxLoadPlans), progress-chart (exerciseSeries), outbox, ui-icons.
// =====================================================================

const DELOAD_DAYS = 7;
const DELOAD_SERIES = 2;            // series por ejercicio durante la descarga
const DELOAD_RIR_PLUS = 1;          // un RIR más en cada serie
const DELOAD_PERF_RATIO = 0.97;     // fuerza estimada reciente / tu base: por debajo de esto cuenta como señal (el ruido de un día ronda el 1,5 %)
const DELOAD_MIN_EXERCISES = 3;     // ejercicios con datos suficientes para fiarse de la señal de rendimiento
const DELOAD_ADHERENCE_SETS = 9;    // series del plan mínimas para valorar si lo cumples
const DELOAD_ADHERENCE_MIN = 0.6;
const DELOAD_WEEKS_SOFT = 8;        // semanas seguidas sin descarga a partir de las cuales se avisa (aviso suave)
const DELOAD_SNOOZE_DAYS = 7;

// ---------- Estado (en este dispositivo, por perfil) ----------
function deloadListKey(){ return 'deloadList_' + getProfile(); }
function deloadSnoozeKey(){ return 'deloadSnooze_' + getProfile(); }
function deloadList(){
  try {
    const l = JSON.parse(localStorage.getItem(deloadListKey()) || '[]');
    return Array.isArray(l) ? l.filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.start) && /^\d{4}-\d{2}-\d{2}$/.test(p.end)) : [];
  } catch (e) { return []; }
}
function deloadSave(l){ try { localStorage.setItem(deloadListKey(), JSON.stringify(l)); } catch (e) {} if (typeof stateTouch === 'function') stateTouch('deload'); }
function deloadAddDays(dateStr, n){ const d = parseLocalDate(dateStr); d.setDate(d.getDate() + n); return localDateStr(d); }

// ¿Cae esa fecha dentro de alguna descarga (pasada o actual)?
function deloadOn(dateStr){ return deloadList().some(p => dateStr >= p.start && dateStr <= p.end); }
function deloadCurrent(){ const t = localDateStr(); return deloadList().find(p => t >= p.start && t <= p.end) || null; }
function deloadActive(){ return !!deloadCurrent(); }
// ¿La semana que empieza en weekStart (Date) tiene algún día de descarga?
function deloadWeekHas(weekStart){
  const a = localDateStr(weekStart), b = deloadAddDays(a, 6);
  return deloadList().some(p => p.start <= b && p.end >= a);
}

// Series por ejercicio y semana que cuentan como «completo»: 3, o 2 en una semana de descarga
function weeklyTarget(){ return deloadActive() ? DELOAD_SERIES : 3; }
function weeklyTargetFor(weekStart){
  const a = localDateStr(weekStart); let days = 0;
  for (let i = 0; i < 7; i++) if (deloadOn(deloadAddDays(a, i))) days++;
  return days >= 4 ? DELOAD_SERIES : 3;
}

function deloadRefresh(){
  renderDeloadCard();
  if (typeof renderTabs === 'function') renderTabs();
  if (typeof renderPriorityBanner === 'function') renderPriorityBanner();
  if (typeof dayScreenOpen !== 'undefined' && dayScreenOpen) renderDay();
}

function deloadStart(){
  if (!getProfile() || deloadActive()) return;
  const t = localDateStr(), l = deloadList();
  l.push({ start: t, end: deloadAddDays(t, DELOAD_DAYS - 1) });
  deloadSave(l);
  try { localStorage.removeItem(deloadSnoozeKey()); } catch (e) {}
  deloadManualOpen = false;
  deloadRefresh();
  showToast('Semana de descarga activada: ' + DELOAD_SERIES + ' series por ejercicio y un RIR más');
}

function deloadStop(){
  const cur = deloadCurrent(); if (!cur) return;
  const y = deloadAddDays(localDateStr(), -1);
  const l = deloadList().filter(p => !(p.start === cur.start && p.end === cur.end));
  if (y >= cur.start) l.push({ start: cur.start, end: y });
  deloadSave(l);
  deloadRefresh();
  showToast('Descarga terminada: vuelves a ' + 3 + ' series por ejercicio');
}

function deloadSnooze(){
  try { localStorage.setItem(deloadSnoozeKey(), deloadAddDays(localDateStr(), DELOAD_SNOOZE_DAYS)); } catch (e) {}
  renderDeloadCard();
}

// ---------- Señales para proponerla ----------
// 1) Rendimiento: fuerza estimada de las últimas 2 semanas frente a la mediana de tus 6 semanas anteriores, por ejercicio
//    (sin contar semanas de descarga ni ejercicios por tiempo). Media de los ratios de los ejercicios con datos suficientes.
function deloadPerformance(){
  const rows = myRows().filter(r => !isWarmupRow(r));
  const names = []; rows.forEach(r => { const e = r['Ejercicio']; if (e && !isTimedExercise(e) && names.indexOf(e) < 0) names.push(e); });
  const weeks = []; for (let k = 0; k >= -7; k--) { const ws = getWeekStartOffset(k); weeks.push({ key: localDateStr(ws), skip: deloadWeekHas(ws) }); }
  const idx = {}; weeks.forEach((w, i) => { idx[w.key] = i; });
  const ratios = [];
  names.forEach(ex => {
    const per = weeks.map(() => []);
    exerciseSeries(ex).sessions.forEach(s => {
      const i = idx[localDateStr(mondayOf(parseLocalDate(s.fecha)))];
      if (i !== undefined && !weeks[i].skip && s.value > 0) per[i].push(s.value);
    });
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const wk = per.map(a => a.length ? mean(a) : null);
    const recent = [wk[0], wk[1]].filter(v => v !== null);
    const base = wk.slice(2).filter(v => v !== null).sort((a, b) => a - b);
    if (!recent.length || base.length < 3) return;
    ratios.push(mean(recent) / base[Math.floor(base.length / 2)]);
  });
  if (ratios.length < DELOAD_MIN_EXERCISES) return null;
  return { ratio: ratios.reduce((x, y) => x + y, 0) / ratios.length, n: ratios.length };
}

// 2) Plan: series de los últimos 14 días que llegaron al objetivo de repeticiones que tenía el plan
function deloadAdherence(){
  const since = deloadAddDays(localDateStr(), -14), plans = rxLoadPlans(), rows = myRows().filter(r => !isWarmupRow(r));
  let planned = 0, met = 0;
  Object.keys(plans).forEach(k => {
    const pl = plans[k]; if (!pl || !pl.fecha || pl.fecha < since || deloadOn(pl.fecha) || !Array.isArray(pl.targets)) return;
    const ej = k.split('|')[0];
    rows.filter(r => r['Ejercicio'] === ej && String(r['Fecha']).slice(0, 10) === pl.fecha).slice(0, 3).forEach((s, i) => {
      if (pl.targets[i] !== undefined) { planned++; if ((Number(s['Reps']) || 0) >= pl.targets[i]) met++; }
    });
  });
  return { planned: planned, met: met };
}

// 3) Semanas seguidas entrenando (2 días o más por semana) sin ninguna descarga: se cuenta hacia atrás desde la semana pasada
function deloadWeeksSince(){
  const dates = {}; myRows().filter(r => !isWarmupRow(r)).forEach(r => { dates[String(r['Fecha']).slice(0, 10)] = true; });
  const all = Object.keys(dates);
  let n = 0;
  for (let k = -1; k >= -26; k--) {
    const ws = getWeekStartOffset(k), a = localDateStr(ws), b = deloadAddDays(a, 6);
    if (deloadWeekHas(ws)) break;
    if (all.filter(f => f >= a && f <= b).length < 2) break;
    n++;
  }
  return n;
}

const _deloadMemo = new WeakMap();
// null si no hay motivo (o la has pospuesto, o ya estás en una); si no, { reasons, soft }
function deloadSuggestion(){
  if (!getProfile() || deloadActive()) return null;
  const snooze = localStorage.getItem(deloadSnoozeKey());
  if (snooze && localDateStr() <= snooze) return null;
  const cache = window._progressCache || [];
  const key = cache.length + '|' + localDateStr() + '|' + JSON.stringify(deloadList()) + '|' + (typeof checkinList === 'function' ? JSON.stringify(checkinList()).length : 0) + '|' + JSON.stringify(rxLoadPlans()).length + '|' + (typeof getOutbox === 'function' ? getOutbox().length : 0);
  const memo = _deloadMemo.get(cache);
  if (memo && memo.key === key) return memo.value;
  const reasons = []; let strong = false;
  const perf = deloadPerformance();
  if (perf && perf.ratio <= DELOAD_PERF_RATIO) { strong = true; reasons.push('Tu fuerza estimada de las últimas 2 semanas está un ' + Math.round((1 - perf.ratio) * 100) + ' % por debajo de tu media de las 6 anteriores (' + perf.n + ' ejercicios).'); }
  const adh = deloadAdherence();
  if (adh.planned >= DELOAD_ADHERENCE_SETS && adh.met / adh.planned < DELOAD_ADHERENCE_MIN) { strong = true; reasons.push('Solo cumpliste ' + adh.met + ' de ' + adh.planned + ' series del plan en los últimos 14 días.'); }
  const ck = typeof checkinLow === 'function' ? checkinLow() : null;
  if (ck && ck.signal) { strong = true; reasons.push('En ' + ck.low + ' de tus últimos ' + ck.n + ' chequeos marcaste sueño, agujetas o energía en niveles bajos.'); }
  const wk = deloadWeeksSince();
  if (wk >= DELOAD_WEEKS_SOFT) reasons.push('Llevas ' + wk + ' semanas seguidas entrenando sin una descarga.');
  const value = reasons.length ? { reasons: reasons, soft: !strong } : null;
  _deloadMemo.set(cache, { key: key, value: value });
  return value;
}

// ---------- Tarjeta del selector de día ----------
let deloadManualOpen = false, deloadExpanded = false;
function deloadExpand(){ deloadExpanded = true; renderDeloadCard(); }
function deloadToggleManual(){ deloadManualOpen = !deloadManualOpen; renderDeloadCard(); }
function deloadDM(s){ return s.slice(8, 10) + '/' + s.slice(5, 7); }

function renderDeloadCard(){
  const el = document.getElementById('deloadCard'); if (!el) return;
  const cur = deloadCurrent();
  const how = 'Una semana de descarga baja el volumen para soltar fatiga: ' + DELOAD_SERIES + ' series por ejercicio (en vez de 3), la carga de siempre y un RIR más. Dura ' + DELOAD_DAYS + ' días. Parar del todo no ha mostrado ventajas en gente entrenada.';
  let html = '', cls = 'dl-none';
  if (cur) {
    cls = 'dl-on';
    html = '<div class="dl-title">' + uiIcon('timer') + ' Semana de descarga activa</div>' +
      '<div class="dl-text">Hasta el ' + deloadDM(cur.end) + ': ' + DELOAD_SERIES + ' series por ejercicio, la carga de siempre y un RIR más. Tus marcas y tu historial siguen contando, y el plan no se mueve mientras tanto.</div>' +
      '<div class="dl-btns"><button type="button" class="dl-btn" onclick="deloadStop()">Terminar ya</button></div>';
  } else {
    const sug = deloadSuggestion();
    if (sug) {
      cls = sug.soft ? 'dl-soft' : 'dl-sug';
      // El aviso suave (solo por semanas seguidas) va plegado en una línea para no empujar las fichas de día; el que tiene una señal real, abierto
      if (sug.soft && !deloadExpanded) html = '<button type="button" class="dl-line" aria-expanded="false" onclick="deloadExpand()">' + uiIcon('info') + ' <span>Podrías descargar esta semana</span><span class="grow"></span>' + uiIcon('chevD', 's') + '</button>';
      else html = '<div class="dl-title">' + uiIcon('info') + ' ' + (sug.soft ? 'Podrías descargar esta semana' : 'Te sugiero una semana de descarga') + '</div>' +
        '<ul class="dl-why">' + sug.reasons.map(r => '<li>' + escHtml(r) + '</li>').join('') + '</ul>' +
        '<div class="dl-text dl-caveat">No hay un criterio validado sobre cuándo descargar: es una sugerencia a partir de tus datos, no una regla. Si te encuentras bien, no la necesitas.</div>' +
        '<details class="dl-more"><summary>Qué incluye una descarga</summary><div class="dl-text">' + escHtml(how) + '</div></details>' +
        '<div class="dl-btns"><button type="button" class="dl-btn pri" onclick="deloadStart()">Empezar descarga</button><button type="button" class="dl-btn" onclick="deloadSnooze()">Ahora no</button></div>';
    } else if (deloadManualOpen) {
      cls = 'dl-man';
      html = '<div class="dl-title">' + uiIcon('timer') + ' Semana de descarga</div><div class="dl-text">' + escHtml(how) + '</div>' +
        '<div class="dl-btns"><button type="button" class="dl-btn pri" onclick="deloadStart()">Empezar descarga</button><button type="button" class="dl-btn" onclick="deloadToggleManual()">Cancelar</button></div>';
    } else {
      html = '<button type="button" class="link-btn" onclick="deloadToggleManual()" aria-expanded="false">Programar una semana de descarga</button>';
    }
  }
  el.className = 'deload-card ' + cls;
  el.innerHTML = html;
}
