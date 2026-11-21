// =====================================================================
// Modo entreno  (training.js)
// Dentro de cada tarjeta: el plan de hoy serie a serie (repeticiones objetivo y RIR de cada una), un toque para dar una serie
// por hecha, cambio de máquina en un paso, temporizador de descanso, barra de sesión (tiempo, progreso, siguiente) y el
// cierre de sesión con su resumen. Lo que se registra pasa por el mismo flujo de siempre (pendientes -> aceptar -> cola).
// Depende de: prescription, day-view, day-picker, outbox, utils, ui-icons.
// =====================================================================

const trainState = {};        // logId -> { peso, reps: {idx: n}, extra, focus }
let trainJustLogged = false;  // solo se felicita al terminar un día tras registrar una serie en esta sesión de la app

function trainSt(logId){ return trainState[logId] || (trainState[logId] = { reps: {} }); }
function trainCard(logId){ const f = document.getElementById(logId); return f ? f.closest('.card') : null; }
function trainDia(cardEl){ const day = DAYS[currentDay]; return cardEl.getAttribute('data-borrow-dia') || (day && day.name) || ''; }

// ---------- Máquina o material ----------
function renderMachineBar(cardEl){
  const ex = cardEl._ex; if (!ex) return;
  const v = cardVariant(cardEl);
  const name = cardEl.querySelector('.mb-name');
  if (name) name.textContent = v || ex.primary || 'La habitual';
  cardEl.querySelectorAll('.alt-opt').forEach(b => { const on = (b.getAttribute('data-v') || '') === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}

function toggleAlt(logId){
  const card = trainCard(logId); if (!card) return;
  const pk = card.querySelector('.alt-picker'), btn = card.querySelector('.mb-swap');
  const open = pk.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}

function useMachine(logId, value){
  const card = trainCard(logId); if (!card) return;
  const sel = card.querySelector('.inp-variante');
  if (sel) sel.value = value;
  const st = trainSt(logId); delete st.peso; st.reps = {};
  const pk = card.querySelector('.alt-picker'); if (pk) pk.classList.remove('open');
  const btn = card.querySelector('.mb-swap'); if (btn) btn.setAttribute('aria-expanded', 'false');
  updateCardHints(card); renderMachineBar(card); renderPlan(card);
  showToast('Registrarás en: ' + (value || (card._ex && card._ex.primary) || 'la habitual'));
}

// El selector de variante del registro manual también mueve el plan
function onVariantChange(sel){
  const card = sel.closest('.card'); if (!card) return;
  const f = card.querySelector('.plan'); if (f) { const st = trainSt(f.dataset.log); delete st.peso; st.reps = {}; }
  updateCardHints(card); renderMachineBar(card); renderPlan(card);
}

// ---------- Plan serie a serie ----------
function planStepper(label, kind, logId, valueHtml, aria, cls){
  const long = String(valueHtml).replace(/<[^>]+>/g, '').length >= (kind === 'reps' ? 3 : 6);   // 112,5 o 100 s: letra algo menor para que quepa
  return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span class="sr-lbl">' + label + '</span><div class="stp">' +
    '<button type="button" data-f="' + kind + '-" aria-label="' + aria + ' menos" onclick="planStep(\'' + logId + '\',\'' + kind + '\',-1)">' + uiIcon('minus') + '</button>' +
    '<div class="v' + (long ? ' long' : '') + '">' + valueHtml + '</div>' +
    '<button type="button" data-f="' + kind + '+" aria-label="' + aria + ' más" onclick="planStep(\'' + logId + '\',\'' + kind + '\',1)">' + uiIcon('plus') + '</button></div></div>';
}

function renderPlan(cardEl){
  const box = cardEl.querySelector('.plan'), ex = cardEl._ex;
  if (!box || !ex || !DAYS[currentDay]) return;
  const logId = box.dataset.log, dia = trainDia(cardEl), v = cardVariant(cardEl);
  const timed = isTimedExercise(ex.name);
  const plan = rxPlan(ex, v), spec = plan.spec, step = timed ? 5 : rxStep(ex, spec, v);
  const done = rxWeekSets(dia, ex.name), st = trainSt(logId);
  const nPlan = plan.sets.length, idx = done.length;
  const complete = idx >= nPlan && !st.extra;
  const nRows = Math.max(nPlan, idx + (st.extra && idx >= nPlan ? 1 : 0));

  // Peso de la serie activa: lo que toques > la última serie de hoy > el plan > la última vez en cualquier máquina > 20 kg
  const lastAny = lastSessionValue(ex.name);
  const basePeso = st.peso !== undefined ? st.peso : (done.length ? done[done.length - 1].peso : (plan.peso != null ? plan.peso : (lastAny ? Number(lastAny.peso) : 20)));
  const target = plan.sets[Math.min(idx, nPlan - 1)];
  const reps = st.reps[idx] !== undefined ? st.reps[idx] : target.reps;
  st.cur = { peso: basePeso, reps: reps, step: step, idx: idx };

  // Calentamiento sugerido (solo pesados, antes de la primera serie de trabajo): se apunta como calentamiento y no cuenta para nada
  const hoyS = localDateStr();
  const warm = (done.length === 0 && !timed) ? rxWarmup(ex, spec, basePeso, step) : [];
  const warmToday = myRows().filter(r => isWarmupRow(r) && r['Día'] === dia && r['Ejercicio'] === ex.name && String(r['Fecha']).slice(0, 10) === hoyS).length;
  let warmHtml = '';
  if (warm.length) {
    const wopen = !!st.warm;
    warmHtml = '<div class="warm-box"><button type="button" class="warm-toggle" aria-expanded="' + wopen + '" onclick="warmToggle(\'' + logId + '\')">' + uiIcon('flame', 's') + ' Calentamiento <span class="mini-sub">(opcional · ' + warm.length + ' series)</span><span class="grow"></span>' + uiIcon(wopen ? 'chevU' : 'chevD', 's') + '</button>' +
      (wopen ? '<div class="warm-rows">' + warm.map((w, i) => '<div class="warm-row' + (i < warmToday ? ' done' : '') + '"><span class="warm-txt">' + fmtNum(w.peso, 2) + ' kg × ' + w.reps + '</span>' +
        (i < warmToday ? '<span class="warm-ok" aria-label="Hecha">' + uiIcon('check', 's') + '</span>' : '<button type="button" class="warm-go" ' + (i > warmToday ? 'disabled' : '') + ' onclick="warmDone(\'' + logId + '\', ' + i + ')">Hecha</button>') + '</div>').join('') +
        '<div class="mini-sub">Una rampa hacia tu carga de trabajo, con poco cansancio. No cuenta para tus series ni para tu progreso. Es un criterio práctico, no un dato.</div></div>' : '') + '</div>';
  }

  const unit = timed ? 's' : 'reps';
  let rows = '';
  for (let i = 0; i < nRows; i++) {
    const t = plan.sets[Math.min(i, nPlan - 1)], rir = i < nPlan ? t.rir : null;
    const chip = rir === null ? '' : '<span class="rir-chip' + (rir === 0 ? ' f' : '') + '">' + rxRirLabel(rir) + '</span>';
    const goalTxt = 'Serie ' + (i + 1) + (i >= nPlan ? ' extra' : '') + ' · ' + t.reps + ' ' + unit;
    if (i < idx) {
      const d = done[i], tgt = i < nPlan ? t.reps : null;
      const sub = 'Serie ' + (i + 1) + (tgt !== null ? ' · objetivo ' + tgt : '') + (d.variante ? ' · ' + escHtml(d.variante) : '');
      const rirBtn = d.id === undefined ? '' : '<button type="button" class="rir-tag' + (d.rir === null ? ' none' : '') + '" aria-expanded="' + (st.rirOpen === String(d.id)) + '" aria-label="' + (d.rir === null ? 'Anotar cuántas te quedaban' : 'RIR ' + d.rir + ': cambiar') + '" onclick="rirInline(\'' + logId + '\', \'' + jsArg(String(d.id)) + '\')">' + (d.rir === null ? 'RIR' : 'RIR ' + (d.rir >= 3 ? '3+' : d.rir)) + '</button>';
      const inl = (d.id !== undefined && st.rirOpen === String(d.id)) ? '<div class="rir-inline"><span class="sr-lbl">¿Cuántas te quedaban? <button type="button" class="rir-help-btn" onclick="rirHelpOpen()" aria-label="Cómo saber cuántas te quedaban">?</button></span><div class="rir-chips" role="group" aria-label="Repeticiones que te quedaban">' + RIR_CHIPS.map(n => '<button type="button" class="rir-pick" aria-pressed="' + (d.rir === n) + '" onclick="rirInlinePick(\'' + logId + '\', \'' + jsArg(String(d.id)) + '\', ' + n + ')">' + (n === 3 ? '3+' : n) + '</button>').join('') + '</div></div>' : '';
      rows += '<div class="sr done"><span class="sn">' + uiIcon('check') + '</span><div class="sr-main"><div class="sr-goal">' + (timed ? d.reps + ' s' : fmtNum(d.peso, 2) + ' kg × ' + d.reps) + '</div><div class="sr-sub">' + sub + '</div></div>' + rirBtn + inl + '</div>';
    } else if (i === idx) {
      rows += '<div class="sr act"><span class="sn">' + (i + 1) + '</span><div class="sr-main"><div class="sr-goal">' + goalTxt + '</div>' +
        '<div class="sr-sub">' + chip + (rir !== null ? ' ' + rxRirHelp(rir) : '') + '</div></div>' +
        // El peso ocupa toda la fila (con decimales necesita sitio) y las repeticiones comparten fila con «Hecha»
        '<div class="sr-edit">' +
        (timed ? '' : planStepper('Peso (kg)', 'peso', logId, fmtNum(basePeso, 2), 'Peso', 'sr-peso')) +
        planStepper(timed ? 'Segundos' : 'Repeticiones', 'reps', logId, String(reps), timed ? 'Segundos' : 'Repeticiones') +
        '<button type="button" class="sr-go" data-f="go" onclick="planDone(\'' + logId + '\')">Hecha</button></div></div>';
    } else {
      rows += '<div class="sr"><span class="sn">' + (i + 1) + '</span><div class="sr-main"><div class="sr-goal">' + goalTxt + '</div><div class="sr-sub">' + chip + '</div></div></div>';
    }
  }
  const undo = lastAcceptedByLogId[logId];
  const whyOpen = box.classList.contains('show-why');
  const head = '<div class="plan-head"><div class="plan-title">' + (plan.peso != null || done.length ? 'Plan de hoy' + (plan.peso != null && !timed ? ' · ' + fmtNum(plan.peso, 2) + ' kg' : '') : 'Plan de hoy') + '</div>' +
    '<span class="grow"></span>' + (undo ? '<button type="button" class="link-btn" onclick="undoLastAccept(\'' + logId + '\')">Deshacer última</button>' : '') +
    '<button type="button" class="plan-info" aria-expanded="' + whyOpen + '" aria-label="¿Por qué este plan?" onclick="planToggleWhy(\'' + logId + '\')">' + uiIcon('info') + '</button></div>';
  const why = '<div class="plan-why">' + escHtml(plan.motivo) + '</div>' + (spec.nota ? '<div class="plan-note">' + escHtml(spec.nota) + '</div>' : '') + (spec.notaReps ? '<div class="plan-note">' + escHtml(spec.notaReps) + '</div>' : '');
  const foot = complete
    ? '<div class="plan-done">' + uiIcon('check') + ' Ejercicio completo</div><div class="plan-foot"><span class="mini-sub">Descanso recomendado ' + rxFmtRestRange(spec) + '</span><button type="button" class="link-btn" onclick="planExtra(\'' + logId + '\')">Añadir serie extra</button></div>'
    : '<div class="plan-foot"><span class="mini-sub">' + uiIcon('timer', 's') + ' Descanso recomendado ' + rxFmtRestRange(spec) + '</span></div>';
  box.innerHTML = head + why + warmHtml + rows + foot;
  box.setAttribute('data-complete', complete ? '1' : '0');
  if (st.focus) { const f = box.querySelector('[data-f="' + st.focus + '"]'); st.focus = null; if (f && f.focus) f.focus({ preventScroll: true }); }
}

function planStep(logId, kind, dir){
  const st = trainSt(logId); if (!st.cur) return;
  const cur = st.cur;
  if (kind === 'peso') st.peso = Math.max(0, Math.round((cur.peso + dir * cur.step) * 100) / 100);
  else st.reps[cur.idx] = Math.max(0, cur.reps + dir * (isTimedExercise(trainCard(logId)._ex.name) ? 5 : 1));
  st.focus = kind + (dir > 0 ? '+' : '-');
  renderPlan(trainCard(logId));
}

// En pantallas bajas la explicación del plan se pliega para que "Hecha" quede a la vista sin hacer scroll
function planToggleWhy(logId){
  const card = trainCard(logId); if (!card) return;
  card.querySelector('.plan').classList.toggle('show-why'); renderPlan(card);
}

// RIR de una serie ya hecha, desde su propia fila
function rirInline(logId, id){ const st = trainSt(logId); st.rirOpen = st.rirOpen === String(id) ? null : String(id); renderPlan(trainCard(logId)); }
function rirInlinePick(logId, id, n){ rirAnnotate(id, n); trainSt(logId).rirOpen = null; if (typeof updateCardHighlights === 'function') updateCardHighlights(); }

function warmToggle(logId){ const st = trainSt(logId); st.warm = !st.warm; renderPlan(trainCard(logId)); }
function warmDone(logId, i){
  const card = trainCard(logId), st = trainSt(logId); if (!card || !st.cur) return;
  const ex = card._ex, spec = prescriptionSpec(ex, cardVariant(card)), w = rxWarmup(ex, spec, st.cur.peso, st.cur.step)[i];
  if (!w) return;
  sessionEnsureStart();
  quickLogSet(logId, { peso: w.peso, reps: w.reps, variante: cardVariant(card), calentamiento: true });
  renderPlan(card);
}

function planExtra(logId){ trainSt(logId).extra = true; renderPlan(trainCard(logId)); }

// Guarda una serie por el flujo de siempre: pendiente + aceptar (la cola de envío y el "deshacer" siguen igual)
function quickLogSet(logId, v){
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const rows = getPendingRows();
  (rows[logId] = rows[logId] || []).push({ peso: String(v.peso), reps: String(v.reps), variante: v.variante || '', calentamiento: !!v.calentamiento, nota: '', rir: (v.rir === undefined ? null : v.rir), id: id });
  savePendingRows(rows);
  return { id: id, done: acceptPending(logId) };
}

function planDone(logId){
  const card = trainCard(logId), st = trainSt(logId); if (!card || !st.cur) return;
  const ex = card._ex, timed = isTimedExercise(ex.name), v = cardVariant(card), cur = st.cur;
  if (!(cur.reps > 0)) { showToast(timed ? 'Pon los segundos' : 'Pon las repeticiones'); return; }
  if (!timed && !(cur.peso > 0)) { showToast('Pon la carga de la serie'); return; }
  const plan = rxPlan(ex, v);
  if (cur.idx === 0 && !deloadActive()) rxSavePlan(ex.name, v, plan);   // el plan que viste hoy: la próxima vez se mide lo conseguido contra lo previsto (en descarga no se guarda: el plan normal sigue donde estaba)
  st.peso = cur.peso; st.reps = {}; st.focus = 'go';
  trainJustLogged = true;
  sessionEnsureStart();
  const logged = quickLogSet(logId, { peso: timed ? 0 : cur.peso, reps: cur.reps, variante: v });
  const nextIdx = cur.idx + 1, nPlan = plan.sets.length;
  if (nextIdx < nPlan) restStart(rxRestSeconds(plan.spec), 'Siguiente: serie ' + (nextIdx + 1) + ' · ' + plan.sets[nextIdx].reps + (timed ? ' s' : ' reps') + ' · ' + rxRirLabel(plan.sets[nextIdx].rir), logged.id);
  else restStart(rxRestSeconds(plan.spec), nextIdx === nPlan ? 'Ejercicio completo. Respira antes del siguiente.' : 'Serie extra hecha.', logged.id);
  renderPlan(card);
}

// ---------- Descanso ----------
let restState = null, restHideTimer = null, restInterval = null;
function restEl(id){ return document.getElementById(id); }
function restStart(sec, sub, setId){
  restState = { end: Date.now() + sec * 1000, total: sec, sub: sub || '', setId: setId || null, rir: null };
  const card = restEl('restCard'); if (!card) return;
  clearTimeout(restHideTimer);
  card.hidden = false; card.classList.remove('fin');
  restEl('rcTitle').textContent = 'Descanso'; restEl('rcSub').textContent = restState.sub;
  const rr = restEl('rcRir'); if (rr) { rr.hidden = !setId; rr.classList.remove('picked'); if (setId) rr.querySelector('.rir-chips').innerHTML = rirChipsHtml(null, 'rirPick'); }   // anotar el RIR de la serie que acabas de hacer (opcional)
  clearInterval(restInterval); restInterval = setInterval(restTick, 250); restTick();
}
function restTick(){
  const card = restEl('restCard'); if (!restState || !card) return;
  const left = Math.max(0, Math.ceil((restState.end - Date.now()) / 1000));
  const m = Math.floor(left / 60), s = left % 60;
  restEl('rcTime').textContent = m + ':' + String(s).padStart(2, '0');
  restEl('rcProg').style.strokeDashoffset = String(Math.max(0, Math.min(100, 100 * (1 - (restState.end - Date.now()) / (restState.total * 1000)))));
  card.setAttribute('aria-label', 'Descanso: quedan ' + left + ' segundos');
  if (left <= 0) restFinish();
}
function restFinish(){
  clearInterval(restInterval); restInterval = null;
  const card = restEl('restCard'); if (!card) return;
  card.classList.add('fin'); restEl('rcTitle').textContent = '¡A por la siguiente!';
  try { if (navigator.vibrate) navigator.vibrate([160, 80, 160]); } catch (e) {}
  restHideTimer = setTimeout(restSkip, 7000);
}
function restAdjust(delta){
  if (!restState) return;
  const card = restEl('restCard');
  if (card && card.classList.contains('fin')) { restState.end = Date.now(); restState.total = Math.max(15, delta); card.classList.remove('fin'); clearTimeout(restHideTimer); restEl('rcTitle').textContent = 'Descanso'; restInterval = setInterval(restTick, 250); }
  restState.end += delta * 1000; restState.total = Math.max(restState.total, Math.ceil((restState.end - Date.now()) / 1000));
  restTick();
}
function restSkip(){
  clearInterval(restInterval); restInterval = null; clearTimeout(restHideTimer); restState = null;
  const card = restEl('restCard'); if (card) { card.hidden = true; card.classList.remove('fin'); }
}

// ---------- Duración estimada ----------
// Por ejercicio que falta: 45 s por serie + el descanso recomendado entre series; 80 s para cambiar de máquina entre ejercicios.
// Es una estimación (tus tiempos reales varían); cuenta solo las series que quedan.
function dayEstimateMin(day){
  const target = weeklyTarget();
  let sec = 0, n = 0;
  effectiveDayGroups(day).forEach(g => g.exercises.forEach(ex => {
    const left = Math.max(0, target - weeklySeriesCount(day.name, ex.name));
    if (!left) return;
    const spec = prescriptionSpec(ex, '');
    sec += left * 45 + Math.max(0, left - 1) * rxRestSeconds(spec); n++;
  }));
  if (n > 1) sec += (n - 1) * 80;
  return sec ? Math.max(5, Math.round(sec / 60 / 5) * 5) : 0;   // al múltiplo de 5 más cercano: no aparenta más precisión de la que hay
}

// ---------- Barra de sesión ----------
function sessionKey(){ return 'sess_' + getProfile() + '_' + localDateStr() + '_' + currentDay; }
function sessionStartGet(){ const n = Number(localStorage.getItem(sessionKey())); return n > 0 ? n : null; }
function sessionEnsureStart(){ if (!sessionStartGet()) { try { localStorage.setItem(sessionKey(), String(Date.now())); } catch (e) {} } }
function sessionFmt(ms){
  const t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
}
function sessionAllDone(){ const c = exerciseCards(); return c.length > 0 && c.every(x => x.classList.contains('done')); }

function renderSessionBar(){
  const bar = document.getElementById('sessionBar'); if (!bar || !dayScreenOpen) return;
  const start = sessionStartGet(), t = document.getElementById('sbTime');
  t.textContent = start && Date.now() - start < 8 * 3600e3 ? sessionFmt(Date.now() - start) : '--:--';
  const cards = exerciseCards(), n = cards.filter(c => c.classList.contains('done')).length;
  const est = dayEstimateMin(DAYS[currentDay]);
  document.getElementById('sbProg').textContent = n + ' de ' + cards.length + ' ejercicios' + (est ? ' · quedan ≈ ' + est + ' min' : '');
  const next = document.getElementById('sbNext'), all = sessionAllDone();
  next.textContent = all ? 'Terminar' : 'Siguiente'; next.classList.toggle('ok', all);
}
setInterval(() => { if (typeof dayScreenOpen !== 'undefined' && dayScreenOpen) renderSessionBar(); }, 1000);

function sessionNext(){
  if (sessionAllDone()) { trainJustLogged = true; showSessionDone(true); return; }
  const cards = exerciseCards(); let t = -1;
  for (let i = currentExIdx + 1; i < cards.length; i++) if (!cards[i].classList.contains('done')) { t = i; break; }
  if (t < 0) for (let i = 0; i < cards.length; i++) if (!cards[i].classList.contains('done')) { t = i; break; }
  if (t >= 0) goToExercise(t);
}

// ---------- Cierre de sesión ----------
function sessionDoneKey(){ return 'sessDone_' + getProfile() + '_' + localDateStr(getWeekStart()) + '_' + currentDay; }

function bestBeforeWeek(dia, ejercicio){
  const ws = getWeekStart();
  let best = 0;
  myRows().forEach(r => {
    if (r['Día'] !== dia || r['Ejercicio'] !== ejercicio || isWarmupRow(r) || (r['Variante'] || '') !== '') return;
    if (parseLocalDate(r['Fecha']) >= ws) return;
    const p = Number(r['Peso (kg)']) || 0, rp = Number(r['Reps']) || 0, rm = rp ? p * (1 + rp / 30) : 0;
    if (rm > best) best = rm;
  });
  return best;
}

function sessionStats(day){
  const ws = getWeekStart(), lw = getWeekStartOffset(-1);
  const names = effectiveDayGroups(day).flatMap(g => g.exercises.map(e => e.name));
  const inWeek = (r, from) => { const f = parseLocalDate(r['Fecha']), to = new Date(from); to.setDate(to.getDate() + 7); return f >= from && f < to; };
  const rows = myRows().filter(r => r['Día'] === day.name && !isWarmupRow(r));
  const thisW = rows.filter(r => inWeek(r, ws)), lastW = rows.filter(r => inWeek(r, lw));
  const vol = a => Math.round(a.reduce((s, r) => s + rowVolume(r), 0));
  const sets = thisW.reduce((s, r) => s + (Number(r['Series']) || 0), 0);
  const lastComplete = names.length > 0 && names.every(n => lastW.filter(r => r['Ejercicio'] === n).reduce((s, r) => s + (Number(r['Series']) || 0), 0) >= weeklyTargetFor(lw));
  const records = [];
  names.forEach(n => {
    const m = bestMarkInWeek(day.name, n, ws, '');
    if (m && !m.timed && m.rm) { const prev = bestBeforeWeek(day.name, n); if (prev && m.rm > prev * 1.0001) records.push({ name: n, rm: m.rm }); }
  });
  // Plan cumplido: series con tantas repeticiones como las previstas (de los planes guardados esta semana)
  let planned = 0, met = 0;
  const plans = rxLoadPlans();
  effectiveDayGroups(day).forEach(g => g.exercises.forEach(e => {
    const pl = plans[e.name + '|'] || Object.keys(plans).filter(k => k.indexOf(e.name + '|') === 0).map(k => plans[k])[0];
    if (!pl || parseLocalDate(pl.fecha) < ws) return;
    rxWeekSets(day.name, e.name).slice(0, 3).forEach((s, i) => { if (pl.targets[i] !== undefined) { planned++; if (s.reps >= pl.targets[i]) met++; } });
  }));
  let next = -1;
  for (let k = 1; k < DAYS.length; k++) { const i = (currentDay + k) % DAYS.length; if (!isDayComplete(DAYS[i])) { next = i; break; } }
  const start = sessionStartGet();
  return { sets: sets, volume: vol(thisW), lastVolume: vol(lastW), lastComplete: lastComplete, records: records, planned: planned, met: met, next: next, durationMs: start ? Date.now() - start : null, exercises: names.length };
}

function sessionDoneHtml(day, s){
  const dn = day.name.split('·')[0].trim();
  let cmpTxt = 'Volumen · sin comparación justa';
  if (deloadActive()) cmpTxt = 'Volumen · semana de descarga (baja a propósito)';
  else if (s.lastComplete && s.lastVolume > 0) {
    const pct = Math.round((s.volume - s.lastVolume) / s.lastVolume * 100);
    cmpTxt = 'Volumen · ' + (pct >= 0 ? '+' : '−') + Math.abs(pct) + ' % vs. semana pasada';
  }
  const stats =
    '<div class="sd-stat"><b>' + (s.durationMs && s.durationMs < 8 * 3600e3 ? Math.max(1, Math.round(s.durationMs / 60000)) + ' min' : '—') + '</b><span>Duración</span></div>' +
    '<div class="sd-stat"><b>' + s.sets + '</b><span>Series de trabajo</span></div>' +
    '<div class="sd-stat"><b>' + fmtNum(s.volume, 0) + ' kg</b><span>' + cmpTxt + '</span></div>' +
    '<div class="sd-stat"><b>' + (s.planned ? s.met + ' de ' + s.planned : '—') + '</b><span>Series dentro del plan</span></div>';
  const recs = s.records.slice(0, 4).map(r => '<div class="sd-li">' + uiIcon('trophy') + '<div><b>' + escHtml(r.name) + '</b><br><span class="mini-sub">Nueva mejor marca: 1RM estimado ' + fmtNum(r.rm, 1) + ' kg</span></div></div>').join('');
  const nextTxt = s.next >= 0 ? 'Siguiente día pendiente: <b>' + escHtml(DAYS[s.next].name.split('·')[0].trim()) + '</b>' + (DAYS[s.next].name.split('·')[1] ? ' · ' + escHtml(DAYS[s.next].name.split('·')[1].trim()) : '') : 'Has completado todos los días de la semana.';
  return '<div class="sd-grid">' + stats + '</div>' + (recs ? '<div style="margin-top:14px">' + recs + '</div>' : '') +
    '<div class="sd-li" style="border-top:1px solid var(--card-border);margin-top:6px"><span>' + nextTxt + '</span></div>' +
    '<div class="sd-btns"><button type="button" class="pri" onclick="hideSessionDone(true)">Listo</button><button type="button" onclick="hideSessionDone(false); showWeekSummary()">Ver el resumen de la semana</button></div>';
}

let _sdPrev = null;
function showSessionDone(force){
  const day = DAYS[currentDay]; if (!day) return;
  const key = sessionDoneKey();
  if (!force && localStorage.getItem(key)) return;
  try { localStorage.setItem(key, '1'); } catch (e) {}
  restSkip();
  const box = document.getElementById('sessDone'), card = document.getElementById('sdCard');
  document.getElementById('sdSub').textContent = day.name;
  document.getElementById('sdBody').innerHTML = sessionDoneHtml(day, sessionStats(day));
  box.style.display = 'flex'; _sdPrev = document.activeElement; card.focus({ preventScroll: true });
}
function hideSessionDone(backToDays){
  const box = document.getElementById('sessDone'); box.style.display = 'none';
  if (_sdPrev && _sdPrev.focus && document.contains(_sdPrev)) _sdPrev.focus({ preventScroll: true });
  if (backToDays) showDayPicker();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && isShown('sessDone')) hideSessionDone(false); });

// Se llama desde updateCardHighlights(): al completar el último ejercicio del día tras registrar una serie
function maybeShowSessionDone(){
  if (!trainJustLogged || !dayScreenOpen) return;
  const day = DAYS[currentDay];
  if (day && isDayComplete(day) && !localStorage.getItem(sessionDoneKey())) { trainJustLogged = false; setTimeout(() => { if (dayScreenOpen && isDayComplete(DAYS[currentDay])) showSessionDone(false); }, 800); }
}
