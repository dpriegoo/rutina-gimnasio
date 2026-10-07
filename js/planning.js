// =====================================================================
// Planificación semanal  (planning.js)
// Reequilibrio de la semana (sustituir un grupo en un día), override semanal, semana de
// descanso, banner de prioridades y recomendación de día para ejercicios pendientes.
// Depende de: muscles, routine, utils.
// =====================================================================

// ---- Reequilibrio semanal: si un grupo quedó muy por debajo de la media de esa
// semana (desequilibrio relativo, no solo "a cero"), se propone reforzarlo esta
// semana prestando un ejercicio ya existente de ese grupo a un día que no lo entrena.
function lastWeekZoneVolumes(profile){
  const cache = window._progressCache || [];
  const lastWeekStart = getWeekStartOffset(-1);
  const thisWeekStart = getWeekStart();
  const zoneKeys = Object.keys(MUSCLE_ZONES);
  const vol = {}; zoneKeys.forEach(z => vol[z] = 0);
  cache
    .filter(r => (r['Perfil'] || '') === profile && !isWarmupRow(r))
    .forEach(r => {
      const f = parseLocalDate(r['Fecha']);
      if (!(f >= lastWeekStart && f < thisWeekStart)) return;
      const g = preciseGroupForRow(r);
      if (!g) return;
      const zoneKey = zoneKeys.find(z => MUSCLE_ZONES[z].groups.includes(g));
      if (!zoneKey) return;
      vol[zoneKey] += rowVolume(r);
    });
  return vol;
}

// Grupo con mayor desequilibrio relativo respecto a la media de esa semana
// (no necesariamente el más bajo en absoluto, sino el más rezagado frente al resto).
function findMostNeglectedZone(profile){
  const vol = lastWeekZoneVolumes(profile);
  const zoneKeys = Object.keys(vol);
  const total = zoneKeys.reduce((s, z) => s + vol[z], 0);
  if (total <= 0) return null; // sin datos la semana pasada, no hay nada que comparar
  const avg = total / zoneKeys.length;
  let worst = null;
  zoneKeys.forEach(z => {
    const ratio = avg > 0 ? vol[z] / avg : 0;
    if (worst === null || ratio < worst.ratio) worst = { zone: z, ratio: ratio };
  });
  if (!worst || worst.ratio >= 0.5) return null; // sin desequilibrio relevante
  return worst.zone;
}

// Grupo con mayor SOBRECARGA relativa respecto a la media de esa semana — el
// candidato a "ceder" una sesión al grupo rezagado.
function findMostOverloadedZone(profile){
  const vol = lastWeekZoneVolumes(profile);
  const zoneKeys = Object.keys(vol);
  const total = zoneKeys.reduce((s, z) => s + vol[z], 0);
  if (total <= 0) return null;
  const avg = total / zoneKeys.length;
  let worst = null;
  zoneKeys.forEach(z => {
    const ratio = avg > 0 ? vol[z] / avg : 0;
    if (worst === null || ratio > worst.ratio) worst = { zone: z, ratio: ratio };
  });
  if (!worst || worst.ratio <= 1.5) return null; // sin sobrecarga clara
  return worst.zone;
}

// Todos los grupos "dueños" de una zona (uno por cada etiqueta de la zona y cada día
// donde aparece), para tomar prestados sus ejercicios sin inventar nada nuevo.
function listHomeGroupsForZone(zoneKey, excludeDayName){
  const labels = MUSCLE_ZONES[zoneKey].groups;
  const out = [];
  labels.forEach(label => {
    DAYS.forEach(day => {
      if (day.name === excludeDayName) return;
      const g = day.groups.find(gr => gr.label === label);
      if (g) out.push({ label: g.label, exercises: g.exercises, homeDayName: day.name });
    });
  });
  return out;
}

// Ejercicios del grupo sustituto que NO repitan nombre con los que el día ya tiene
// en el resto de sus grupos (el grupo que se va a reemplazar no cuenta).
function uniqueSubstituteExercises(substituteExercises, targetDay, fromGroupLabel){
  const namesInDay = new Set();
  targetDay.groups.forEach(g => {
    if (g.label === fromGroupLabel) return;
    g.exercises.forEach(ex => namesInDay.add(ex.name));
  });
  return substituteExercises.filter(ex => !namesInDay.has(ex.name));
}

// Días candidatos para ALIVIAR la zona sobrecargada, de mejor a peor: deben entrenarla,
// tener otro grupo además (para no vaciarlos), no estar empezados esta semana, y NO
// entrenar ya de forma nativa la zona que se quiere reforzar (si no, acabarían con ese
// grupo duplicado y ejercicios repetidos).
function findSwapCandidateDays(overloadedZoneKey, neglectedZoneKey){
  const overloadedGroups = MUSCLE_ZONES[overloadedZoneKey].groups;
  const neglectedGroups = MUSCLE_ZONES[neglectedZoneKey].groups;
  const candidates = DAYS.filter(day => {
    const matching = day.groups.filter(g => overloadedGroups.includes(g.label));
    const alreadyTrainsNeglected = day.groups.some(g => neglectedGroups.includes(g.label));
    return matching.length > 0 && day.groups.length > matching.length && !alreadyTrainsNeglected && !isDayStarted(day);
  });
  const count = d => d.groups.filter(g => overloadedGroups.includes(g.label)).reduce((s, g) => s + g.exercises.length, 0);
  candidates.sort((a, b) => count(b) - count(a));
  return candidates.map(day => ({ targetDay: day, fromGroup: day.groups.find(g => overloadedGroups.includes(g.label)) }));
}

// Respaldo: si no hay un día válido para sustituir, se limita a prestar un ejercicio
// (como antes) a un día que no entrene ya esa zona y no esté empezado esta semana.
function findReinforcementPick(zoneKey){
  const groups = MUSCLE_ZONES[zoneKey].groups;
  const pool = [];
  DAYS.forEach(day => {
    day.groups.forEach(g => {
      if (groups.includes(g.label)) {
        g.exercises.forEach(ex => pool.push({ ex: ex, homeDay: day.name, homeGroup: g.label }));
      }
    });
  });
  if (pool.length === 0) return null;

  const candidateDays = DAYS.filter(day => !day.groups.some(g => groups.includes(g.label)) && !isDayStarted(day));
  if (candidateDays.length === 0) return null;

  const targetDay = candidateDays.slice().sort((a, b) => a.groups.length - b.groups.length)[0];
  const pick = pool[0];
  return { targetDayName: targetDay.name, targetDayLabel: targetDay.name.split('·')[0].trim(), exerciseName: pick.ex.name, grupo: pick.homeGroup, originalDayName: pick.homeDay };
}

function buildRebalancePlan(profile){
  const neglected = findMostNeglectedZone(profile);
  if (!neglected) return null;

  const overloaded = findMostOverloadedZone(profile);
  if (overloaded) {
    const candidates = findSwapCandidateDays(overloaded, neglected);
    for (const swap of candidates) {
      const homeGroups = listHomeGroupsForZone(neglected, swap.targetDay.name);
      for (const home of homeGroups) {
        const exercises = uniqueSubstituteExercises(home.exercises, swap.targetDay, swap.fromGroup.label);
        if (exercises.length === 0) continue;
        return {
          type: 'swap',
          neglectedLabel: MUSCLE_ZONES[neglected].label,
          overloadedLabel: MUSCLE_ZONES[overloaded].label,
          dayName: swap.targetDay.name,
          dayLabel: swap.targetDay.name.split('·')[0].trim(),
          fromGroupLabel: swap.fromGroup.label,
          toGroupLabel: home.label,
          toExercises: exercises,
        };
      }
    }
  }

  const pick = findReinforcementPick(neglected);
  if (!pick) return null;
  return { type: 'add', neglectedLabel: MUSCLE_ZONES[neglected].label, pick: pick };
}

// ---- Override semanal: sustituye un grupo de un día concreto, solo para la
// semana en curso (la clave incluye la fecha del lunes, así que la semana
// siguiente deja de aplicarse sola, sin necesidad de limpiarla).
function getWeekOverrideKey(profile){
  return 'weekOverride_' + profile + '_' + localDateStr(getWeekStart());
}

function getWeekOverride(profile){
  try { return JSON.parse(localStorage.getItem(getWeekOverrideKey(profile)) || 'null'); } catch(e) { return null; }
}

function setWeekOverride(profile, override){
  localStorage.setItem(getWeekOverrideKey(profile), JSON.stringify(override));
}

// Grupos "efectivos" de un día para esta semana — es lo que deben usar renderDay()
// y todo lo que decide qué cuenta como completado, en vez de day.groups a secas.
function effectiveDayGroups(day){
  const profile = getProfile();
  const override = profile && getWeekOverride(profile);
  if (!override || override.dayName !== day.name) return day.groups;
  return day.groups.map(g => g.label === override.fromGroupLabel
    ? { label: override.toGroupLabel, exercises: override.toExercises.map(ex => ex.id ? ex : Object.assign({ id: 'o-' + String(ex.name).replace(/[^a-zA-Z0-9]/g, '') }, ex)) }
    : g
  );
}

function zoneKeyForLabel(label){
  return Object.keys(MUSCLE_ZONES).find(z => MUSCLE_ZONES[z].groups.includes(label)) || null;
}

// Un ajuste semanal es inválido si deja ejercicios repetidos en el día, o si el día ya
// tenía de forma nativa un grupo de la misma zona que se ha metido (p. ej. Core dos veces).
function isWeekOverrideInvalid(override){
  const day = DAYS.find(d => d.name === override.dayName);
  if (!day) return true;
  const names = [];
  const newZone = zoneKeyForLabel(override.toGroupLabel);
  let zoneClash = false;
  day.groups.forEach(g => {
    if (g.label === override.fromGroupLabel) {
      override.toExercises.forEach(ex => names.push(ex.name));
    } else {
      g.exercises.forEach(ex => names.push(ex.name));
      if (newZone && zoneKeyForLabel(g.label) === newZone) zoneClash = true;
    }
  });
  return zoneClash || new Set(names).size !== names.length;
}

function maybeShowRebalanceModal(){
  const profile = getProfile();
  if (!profile) return;
  const weekKey = localDateStr(getWeekStart());
  const seenKey = 'rebalanceSeen_' + profile + '_' + weekKey;

  // Autocorrección: si hay un ajuste de esta semana que deja el día con ejercicios
  // repetidos (generado por una versión anterior), se descarta y se vuelve a proponer.
  const existing = getWeekOverride(profile);
  if (existing && isWeekOverrideInvalid(existing)) {
    localStorage.removeItem(getWeekOverrideKey(profile));
    localStorage.removeItem(seenKey);
    renderTabs();
    renderDay();
  }

  if (localStorage.getItem(seenKey)) return; // ya se decidió (sí o no) esta semana

  const plan = buildRebalancePlan(profile);
  if (!plan) { localStorage.setItem(seenKey, '1'); return; }

  window._rebalancePlan = plan;
  const textEl = document.getElementById('rebalanceText');
  if (plan.type === 'swap') {
    textEl.textContent =
      'La semana pasada ' + plan.overloadedLabel + ' llevó bastante más carga que el resto, mientras que ' + plan.neglectedLabel + ' se quedó corto. ¿Quieres que esta semana el ' + plan.dayLabel + ' sea de ' + plan.toGroupLabel + ' en vez de ' + plan.fromGroupLabel + '?';
  } else {
    textEl.textContent =
      'La semana pasada no entrenaste ' + plan.neglectedLabel + ' con la misma intensidad que el resto de grupos musculares. ¿Quieres añadir ' + plan.pick.exerciseName + ' al ' + plan.pick.targetDayLabel + ' para compensarlo?';
  }
  document.getElementById('rebalanceModal').style.display = 'flex';
  localStorage.setItem(seenKey, '1');
}

function acceptRebalance(){
  const plan = window._rebalancePlan;
  document.getElementById('rebalanceModal').style.display = 'none';
  if (!plan) return;
  const profile = getProfile();

  if (plan.type === 'swap') {
    setWeekOverride(profile, {
      dayName: plan.dayName,
      fromGroupLabel: plan.fromGroupLabel,
      toGroupLabel: plan.toGroupLabel,
      toExercises: plan.toExercises,
    });
    showToast(plan.dayLabel + ' actualizado para esta semana ✓');
    renderTabs();
    if (DAYS[currentDay] && DAYS[currentDay].name === plan.dayName) renderDay();
  } else {
    addBorrowedExercise(plan.pick.targetDayName, plan.pick.exerciseName, plan.pick.grupo, plan.pick.originalDayName);
  }
}

function declineRebalance(){
  document.getElementById('rebalanceModal').style.display = 'none';
}

function revertWeekOverride(){
  const profile = getProfile();
  if (!profile) return;
  localStorage.removeItem(getWeekOverrideKey(profile));
  renderTabs();
  renderDay();
}

// ---- Variedad de grupos musculares semana a semana ----
// "Brazos" (Día 5) agrupa Bíceps + Tríceps bajo una sola etiqueta en el Excel;
// aquí se traduce a los grupos "reales" para que el conteo por grupo sea correcto.
const GROUP_ALIASES = { 'Brazos': ['Bíceps', 'Tríceps'] };

function canonicalGroups(rawGrupo){
  return GROUP_ALIASES[rawGrupo] || [rawGrupo];
}

function allCanonicalGroups(){
  const set = new Set();
  DAYS.forEach(day => day.groups.forEach(g => canonicalGroups(g.label).forEach(cg => set.add(cg))));
  return [...set];
}

function daysCoveringGroup(canonicalGroup){
  return DAYS
    .filter(day => day.groups.some(g => canonicalGroups(g.label).includes(canonicalGroup)))
    .map(day => day.name.split('·')[0].trim());
}

function groupsTrainedInWeek(profile, weekStart){
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const cache = window._progressCache || [];
  const set = new Set();
  cache
    .filter(r => (r['Perfil'] || '') === profile)
    .filter(r => { const f = parseLocalDate(r['Fecha']); return f >= weekStart && f < weekEnd; })
    .forEach(r => canonicalGroups(r['Grupo']).forEach(cg => set.add(cg)));
  return set;
}

// Grupos que faltaron la semana pasada Y que esta semana todavía no se han cubierto.
function stillMissingPriorityGroups(profile){
  const trainedLastWeek = groupsTrainedInWeek(profile, getWeekStartOffset(-1));
  if (trainedLastWeek.size === 0) return []; // sin datos de la semana pasada, no avisar
  const missingLastWeek = allCanonicalGroups().filter(g => !trainedLastWeek.has(g));
  if (missingLastWeek.length === 0) return [];
  const trainedThisWeek = groupsTrainedInWeek(profile, getWeekStart());
  return missingLastWeek.filter(g => !trainedThisWeek.has(g));
}

function restWeekKey(profile){
  return 'restWeek_' + profile + '_' + localDateStr(getWeekStart());
}

function isRestWeek(profile){
  return localStorage.getItem(restWeekKey(profile)) === '1';
}

function toggleRestWeek(){
  const profile = getProfile();
  if (!profile) return;
  const key = restWeekKey(profile);
  if (localStorage.getItem(key) === '1') localStorage.removeItem(key);
  else localStorage.setItem(key, '1');
  renderPriorityBanner();
}

function renderPriorityBanner(){
  const el = document.getElementById('priorityBanner');
  if (!el) return;
  const profile = getProfile();
  if (!profile) { el.style.display = 'none'; return; }

  if (isRestWeek(profile)) {
    el.innerHTML = '🛌 Semana marcada como descanso — sin avisos de prioridad muscular. <button class="rest-week-toggle" onclick="toggleRestWeek()">Desactivar</button>';
    el.style.display = 'block';
    return;
  }

  const missing = stillMissingPriorityGroups(profile);
  if (missing.length === 0) { el.style.display = 'none'; return; }
  const parts = missing.map(g => {
    const days = daysCoveringGroup(g);
    return '<b>' + g + '</b>' + (days.length ? ' (' + days.join(' o ') + ')' : '');
  });
  el.innerHTML = '⚠️ La semana pasada no entrenaste: ' + parts.join(', ') + '. Priorízalo esta semana.'
    + ' <button class="rest-week-toggle" onclick="toggleRestWeek()">¿Semana de descanso?</button>';
  el.style.display = 'block';
}

function findExerciseGroup(exerciseName){
  let group = null;
  DAYS.forEach(day => {
    day.groups.forEach(g => {
      if (g.exercises.some(ex => ex.name === exerciseName)) group = g.label;
    });
  });
  return group;
}

function recommendDayForExercise(exerciseName, sourceDayIdx){
  const group = findExerciseGroup(exerciseName);
  const candidates = DAYS.map((day, idx) => {
    if (idx === sourceDayIdx) return null;
    const matchingGroups = day.groups.filter(g => g.label === group);
    const groupExerciseCount = matchingGroups.reduce((s, g) => s + g.exercises.length, 0);
    const hasExact = day.groups.some(g => g.exercises.some(ex => ex.name === exerciseName));
    return {
      dayName: day.name,
      dayLabel: day.name.split('·')[0].trim(),
      hasGroup: matchingGroups.length > 0,
      hasExact: hasExact,
      started: isDayStarted(day),
      groupExerciseCount: groupExerciseCount,
    };
  }).filter(Boolean);

  // Preferido: mismo músculo pero SIN el mismo ejercicio exacto — así es una sesión
  // realmente separada, no repetir el ejercicio dos veces el mismo rato.
  // Prioriza el día con menos ejercicios de ese grupo (para no sobrecargarlo).
  // Solo se recomiendan días que todavía no se han empezado esta semana —
  // un día en el que ya has entrenado (aunque no esté al 100%) ya es una sesión cerrada.
  const bestDifferent = candidates
    .filter(c => c.hasGroup && !c.hasExact && !c.started)
    .sort((a, b) => a.groupExerciseCount - b.groupExerciseCount)[0];
  if (bestDifferent) return { dayLabel: bestDifferent.dayLabel, dayName: bestDifferent.dayName, sameExercise: false };

  // Si no hay otra opción, el mismo ejercicio exacto (implica hacerlo dos veces esa sesión —
  // no es lo ideal, pero mejor que saltárselo del todo)
  const sameExerciseDay = candidates.filter(c => c.hasExact && !c.started)[0];
  if (sameExerciseDay) return { dayLabel: sameExerciseDay.dayLabel, dayName: sameExerciseDay.dayName, sameExercise: true };

  // Cualquier día no empezado, aunque no comparta músculo
  const fallback = candidates.filter(c => !c.started)[0];
  if (fallback) return { dayLabel: fallback.dayLabel, dayName: fallback.dayName, sameExercise: false };

  return null; // ya no queda hueco esta semana
}

function pendingFromPartialDays(){
  const pending = [];
  DAYS.forEach((day, dayIdx) => {
    const exerciseEntries = effectiveDayGroups(day).flatMap(g => g.exercises.map(ex => ({ name: ex.name, grupo: g.label })));
    const counts = exerciseEntries.map(e => weeklySeriesCount(day.name, e.name));
    const anyStarted = counts.some(c => c > 0);
    const allDone = counts.every(c => c >= 3);
    if (anyStarted && !allDone) {
      const missing = exerciseEntries
        .filter((e, i) => counts[i] < 3)
        .map((e, mi) => ({
          name: e.name,
          grupo: e.grupo,
          originalDayName: day.name,
          recommendedDay: recommendDayForExercise(e.name, dayIdx),
          id: 'pend-' + dayIdx + '-' + mi,
        }));
      pending.push({ dayLabel: day.name.split('·')[0].trim(), missing: missing });
    }
  });
  return pending;
}
