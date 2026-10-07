// =====================================================================
// Pestaña Editar  (editor.js)
// Crear, editar, archivar y mover ejercicios; renombrar días y asignar grupos
// musculares.
// Depende de: routine, utils, day-view.
// =====================================================================

// ---- Pestaña "Editar": días, ejercicios y grupos musculares ----
let editorState = { dayIdx: 0, exId: null };

function dayShortLabel(name){ return String(name).split('·')[0].trim(); }

function groupOptionsForDay(dayIdx){
  const present = ROUTINE.days[dayIdx].groups.map(g => g.label);
  return present.concat(ALLOWED_GROUP_LABELS.filter(l => present.indexOf(l) === -1));
}

// ¿Hay ya en ese día un ejercicio (o un nombre antiguo suyo) con este nombre?
function nameTakenInDay(routine, dayIdx, name, exceptId){
  const lower = name.toLowerCase();
  let hit = null;
  routine.days[dayIdx].groups.forEach(g => g.exercises.forEach(ex => {
    if (ex.id === exceptId) return;
    if ([ex.name].concat(ex.aliases || []).some(n => n.toLowerCase() === lower)) hit = ex;
  }));
  return hit;
}

function updateEditorIconPreview(){
  $id('exEditIconPreview').innerHTML = ICONS[$id('exEditIcon').value] || '';
}

function onEditorGroupChange(){
  $id('exEditCanonicalWrap').style.display = $id('exEditGroup').value === 'Brazos' ? 'block' : 'none';
}

function fillGroupOptions(dayIdx, selected, fallback){
  const options = groupOptionsForDay(dayIdx);
  const groupSel = $id('exEditGroup');
  groupSel.innerHTML = options.map(l => `<option value="${escHtml(l)}">${escHtml(l)}</option>`).join('');
  groupSel.value = options.indexOf(selected) >= 0 ? selected : (options.indexOf(fallback) >= 0 ? fallback : options[0]);
}

// Al cambiar el día en el editor se recalculan los grupos disponibles en ese día
function onEditorDayChange(){
  const idx = Number($id('exEditDay').value);
  const prevLabel = $id('exEditGroup').value;
  const fallback = $id('exEditCanonical').value;
  fillGroupOptions(idx, prevLabel, prevLabel === 'Brazos' ? fallback : null);
  onEditorGroupChange();
}

function fillEditor(dayIdx, ex, groupLabel){
  $id('exEditDay').innerHTML = ROUTINE.days.map((d, i) => `<option value="${i}">${escHtml(d.name)}</option>`).join('');
  $id('exEditDay').value = String(dayIdx);
  fillGroupOptions(dayIdx, groupLabel, null);
  $id('exEditIcon').innerHTML = Object.keys(ICONS).map(k => `<option value="${k}">${escHtml(ICON_LABELS[k] || k)}</option>`).join('');
  $id('exEditName').value = ex ? ex.name : '';
  $id('exEditTimed').value = ex && ex.timed ? '1' : '0';
  const parts = ex && ex.sets ? String(ex.sets).split('·') : [];
  $id('exEditReps').value = parts.length > 1 ? parts[1].trim() : '';
  $id('exEditIcon').value = ex && ICONS[ex.icon] ? ex.icon : 'dumbbells';
  $id('exEditPrimary').value = ex ? (ex.primary || '') : '';
  $id('exEditAlts').value = ex ? (ex.alts || []).join('\n') : '';
  $id('exEditHowTo').value = ex ? (ex.howTo || '') : '';
  $id('exEditCanonical').value = ex && ex.canonical ? ex.canonical : 'Bíceps';
  $id('exEditError').textContent = '';
  updateEditorIconPreview();
  onEditorGroupChange();
}

function openNewExercise(dayIdx){
  editorState = { dayIdx: dayIdx, exId: null };
  $id('exEditTitle').textContent = 'Añadir ejercicio';
  $id('exEditArchiveBtn').style.display = 'none';
  const first = ROUTINE.days[dayIdx].groups.length ? ROUTINE.days[dayIdx].groups[0].label : 'Pectoral';
  fillEditor(dayIdx, null, first);
  $id('exerciseEditorModal').style.display = 'flex';
}

function openExerciseEditor(dayIdx, exId){
  const loc = findInRoutine(ROUTINE, dayIdx, exId);
  if (!loc) { showToast('No se encontró ese ejercicio'); return; }
  editorState = { dayIdx: dayIdx, exId: exId };
  $id('exEditTitle').textContent = 'Editar ejercicio';
  $id('exEditArchiveBtn').style.display = 'block';
  fillEditor(dayIdx, loc.ex, loc.group.label);
  $id('exerciseEditorModal').style.display = 'flex';
}

function closeExerciseEditor(){
  $id('exerciseEditorModal').style.display = 'none';
}

// Las series pendientes de una tarjeta se guardan con una clave que incluye el día
function movePendingKey(oldIdx, newIdx, exId){
  const rows = getPendingRows();
  const oldKey = 'log-' + oldIdx + '-' + exId, newKey = 'log-' + newIdx + '-' + exId;
  if (!rows[oldKey]) return;
  rows[newKey] = (rows[newKey] || []).concat(rows[oldKey]);
  delete rows[oldKey];
  savePendingRows(rows);
}

function saveExerciseEditor(){
  const srcIdx = editorState.dayIdx;
  const tgtIdx = Number($id('exEditDay').value);
  const editing = !!editorState.exId;
  const name = cleanText($id('exEditName').value, 60);
  const err = msg => { $id('exEditError').textContent = msg; };
  if (!name) return err('Ponle un nombre al ejercicio.');

  const clash = nameTakenInDay(ROUTINE, tgtIdx, name, editorState.exId);
  if (clash) return err(clash.archived
    ? 'Ya hay un ejercicio archivado con ese nombre en ese día: restáuralo desde "Archivados".'
    : 'Ya existe un ejercicio con ese nombre en ese día.');

  const timed = $id('exEditTimed').value === '1';
  const reps = cleanText($id('exEditReps').value, 30) || (timed ? '30 seg' : '8-10');
  const groupLabel = $id('exEditGroup').value;
  const alts = $id('exEditAlts').value.split('\n').map(a => cleanText(a, 80)).filter(Boolean).slice(0, 8);
  const fields = {
    name: name,
    sets: '3 · ' + reps,
    icon: $id('exEditIcon').value,
    primary: cleanText($id('exEditPrimary').value, 100),
    alts: alts,
    howTo: cleanText($id('exEditHowTo').value, 400),
  };
  if (!ICONS[fields.icon]) return err('Elige un icono.');

  const newR = cloneJson(ROUTINE);
  const srcDay = newR.days[srcIdx], tgtDay = newR.days[tgtIdx];
  const loc = editing ? findInRoutine(newR, srcIdx, editorState.exId) : null;
  if (editing && !loc) return err('No se encontró el ejercicio.');

  let target = tgtDay.groups.find(g => g.label === groupLabel);
  if (!target) { target = { label: groupLabel, exercises: [] }; tgtDay.groups.push(target); }

  let ex;
  if (editing) {
    ex = loc.ex;
    if (ex.name !== name) {
      ex.aliases = (ex.aliases || []).filter(a => a !== name);
      if (ex.aliases.indexOf(ex.name) === -1) ex.aliases.push(ex.name);
    }
    Object.assign(ex, fields);
  } else {
    ex = Object.assign({ id: newExerciseId() }, fields);
    target.exercises.push(ex);
  }
  if (timed) ex.timed = true; else delete ex.timed;
  if (groupLabel === 'Brazos') ex.canonical = $id('exEditCanonical').value; else delete ex.canonical;

  let moved = false;
  if (editing && loc.group !== target) {
    loc.group.exercises.splice(loc.ei, 1);
    target.exercises.push(ex);
    if (loc.group.exercises.length === 0) srcDay.groups.splice(srcDay.groups.indexOf(loc.group), 1);
    moved = true;
  }
  if (editing && srcIdx !== tgtIdx) {
    // El historial se queda con el ejercicio: se apunta de qué día venía y hasta cuándo
    const tgtNames = [tgtDay.name].concat(tgtDay.aliases || []);
    ex.moves = (ex.moves || []).filter(mv => tgtNames.indexOf(mv.day) === -1);
    ex.moves.push({ day: srcDay.name, until: localDateStr() });
    movePendingKey(srcIdx, tgtIdx, ex.id);
  }

  closeExerciseEditor();
  commitRoutine(newR);
  showToast(editing ? (srcIdx !== tgtIdx ? 'Ejercicio movido a ' + dayShortLabel(tgtDay.name) + ' ✓' : 'Ejercicio actualizado ✓') : 'Ejercicio añadido ✓');
}

function setArchived(dayIdx, exId, archived){
  const newR = cloneJson(ROUTINE);
  const loc = findInRoutine(newR, dayIdx, exId);
  if (!loc) return;
  if (archived) loc.ex.archived = true; else delete loc.ex.archived;
  commitRoutine(newR);
}

function archiveExerciseFromEditor(){
  const dayIdx = editorState.dayIdx, exId = editorState.exId;
  closeExerciseEditor();
  setArchived(dayIdx, exId, true);
  showToast('Archivado. Puedes restaurarlo desde "Archivados".');
}

function restoreExercise(dayIdx, exId){
  setArchived(dayIdx, exId, false);
  showToast('Ejercicio restaurado ✓');
}

// Sube o baja un ejercicio dentro de su grupo (saltándose los archivados)
function moveExerciseInGroup(dayIdx, exId, dir){
  const newR = cloneJson(ROUTINE);
  const loc = findInRoutine(newR, dayIdx, exId);
  if (!loc) return;
  const list = loc.group.exercises;
  let j = loc.ei + dir;
  while (j >= 0 && j < list.length && list[j].archived) j += dir;
  if (j < 0 || j >= list.length) return;
  const tmp = list[loc.ei]; list[loc.ei] = list[j]; list[j] = tmp;
  commitRoutine(newR);
}

// ---- Renombrar un día ----
let dayRenameIdx = 0;

function openDayRename(dayIdx){
  dayRenameIdx = dayIdx;
  $id('dayRenameInput').value = ROUTINE.days[dayIdx].name;
  $id('dayRenameError').textContent = '';
  $id('dayRenameModal').style.display = 'flex';
}

function closeDayRename(){ $id('dayRenameModal').style.display = 'none'; }

// Lo que estuviera guardado con el nombre antiguo del día (ejercicios prestados, ajuste semanal)
function migrateDayReferences(oldName, newName){
  let changed = false;
  if (borrowedExercises[oldName]) {
    borrowedExercises[newName] = (borrowedExercises[newName] || []).concat(borrowedExercises[oldName]);
    delete borrowedExercises[oldName];
    changed = true;
  }
  Object.keys(borrowedExercises).forEach(k => borrowedExercises[k].forEach(b => {
    if (b.originalDayName === oldName) { b.originalDayName = newName; b.originalDayLabel = dayShortLabel(newName); changed = true; }
  }));
  if (changed) { try { localStorage.setItem('borrowedExercises', JSON.stringify(borrowedExercises)); } catch(e) {} }
  const profile = getProfile();
  const ov = profile && getWeekOverride(profile);
  if (ov && ov.dayName === oldName) { ov.dayName = newName; setWeekOverride(profile, ov); }
}

function saveDayRename(){
  const di = dayRenameIdx;
  const name = cleanText($id('dayRenameInput').value, 60);
  const err = msg => { $id('dayRenameError').textContent = msg; };
  if (!name) return err('Ponle un nombre al día.');
  const old = ROUTINE.days[di].name;
  if (name === old) { closeDayRename(); return; }
  const lower = name.toLowerCase();
  const clash = ROUTINE.days.some((d, i) => i !== di && [d.name].concat(d.aliases || []).some(n => n.toLowerCase() === lower));
  if (clash) return err('Ya hay otro día con ese nombre.');

  const newR = cloneJson(ROUTINE);
  const day = newR.days[di];
  day.aliases = (day.aliases || []).filter(a => a !== name);
  if (day.aliases.indexOf(old) === -1) day.aliases.push(old);
  day.name = name;
  migrateDayReferences(old, name);
  closeDayRename();
  commitRoutine(newR);
  showToast('Día renombrado ✓');
}

// ---- Pantalla "Editar" ----
function renderEditView(){
  const el = document.getElementById('editViewBody');
  if (!el || !ROUTINE) return;
  const archived = [];
  let html = '<div class="edit-intro">Aquí gestionas tus días y ejercicios: toca un ejercicio para editarlo, cambiarlo de grupo o de día, o archivarlo. Los cambios se ven al momento en la pestaña Rutina.</div>';
  ROUTINE.days.forEach((day, di) => {
    html += `<div class="edit-day">
      <div class="edit-day-head">
        <div class="edit-day-name">${escHtml(day.name)}</div>
        <button class="edit-mini-btn" onclick="openDayRename(${di})">Renombrar</button>
      </div>`;
    let any = false;
    day.groups.forEach(g => {
      g.exercises.forEach(e => { if (e.archived) archived.push({ di: di, day: day, group: g, ex: e }); });
      const active = g.exercises.filter(e => !e.archived);
      if (active.length === 0) return;
      any = true;
      html += `<div class="edit-group-label">${escHtml(g.label)}</div>`;
      active.forEach((e, i) => {
        html += `<div class="edit-ex-row">
          <div class="edit-ex-main" onclick="openExerciseEditor(${di}, '${jsArg(e.id)}')">
            <div class="edit-ex-name">${escHtml(e.name)}</div>
            <div class="edit-ex-sub">${escHtml(e.sets)}${e.timed ? ' · por tiempo' : ''}</div>
          </div>
          <button class="edit-arrow" ${i === 0 ? 'disabled' : ''} onclick="moveExerciseInGroup(${di}, '${jsArg(e.id)}', -1)" aria-label="Subir">▲</button>
          <button class="edit-arrow" ${i === active.length - 1 ? 'disabled' : ''} onclick="moveExerciseInGroup(${di}, '${jsArg(e.id)}', 1)" aria-label="Bajar">▼</button>
          <button class="edit-mini-btn" onclick="openExerciseEditor(${di}, '${jsArg(e.id)}')" aria-label="Editar">✏️</button>
        </div>`;
      });
    });
    if (!any) html += '<div class="draft-empty">Este día no tiene ejercicios activos.</div>';
    html += `<button class="day-edit-btn" onclick="openNewExercise(${di})">＋ Añadir ejercicio a este día</button></div>`;
  });

  html += `<div class="edit-day"><div class="edit-day-head"><div class="edit-day-name">🗄️ Archivados</div></div>`;
  if (archived.length === 0) {
    html += '<div class="draft-empty">No hay ejercicios archivados. Si archivas uno, seguirá contando en tus métricas y podrás restaurarlo aquí.</div>';
  } else {
    archived.forEach(it => {
      html += `<div class="edit-ex-row">
        <div class="edit-ex-main">
          <div class="edit-ex-name">${escHtml(it.ex.name)}</div>
          <div class="edit-ex-sub">${escHtml(dayShortLabel(it.day.name))} · ${escHtml(it.group.label)}</div>
        </div>
        <button class="edit-mini-btn" onclick="restoreExercise(${it.di}, '${jsArg(it.ex.id)}')">Restaurar</button>
      </div>`;
    });
  }
  html += '</div>';
  el.innerHTML = html;
}
