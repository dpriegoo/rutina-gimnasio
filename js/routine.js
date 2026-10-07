// =====================================================================
// Rutina editable  (routine.js)
// Modelo de la rutina de cada perfil (días, grupos, ejercicios, archivados),
// persistencia local y sincronización con el servidor (versión + conflicto).
// Depende de: routine-default, utils, api, auth.
// =====================================================================

let currentDay = 0;

// ================= Rutina editable por perfil =================
// ROUTINE = rutina completa del perfil (incluye ejercicios archivados).
// DAYS    = vista activa que usa el resto de la app (sin archivados ni grupos vacíos).
let ROUTINE = null;

let DAYS = [];

let TIMED_NAMES = null;

const ALLOWED_GROUP_LABELS = ['Pectoral', 'Deltoides', 'Hombros', 'Tríceps', 'Dorsales', 'Bíceps', 'Core', 'Piernas'];

function defaultExerciseId(di, gi, ei){ return 'd' + di + 'g' + gi + 'e' + ei; }

function newExerciseId(){ return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6); }

function defaultRoutine(){
  const days = cloneJson(DEFAULT_DAYS);
  days.forEach((d, di) => d.groups.forEach((g, gi) => g.exercises.forEach((ex, ei) => { ex.id = defaultExerciseId(di, gi, ei); })));
  return { days: days };
}

function ensureRoutineIds(routine){
  const seen = new Set();
  routine.days.forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => {
    if (!ex.id || seen.has(ex.id)) ex.id = newExerciseId();
    seen.add(ex.id);
  })));
}

function isValidRoutine(r){
  return !!(r && Array.isArray(r.days) && r.days.length === DEFAULT_DAYS.length &&
    r.days.every(d => d && typeof d.name === 'string' && Array.isArray(d.groups) &&
      d.groups.every(g => g && typeof g.label === 'string' && Array.isArray(g.exercises) &&
        g.exercises.every(ex => ex && typeof ex.name === 'string' && ICONS[ex.icon]))));
}

function rebuildDays(){
  DAYS = ROUTINE.days.map(day => ({
    name: day.name,
    groups: day.groups
      .map(g => ({ label: g.label, exercises: g.exercises.filter(ex => !ex.archived) }))
      .filter(g => g.exercises.length > 0),
  }));
  EXERCISE_GROUP_MAP = null;
  TIMED_NAMES = null;
}

function routineKey(profile){ return 'routine_' + profile; }

function routineMetaKey(profile){ return 'routineMeta_' + profile; }

function getRoutineMeta(profile){
  try { return Object.assign({ version: 0, dirty: false }, JSON.parse(localStorage.getItem(routineMetaKey(profile)) || '{}')); }
  catch(e) { return { version: 0, dirty: false }; }
}

function setRoutineMeta(profile, meta){
  try { localStorage.setItem(routineMetaKey(profile), JSON.stringify(meta)); } catch(e) {}
}

// Carga la rutina del perfil (o la de serie). Devuelve true si ha cambiado respecto a la anterior.
function loadRoutineForProfile(profile){
  const before = ROUTINE ? JSON.stringify(ROUTINE) : null;
  let r = null;
  if (profile) { try { r = JSON.parse(localStorage.getItem(routineKey(profile)) || 'null'); } catch(e) {} }
  if (!isValidRoutine(r)) r = defaultRoutine();
  ensureRoutineIds(r);
  ROUTINE = r;
  rebuildDays();
  normalizeCacheNames();
  return before !== JSON.stringify(ROUTINE);
}

// Si se renombra un día o un ejercicio, o un ejercicio cambia de día, sus registros
// antiguos siguen contando como suyos: en la caché local se les pone el nombre/día actual
// (en el Excel no se toca nada). Siempre se parte del valor original de cada fila, así
// que deshacer un cambio también restaura el historial.
function normalizeCacheNames(){
  if (!ROUTINE || !Array.isArray(window._progressCache)) return;
  const dayAlias = {};
  ROUTINE.days.forEach(d => (d.aliases || []).forEach(a => { if (a !== d.name) dayAlias[a] = d.name; }));
  const curDay = n => dayAlias[n] || n;
  const exAlias = {};   // día actual -> { nombre antiguo: nombre actual }
  const moves = [];     // ejercicios que han cambiado de día
  ROUTINE.days.forEach(day => day.groups.forEach(g => g.exercises.forEach(ex => {
    (ex.aliases || []).forEach(a => { if (a !== ex.name) (exAlias[day.name] = exAlias[day.name] || {})[a] = ex.name; });
    (ex.moves || []).forEach(mv => moves.push({
      toDay: day.name, fromDay: curDay(mv.day), until: mv.until, name: ex.name, names: [ex.name].concat(ex.aliases || []),
    }));
  })));
  window._progressCache.forEach(r => {
    if (r._rawDia === undefined) { r._rawDia = r['Día']; r._rawEj = r['Ejercicio']; }
    let dia = curDay(r._rawDia), ej = r._rawEj;
    const fecha = String(r['Fecha']).slice(0, 10);
    for (let i = 0; i < moves.length; i++) {
      const mv = moves[i];
      // solo lo registrado hasta el día del cambio pertenece al ejercicio que se movió
      if (dia === mv.fromDay && fecha <= mv.until && mv.names.indexOf(ej) >= 0) { dia = mv.toDay; ej = mv.name; break; }
    }
    const m = exAlias[dia];
    if (m && m[ej]) ej = m[ej];
    r['Día'] = dia;
    r['Ejercicio'] = ej;
  });
}

function isTimedExercise(name){
  if (!TIMED_NAMES) {
    TIMED_NAMES = new Set();
    const days = ROUTINE ? ROUTINE.days : DEFAULT_DAYS;
    days.forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => {
      if (ex.timed) { TIMED_NAMES.add(ex.name); (ex.aliases || []).forEach(a => TIMED_NAMES.add(a)); }
    })));
  }
  return TIMED_NAMES.has(name);
}

function findInRoutine(routine, dayIdx, exId){
  const day = routine.days[dayIdx];
  if (!day) return null;
  for (let gi = 0; gi < day.groups.length; gi++) {
    const ei = day.groups[gi].exercises.findIndex(ex => ex.id === exId);
    if (ei >= 0) return { day: day, group: day.groups[gi], gi: gi, ei: ei, ex: day.groups[gi].exercises[ei] };
  }
  return null;
}

// Las series pendientes se guardaban con una clave basada en la posición de la tarjeta;
// ahora es por id de ejercicio. Se migran una sola vez.
function migratePendingKeys(){
  if (localStorage.getItem('pendingKeysMigrated') === '1') return;
  const rows = getPendingRows();
  let changed = false;
  Object.keys(rows).forEach(key => {
    const m = /^log-(\d+)-(.+)-(\d+)$/.exec(key);
    if (!m) return;
    const di = Number(m[1]);
    const d = DEFAULT_DAYS[di];
    if (!d) return;
    const gi = d.groups.findIndex(gr => gr.label.replace(/\s/g, '') === m[2]);
    if (gi < 0 || !d.groups[gi].exercises[Number(m[3])]) return;
    const newKey = 'log-' + di + '-' + defaultExerciseId(di, gi, Number(m[3]));
    rows[newKey] = (rows[newKey] || []).concat(rows[key]);
    delete rows[key];
    changed = true;
  });
  if (changed) savePendingRows(rows);
  try { localStorage.setItem('pendingKeysMigrated', '1'); } catch(e) {}
}

function refreshRoutineViews(){
  renderTabs();
  renderDay();
  populateExerciseSelect();
  renderEditView();
}

// Aplica un cambio de rutina: se ve al instante y se sincroniza en segundo plano
function commitRoutine(newRoutine){
  const profile = getProfile();
  ensureRoutineIds(newRoutine);
  ROUTINE = newRoutine;
  rebuildDays();
  if (profile) {
    try { localStorage.setItem(routineKey(profile), JSON.stringify(ROUTINE)); } catch(e) {}
    const meta = getRoutineMeta(profile);
    meta.dirty = true;
    setRoutineMeta(profile, meta);
  }
  normalizeCacheNames();
  refreshRoutineViews();
  syncRoutine();
}

// ---- Sincronización de la rutina con el servidor (solo si el servidor la soporta) ----
let routineSyncing = false;

function serverSupportsRoutine(){ return localStorage.getItem('serverRoutineSupport') === '1'; }

// El servidor nuevo añade v (versión del script) y rv (versión de la rutina) a la respuesta de getHeight
function onServerInfo(heightRes){
  if (heightRes && typeof heightRes.v === 'number' && heightRes.v >= 3) {
    try { localStorage.setItem('serverRoutineSupport', '1'); } catch(e) {}
    window._serverRoutineVersion = heightRes.rv;
    syncRoutine();
  }
}

async function pullRoutine(profile, announce){
  const res = await postToSheetChecked({ action: 'getRoutine' });
  if (res && res.ok && res.routine && isValidRoutine(res.routine)) {
    ensureRoutineIds(res.routine);
    ROUTINE = res.routine;
    rebuildDays();
    try { localStorage.setItem(routineKey(profile), JSON.stringify(ROUTINE)); } catch(e) {}
    setRoutineMeta(profile, { version: res.version, dirty: false });
    window._serverRoutineVersion = res.version;
    normalizeCacheNames();
    refreshRoutineViews();
    if (announce) showToast('La rutina se cambió en otro dispositivo: se ha cargado esa versión');
  }
}

async function syncRoutine(){
  if (routineSyncing || !serverSupportsRoutine()) return;
  const profile = getProfile();
  if (!profile || !getSessionToken()) return;
  routineSyncing = true;
  try {
    let meta = getRoutineMeta(profile);
    if (meta.dirty) {
      const res = await postToSheetChecked({ action: 'saveRoutine', baseVersion: meta.version, routine: ROUTINE });
      if (res && res.ok) {
        setRoutineMeta(profile, { version: res.version, dirty: false });
        window._serverRoutineVersion = res.version;
      } else if (res && res.error === 'conflict') {
        await pullRoutine(profile, true);
      }
      // cualquier otro fallo: queda pendiente y se reintenta en el siguiente refresco
    } else if (typeof window._serverRoutineVersion === 'number' && window._serverRoutineVersion > meta.version) {
      await pullRoutine(profile, false);
    }
  } finally {
    routineSyncing = false;
  }
}
