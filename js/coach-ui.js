// =====================================================================
// Entrenador IA: widget y chat  (coach-ui.js)
// Botón flotante que abre una hoja de chat. Al abrirla pregunta "¿sobre qué quieres hablar?" con un menú guiado
// (planificar la semana, un ejercicio de hoy, la progresión de un ejercicio, revisión general, otra pregunta);
// cada opción manda a Gemini una pregunta con su intención y Gemini decide qué datos consultar (coach.js).
// Los textos de Gemini se pintan escapados (nunca como HTML) con un Markdown mínimo.
// Depende de: coach, coach-tools, utils, day-picker, routine, auth.
// =====================================================================

const COACH_STORE = p => 'coachChat_' + p;
const COACH_STORE_MAX = 30;                 // mensajes que se recuerdan
const COACH_STORE_HOURS = 24;               // pasado este tiempo la conversación empieza de cero

const COACH_MENU = [
  { id: 'week',     icon: '📅', label: 'Planificar lo que queda de semana' },
  { id: 'today',    icon: '🏋️', label: 'Preguntar por un ejercicio de hoy' },
  { id: 'exercise', icon: '📈', label: 'Progresión de un ejercicio' },
  { id: 'overall',  icon: '🎯', label: '¿Voy bien? Revisión general' },
  { id: 'free',     icon: '✍️', label: 'Otra pregunta' },
];

const COACH_TOOL_LABEL = {
  get_context: 'tu semana y tu rutina', get_routine: 'tu rutina', list_exercises: 'tus ejercicios',
  get_week_status: 'una semana de entreno', get_exercise_progress: 'la progresión de un ejercicio',
  get_exercise_sets: 'las series de un ejercicio', get_muscle_load: 'la carga muscular',
  get_weekly_summary: 'el resumen por semanas', get_body_weight: 'tu peso corporal', get_app_signals: 'las señales de la app',
};

let coachMsgs = [];          // { role: 'user'|'bot'|'error', text, modelText?, tools?, retry? }
let coachStep = 'menu';      // menu | week-days | today-ex | pick-ex | chat
let coachBusy = false;
let coachLast = null;        // última pregunta enviada (para reintentar)
let _coachPrevOverflow = '';

// ---------- Markdown mínimo y seguro ----------
function coachInline(s){
  return s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
          .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
}
// Se escapa TODO primero y solo después se añaden unas pocas etiquetas propias: lo que escriba Gemini nunca es HTML.
function coachMd(text){
  const lines = escHtml(text).split(/\r?\n/);
  let html = '', list = null, para = [];
  const closeList = () => { if (list) { html += '</' + list + '>'; list = null; } };
  const flush = () => { if (para.length) { html += '<p>' + coachInline(para.join('<br>')) + '</p>'; para = []; } };
  lines.forEach(l => {
    const ul = l.match(/^\s*[-*•]\s+(.*)$/), ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flush();
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { closeList(); html += '<' + tag + '>'; list = tag; }
      html += '<li>' + coachInline((ul || ol)[1]) + '</li>';
    } else if (!l.trim()) { flush(); closeList(); }
    else { closeList(); para.push(l.trim()); }
  });
  flush(); closeList();
  return html;
}

// ---------- Persistencia (solo texto, por perfil) ----------
function coachPersist(){
  const p = getProfile(); if (!p) return;
  try {
    const keep = coachMsgs.filter(m => m.role !== 'error').slice(-COACH_STORE_MAX)
      .map(m => ({ role: m.role, text: m.text, modelText: m.modelText, tools: (m.tools || []).map(t => ({ name: t.name, args: t.args })) }));
    localStorage.setItem(COACH_STORE(p), JSON.stringify({ t: Date.now(), msgs: keep }));
  } catch (e) {}
}
function coachLoad(){
  const p = getProfile(); if (!p) return;
  try {
    const o = JSON.parse(localStorage.getItem(COACH_STORE(p)) || 'null');
    if (!o || !Array.isArray(o.msgs) || Date.now() - o.t > COACH_STORE_HOURS * 3600e3) return;
    coachMsgs = o.msgs; coachRestoreContents(coachMsgs);
    if (coachMsgs.length) coachStep = 'chat';
  } catch (e) {}
}
function coachOnLogout(){
  const p = getProfile();
  coachMsgs = []; coachResetConversation(); coachStep = 'menu';
  try { if (p) localStorage.removeItem(COACH_STORE(p)); } catch (e) {}
  const sheet = document.getElementById('coachSheet');
  if (sheet && sheet.classList.contains('on')) coachClose();
  coachSyncFab();
}

// ---------- Construcción de la interfaz (una vez) ----------
const COACH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 12h.01M12.5 12h.01M16 12h.01"/></svg>';

function coachEnsureUI(){
  if (document.getElementById('coachSheet')) return;
  const fab = document.createElement('button');
  fab.id = 'coachFab'; fab.type = 'button'; fab.className = 'coach-fab'; fab.hidden = true;
  fab.setAttribute('aria-label', 'Preguntar a tu entrenador'); fab.setAttribute('aria-haspopup', 'dialog');
  fab.innerHTML = COACH_ICON;
  fab.onclick = coachOpen;

  const scrim = document.createElement('div'); scrim.id = 'coachScrim'; scrim.className = 'coach-scrim'; scrim.onclick = coachClose;

  const sheet = document.createElement('aside');
  sheet.id = 'coachSheet'; sheet.className = 'coach-sheet';
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'coachTitle');
  sheet.innerHTML =
    '<header class="coach-head"><div><h2 id="coachTitle">Entrenador</h2><p>Responde con tus datos de IronLog</p></div>' +
    '<button type="button" class="coach-icon" id="coachNew" aria-label="Nueva conversación">↺</button>' +
    '<button type="button" class="coach-icon" id="coachClose" aria-label="Cerrar">✕</button></header>' +
    '<div class="coach-msgs" id="coachMsgs" role="log" aria-live="polite" aria-relevant="additions"></div>' +
    '<div class="coach-chips" id="coachChips"></div>' +
    '<div class="coach-compose"><textarea id="coachInput" rows="1" maxlength="1000" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta"></textarea>' +
    '<button type="button" class="coach-send" id="coachSend" aria-label="Enviar">➤</button></div>';

  document.body.appendChild(fab); document.body.appendChild(scrim); document.body.appendChild(sheet);
  document.getElementById('coachClose').onclick = coachClose;
  document.getElementById('coachNew').onclick = coachNewConversation;
  document.getElementById('coachSend').onclick = coachSubmitInput;
  const ta = document.getElementById('coachInput');
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); coachSubmitInput(); } });
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('on')) coachClose(); });
  // el botón se aparta mientras se escribe en un campo de la app (para no tapar nada con el teclado abierto)
  document.addEventListener('focusin', e => {
    const t = e.target, inSheet = t.closest && t.closest('#coachSheet');
    document.body.classList.toggle('coach-fab-hide', !inSheet && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  });
  document.addEventListener('focusout', () => document.body.classList.remove('coach-fab-hide'));
}

function coachSyncFab(){
  const fab = document.getElementById('coachFab');
  if (fab) fab.hidden = !(getProfile() && getSessionToken());
}

function coachInit(){
  coachEnsureUI();
  coachLoad();
  coachSyncFab();
}

// ---------- Abrir y cerrar ----------
function coachOpen(){
  coachEnsureUI();
  if (typeof closeProgressSheet === 'function') closeProgressSheet();
  coachRender();
  coachWarm();                                   // despierta la función de servidor mientras se abre el chat
  _coachPrevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.getElementById('coachScrim').classList.add('on');
  document.getElementById('coachSheet').classList.add('on');
  coachScrollEnd();
  const first = document.querySelector('#coachChips button, #coachChips select');
  (coachStep === 'chat' || !first ? document.getElementById('coachInput') : first).focus({ preventScroll: true });
}
function coachClose(){
  const sheet = document.getElementById('coachSheet');
  if (!sheet || !sheet.classList.contains('on')) return;
  sheet.classList.remove('on');
  document.getElementById('coachScrim').classList.remove('on');
  document.body.style.overflow = _coachPrevOverflow;
  const fab = document.getElementById('coachFab'); if (fab && !fab.hidden) fab.focus({ preventScroll: true });
}
function coachNewConversation(){
  if (coachBusy) return;
  coachMsgs = []; coachResetConversation(); coachStep = 'menu'; coachLast = null;
  coachPersist(); coachRender();
}

// ---------- Pintado ----------
function coachToolLine(t){
  const label = COACH_TOOL_LABEL[t.name] || t.name;
  const a = t.args || {}, bits = [];
  if (a.ejercicio) bits.push(a.ejercicio);
  if (a.semanas_atras != null) bits.push(a.semanas_atras ? 'hace ' + a.semanas_atras + ' sem.' : 'esta semana');
  if (a.semanas != null) bits.push(a.semanas + ' sem.');
  return label + (bits.length ? ' (' + bits.join(', ') + ')' : '');
}

function coachMsgHtml(m){
  if (m.role === 'user') return '<div class="cm cm-user">' + escHtml(m.text) + '</div>';
  if (m.role === 'error') return '<div class="cm cm-err" role="alert">' + escHtml(m.text) + (m.retry ? ' <button type="button" class="coach-retry" onclick="coachRetry()">Reintentar</button>' : '') + '</div>';
  let data = '';
  if (m.tools && m.tools.length) {
    data = '<details class="coach-data"><summary>Datos consultados (' + m.tools.length + ')</summary><ul>' +
      m.tools.map(t => '<li>' + escHtml(coachToolLine(t)) + (t.prefetched ? ' <em>(adelantado)</em>' : '') + (t.result ? '<pre>' + escHtml(JSON.stringify(t.result, null, 1).slice(0, 1500)) + '</pre>' : '') + '</li>').join('') + '</ul></details>';
  }
  return '<div class="cm cm-bot">' + coachMd(m.text) + data + '</div>';
}

function coachRender(){
  const box = document.getElementById('coachMsgs');
  if (!box) return;
  const hello = '<div class="cm cm-bot"><p>Hola' + (getProfile() ? ', ' + escHtml(getProfile()) : '') + '. Soy tu entrenador: respondo con <strong>tus propios datos</strong> de IronLog (series, semana, máquinas, peso).</p>' +
    (coachMsgs.length ? '' : '<p>¿Sobre qué quieres hablar?</p>') + '</div>';
  box.innerHTML = hello + coachMsgs.map(coachMsgHtml).join('');
  coachRenderChips();
  const send = document.getElementById('coachSend'); if (send) send.disabled = coachBusy;
}

function coachScrollEnd(){ const b = document.getElementById('coachMsgs'); if (b) b.scrollTop = b.scrollHeight; }

function coachChip(label, onclick, cls){
  return '<button type="button" class="coach-chip' + (cls ? ' ' + cls : '') + '" onclick="' + onclick + '"' + (coachBusy ? ' disabled' : '') + '>' + label + '</button>';
}

// Día del que se preguntan "los ejercicios de hoy": el abierto en la app; si no, el que sugiere la app
function coachTodayDay(){
  try { if (dayScreenOpen && DAYS[currentDay]) return DAYS[currentDay]; } catch (e) {}
  const i = (typeof suggestedDayIdx === 'function') ? suggestedDayIdx() : -1;
  return DAYS[i >= 0 ? i : 0] || null;
}

function coachRenderChips(){
  const box = document.getElementById('coachChips');
  if (!box) return;
  let h = '';
  if (coachStep === 'menu') {
    h = COACH_MENU.map(m => coachChip(m.icon + ' ' + m.label, "coachMenu('" + m.id + "')")).join('');
  } else if (coachStep === 'week-days') {
    h = '<div class="coach-q">¿Cuántos días más vas a ir esta semana?</div>' +
      [1, 2, 3].map(n => coachChip(n + (n === 1 ? ' día' : ' días'), 'coachWeek(' + n + ')')).join('') +
      coachChip('No lo sé aún', 'coachWeek(0)') + coachChip('← Volver', "coachBack()", 'ghost');
  } else if (coachStep === 'today-ex') {
    const day = coachTodayDay();
    let names = []; if (day) effectiveDayGroups(day).forEach(g => g.exercises.forEach(ex => names.push(ex.name)));
    let vis = null; try { if (dayScreenOpen) { const c = exerciseCards()[currentExIdx]; vis = c && c.getAttribute('data-exercise'); } } catch (e) {}
    if (vis && names.indexOf(vis) > 0) names = [vis].concat(names.filter(n => n !== vis));
    h = '<div class="coach-q">' + (day ? 'Ejercicios de ' + escHtml(coachShortDay(day.name)) + ' · ¿cuál?' : 'No hay día elegido') + '</div>' +
      names.map((n, i) => coachChip(escHtml(n), 'coachToday(' + i + ')')).join('') + coachChip('← Volver', 'coachBack()', 'ghost');
    window._coachTodayNames = names;
  } else if (coachStep === 'pick-ex') {
    const opts = []; const seen = {};
    DAYS.forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => { if (!seen[ex.name]) { seen[ex.name] = 1; opts.push('<option value="' + escHtml(ex.name) + '">' + escHtml(ex.name) + '</option>'); } })));
    h = '<div class="coach-q">¿De qué ejercicio?</div><select id="coachPick" aria-label="Ejercicio"><option value="">Elige un ejercicio…</option>' + opts.join('') + '</select>' +
      coachChip('Analizar', 'coachPickGo()', 'primary') + coachChip('← Volver', 'coachBack()', 'ghost');
  } else {
    h = coachChip('＋ Otra consulta', 'coachBack()', 'ghost');
  }
  box.innerHTML = h;
}

// ---------- Menú guiado ----------
function coachBack(){ coachStep = 'menu'; coachRenderChips(); const f = document.querySelector('#coachChips button'); if (f) f.focus({ preventScroll: true }); }

function coachMenu(id){
  if (coachBusy) return;
  if (id === 'week') { coachStep = 'week-days'; coachRenderChips(); return; }
  if (id === 'today') { coachStep = 'today-ex'; coachRenderChips(); return; }
  if (id === 'exercise') { coachStep = 'pick-ex'; coachRenderChips(); return; }
  if (id === 'overall') {
    coachSend('Hazme una revisión general de cómo voy: constancia, fuerza, equilibrio muscular y peso corporal si hay datos. Dime 2-3 cosas concretas a mejorar.', 'revision_general');
    return;
  }
  coachStep = 'chat'; coachRenderChips(); document.getElementById('coachInput').focus();
}

function coachWeek(n){
  const t = n
    ? 'Esta semana quiero planificar lo que me queda. Voy a ir ' + n + (n === 1 ? ' día más' : ' días más') + '. ¿' + (n === 1 ? 'Cuál de los que me faltan debería hacer' : 'Cuáles de los que me faltan debería hacer, en qué orden') + ' y por qué?'
    : 'Esta semana quiero planificar lo que me queda, pero no sé cuántos días más voy a ir. ¿Qué día me conviene hacer primero y merece la pena ir más veces?';
  coachSend(t, 'planificar_semana', n ? 'Días extra indicados: ' + n : 'Días extra: sin decidir', null);
}
function coachToday(i){
  const n = (window._coachTodayNames || [])[i], day = coachTodayDay();
  if (!n) return;
  coachSend('Hoy me toca «' + n + '»' + (day ? ' (' + coachShortDay(day.name) + ')' : '') + '. ¿Con qué carga y repeticiones debería trabajar hoy según mi progresión? ¿Hay algo a vigilar?', 'ejercicio_hoy', 'Ejercicio: ' + n, n);
}
function coachPickGo(){
  const v = document.getElementById('coachPick').value;
  if (!v) { document.getElementById('coachPick').focus(); return; }
  coachSend('Analiza la progresión de «' + v + '»: ¿voy bien? ¿Estoy progresando, estancado o hay algo que ajustar?', 'progresion_ejercicio', 'Ejercicio: ' + v, v);
}

function coachSubmitInput(){
  const ta = document.getElementById('coachInput'), t = ta.value.trim();
  if (!t || coachBusy) return;
  ta.value = ''; ta.style.height = 'auto';
  coachSend(t, null);
}

// ---------- Envío ----------
// text = lo que se ve en el chat; intent / extra = pista para Gemini sobre qué consultar (no se muestra);
// ejercicio = ejercicio sobre el que se pregunta (para adelantar sus datos)
async function coachSend(text, intent, extra, ejercicio){
  if (coachBusy) return;
  const modelText = intent ? text + '\n\n[Intención de la app: ' + intent + (extra ? '. ' + extra : '') + ']' : text;
  coachLast = { text: text, intent: intent, extra: extra, ejercicio: ejercicio };
  coachMsgs.push({ role: 'user', text: text, modelText: modelText });
  coachStep = 'chat';
  coachBusy = true;
  coachRender();
  const box = document.getElementById('coachMsgs');
  const act = document.createElement('div');
  act.className = 'cm cm-act'; act.setAttribute('role', 'status');
  act.innerHTML = '<span class="cm-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="cm-act-t">Pensando…</span>';
  box.appendChild(act); coachScrollEnd();
  let live = null, streamed = false;
  const hooks = {
    onTool: (name, args) => { act.querySelector('.cm-act-t').textContent = 'Consultando ' + coachToolLine({ name: name, args: args }) + '…'; coachScrollEnd(); },
    // texto según se escribe: la burbuja "en directo" sustituye al aviso de "pensando"
    onText: txt => {
      if (!txt) return;
      if (!live) { live = document.createElement('div'); live.className = 'cm cm-bot cm-live'; box.appendChild(live); act.style.display = 'none'; }
      live.innerHTML = coachMd(txt); streamed = true; coachScrollEnd();
    },
    // si la vuelta terminó pidiendo herramientas, ese texto parcial era un preámbulo: se retira y vuelve el aviso
    onStepEnd: hasCalls => { if (hasCalls && live) { live.remove(); live = null; streamed = false; act.style.display = ''; } },
  };
  try {
    const r = await coachAsk(modelText, hooks, { intent: intent, ejercicio: ejercicio });
    coachMsgs.push({ role: 'bot', text: r.text, tools: r.tools });
    coachBusy = false; coachPersist(); coachRender();
    if (streamed) coachScrollEnd();                                   // se ha ido leyendo mientras llegaba: no se salta atrás
    else {
      const bubbles = box.querySelectorAll('.cm-bot'), last = bubbles[bubbles.length - 1];
      if (last) box.scrollTop = Math.max(0, last.offsetTop - 12);     // se lee desde el principio de la respuesta
    }
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[coach]', e && e.coachCode, e && e.message);   // detalle para depurar (p. ej. un modelo mal escrito)
    coachMsgs.pop();                                                  // la pregunta sin respuesta no se queda en el historial del modelo
    coachMsgs.push({ role: 'user', text: text }, { role: 'error', text: coachErrorText(e), retry: true });
    coachBusy = false; coachRender(); coachScrollEnd();
  }
}

function coachRetry(){
  if (coachBusy || !coachLast) return;
  // se quita el aviso de error y la pregunta fallida, y se vuelve a enviar
  while (coachMsgs.length && coachMsgs[coachMsgs.length - 1].role === 'error') coachMsgs.pop();
  if (coachMsgs.length && coachMsgs[coachMsgs.length - 1].role === 'user') coachMsgs.pop();
  coachSend(coachLast.text, coachLast.intent, coachLast.extra, coachLast.ejercicio);
}
