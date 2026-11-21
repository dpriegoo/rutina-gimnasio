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

// ---- Prescripción serie a serie (categoría de fatiga, descanso y RIR de cada serie) ----
function fillRirOptions(){
  [1, 2, 3].forEach(i => {
    const sel = $id('exEditRir' + i);
    if (sel.options.length) return;
    sel.innerHTML = [0, 1, 2, 3, 4].map(n => `<option value="${n}">${n === 0 ? 'Fallo (0)' : 'RIR ' + n}</option>`).join('');
  });
}

function setEditorRx(spec){
  fillRirOptions();
  $id('exEditCat').value = spec.cat;
  $id('exEditRestMin').value = spec.descanso[0]; $id('exEditRestMax').value = spec.descanso[1];
  [0, 1, 2].forEach(i => { $id('exEditRir' + (i + 1)).value = String(spec.rir[i]); });
  updateEditorRxHint();
}

// Valores por defecto del ejercicio que se está editando (su fila de la tabla o, si no está, los de su categoría)
function editorBaseSpec(){
  return prescriptionSpec({ name: $id('exEditName').value, sets: '3 · ' + ($id('exEditReps').value || '8-10'), timed: $id('exEditTimed').value === '1' }, '');
}
function editorCatDefaults(cat){
  const base = editorBaseSpec();
  return cat === base.cat ? { descanso: base.descanso, rir: base.rir } : RX_CATS[cat];
}

function updateEditorRxHint(){
  const cat = $id('exEditCat').value, c = RX_CATS[cat];
  if (!c) { $id('exEditRxHint').textContent = ''; return; }
  const dflt = editorCatDefaults(cat);
  $id('exEditRxHint').textContent = 'Por defecto en «' + c.label + '»: RIR ' + dflt.rir.join(' / ') + ' y descanso ' + rxFmtRestRange({ descanso: dflt.descanso }) + '. Son rangos prácticos, no una verdad exacta: cámbialos si otros te sientan mejor. RIR 0 = fallo técnico (la última repetición con técnica limpia).';
}

// Al cambiar de categoría se cargan los valores por defecto de esa categoría (o, si vuelves a la original, los de este ejercicio)
function onEditorCatChange(){
  const cat = $id('exEditCat').value; if (!RX_CATS[cat]) return;
  const dflt = editorCatDefaults(cat);
  $id('exEditRestMin').value = dflt.descanso[0]; $id('exEditRestMax').value = dflt.descanso[1];
  [0, 1, 2].forEach(i => { $id('exEditRir' + (i + 1)).value = String(dflt.rir[i]); });
  updateEditorRxHint();
}

// Lo que el editor guarda de la prescripción: solo lo que se aparta de los valores por defecto (así, si ajustamos la tabla, tus ejercicios sin tocar siguen la tabla)
function readEditorRx(name, sets, timed){
  const cat = $id('exEditCat').value;
  const rest = [Math.round(Number($id('exEditRestMin').value)), Math.round(Number($id('exEditRestMax').value))];
  const rir = [1, 2, 3].map(i => Number($id('exEditRir' + i).value));
  if (!(rest[0] >= 15 && rest[1] >= rest[0] && rest[1] <= 600)) return { error: 'El descanso debe estar entre 15 y 600 segundos, con el mínimo menor o igual que el máximo.' };
  if (rir.some(n => !(n >= 0 && n <= 5))) return { error: 'El RIR de cada serie va de 0 a 5.' };
  const base = prescriptionSpec({ name: name, sets: sets, timed: timed }, '');
  const catDefaults = cat === base.cat ? { descanso: base.descanso, rir: base.rir } : RX_CATS[cat];
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  return {
    categoria_fatiga: cat !== base.cat ? cat : null,
    descanso_seg: same(rest, catDefaults.descanso) ? null : rest,
    esquema_rir: same(rir, catDefaults.rir) ? null : rir,
  };
}

function fillEditor(dayIdx, ex, groupLabel){
  $id('exEditDay').innerHTML = ROUTINE.days.map((d, i) => `<option value="${i}">${escHtml(d.name)}</option>`).join('');
  $id('exEditDay').value = String(dayIdx);
  fillGroupOptions(dayIdx, groupLabel, null);
  $id('exEditIcon').innerHTML = Object.keys(ICONS).map(k => `<option value="${k}">${escHtml(ICON_LABELS[k] || k)}</option>`).join('');
  $id('exEditFeel').innerHTML = '<option value="">Automático (según nombre / icono)</option>' + Object.keys(FEEL_PROFILES).map(k => `<option value="${k}">${escHtml(FEEL_PROFILES[k].label)}</option>`).join('');
  $id('exEditFeel').value = ex && ex.feel && FEEL_PROFILES[ex.feel] ? ex.feel : '';
  $id('exEditName').value = ex ? ex.name : '';
  $id('exEditTimed').value = ex && ex.timed ? '1' : '0';
  const parts = ex && ex.sets ? String(ex.sets).split('·') : [];
  // El rango que se enseña es el efectivo (el de tu tabla si tu rutina seguía con el antiguo): al guardar queda ya en tu rutina
  const sp = ex ? prescriptionSpec(ex) : null;
  $id('exEditReps').value = sp ? (sp.rango[0] === sp.rango[1] ? String(sp.rango[0]) : sp.rango[0] + '-' + sp.rango[1]) + (sp.timed ? ' seg' : '') : (parts.length > 1 ? parts[1].trim() : '');
  $id('exEditIcon').value = ex && ICONS[ex.icon] ? ex.icon : 'dumbbells';
  $id('exEditPrimary').value = ex ? (ex.primary || '') : '';
  $id('exEditAlts').value = ex ? (ex.alts || []).join('\n') : '';
  $id('exEditHowTo').value = ex ? (ex.howTo || '') : '';
  $id('exEditCanonical').value = ex && ex.canonical ? ex.canonical : 'Bíceps';
  $id('exEditError').textContent = '';
  setEditorRx(ex ? prescriptionSpec(ex) : { cat: 'accesorio', descanso: RX_CATS.accesorio.descanso, rir: RX_CATS.accesorio.rir });
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
  focusOpen('exerciseEditorModal');
}

function openExerciseEditor(dayIdx, exId){
  const loc = findInRoutine(ROUTINE, dayIdx, exId);
  if (!loc) { showToast('No se encontró ese ejercicio'); return; }
  editorState = { dayIdx: dayIdx, exId: exId };
  $id('exEditTitle').textContent = 'Editar ejercicio';
  $id('exEditArchiveBtn').style.display = 'block';
  fillEditor(dayIdx, loc.ex, loc.group.label);
  $id('exerciseEditorModal').style.display = 'flex';
  focusOpen('exerciseEditorModal');
}

function closeExerciseEditor(){
  const was = isShown('exerciseEditorModal');
  $id('exerciseEditorModal').style.display = 'none';
  if (was) focusClose();
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
  const rx = readEditorRx(name, fields.sets, timed);
  if (rx.error) return err(rx.error);

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
  const feelKey = $id('exEditFeel').value;
  if (feelKey && FEEL_PROFILES[feelKey]) ex.feel = feelKey; else delete ex.feel;
  if (timed) ex.timed = true; else delete ex.timed;
  // Prescripción: solo se guarda lo que difiere de los valores por defecto; al tocar el texto de repeticiones, el rango sale de ahí
  delete ex.rango_reps;
  ['categoria_fatiga', 'descanso_seg', 'esquema_rir'].forEach(k => { if (rx[k] === null) delete ex[k]; else ex[k] = rx[k]; });
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
  focusOpen('dayRenameModal');
}

function closeDayRename(){
  const was = isShown('dayRenameModal');
  $id('dayRenameModal').style.display = 'none';
  if (was) focusClose();
}

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
let editOrdering = false;
function toggleEditOrdering(){ editOrdering = !editOrdering; renderEditView(); }

function renderEditView(){
  const el = document.getElementById('editViewBody');
  if (!el || !ROUTINE) return;
  el.classList.toggle('ordering', editOrdering);
  const archived = [];
  let html = '<div class="edit-intro">Toca un ejercicio para editarlo, cambiarlo de día o archivarlo. Los cambios se ven al momento en la pestaña Rutina.</div>' +
    '<div style="padding:0 16px; margin-top:10px;"><button type="button" class="edit-order-btn" aria-pressed="' + editOrdering + '" onclick="toggleEditOrdering()">' + (editOrdering ? 'Listo' : 'Ordenar ejercicios') + '</button></div>';
  ROUTINE.days.forEach((day, di) => {
    html += `<div class="edit-day" style="--c:${dayColorVar(di)}">
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
            <div class="edit-ex-sub">${(() => { const sp = prescriptionSpec(e); return escHtml(sp.series + ' · ' + sp.rango[0] + (sp.rango[1] !== sp.rango[0] ? '–' + sp.rango[1] : '') + (sp.timed ? ' s' : '') + ' · ' + sp.catLabel); })()}</div>
          </div>
          <button class="edit-arrow" ${i === 0 ? 'disabled' : ''} onclick="moveExerciseInGroup(${di}, '${jsArg(e.id)}', -1)" aria-label="Subir ${escHtml(e.name)}">${uiIcon('chevU')}</button>
          <button class="edit-arrow" ${i === active.length - 1 ? 'disabled' : ''} onclick="moveExerciseInGroup(${di}, '${jsArg(e.id)}', 1)" aria-label="Bajar ${escHtml(e.name)}">${uiIcon('chevD')}</button>
          <span class="edit-chev" aria-hidden="true">${uiIcon('chevR')}</span>
        </div>`;
      });
    });
    if (!any) html += '<div class="draft-empty">Este día no tiene ejercicios activos.</div>';
    html += `<button class="day-edit-btn" onclick="openNewExercise(${di})">${uiIcon('plus', 's')} Añadir ejercicio a este día</button></div>`;
  });

  html += `<div class="edit-day"><div class="edit-day-head"><div class="edit-day-name">Archivados</div></div>`;
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
