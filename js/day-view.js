// =====================================================================
// Vista del día  (day-view.js)
// Tarjetas de ejercicio (carrusel horizontal), ejercicios prestados y resaltados (récords,
// series de la semana). La pantalla de elegir día y la tira de progreso viven en day-picker.js;
// las gráficas de cada tarjeta en progress-chart.js.
// Depende de: routine, outbox, planning, utils, progress-chart.
// =====================================================================

function weeklySeriesCount(dia, ejercicio){
  const profile = getProfile();
  const weekStart = getWeekStart();
  const cache = window._progressCache || [];
  return cache
    .filter(r => {
      if ((r['Perfil'] || '') !== profile) return false;
      if (r['Día'] !== dia || r['Ejercicio'] !== ejercicio) return false;
      if (isWarmupRow(r)) return false; // el calentamiento no cuenta para el objetivo de 3 series
      const f = parseLocalDate(r['Fecha']);
      return f >= weekStart;
    })
    .reduce((sum, r) => sum + (Number(r['Series']) || 0), 0);
}

function lastSessionValue(ejercicio){
  const profile = getProfile();
  const cache = window._progressCache || [];
  const fromSheet = cache
    .filter(r => (r['Perfil'] || '') === profile && r['Ejercicio'] === ejercicio && !isWarmupRow(r))
    .map(r => ({ fecha: String(r['Fecha']).slice(0,10), peso: r['Peso (kg)'], reps: r['Reps'] }));
  if (fromSheet.length === 0) return null;
  fromSheet.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return fromSheet[fromSheet.length - 1];
}

function bestMarkInWeek(dia, ejercicio, weekStart){
  const profile = getProfile();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const cache = window._progressCache || [];
  const rows = cache.filter(r => {
    if ((r['Perfil'] || '') !== profile) return false;
    if (r['Día'] !== dia || r['Ejercicio'] !== ejercicio) return false;
    if (isWarmupRow(r)) return false; // el calentamiento no cuenta como marca
    const f = parseLocalDate(r['Fecha']);
    return f >= weekStart && f < weekEnd;
  });
  if (rows.length === 0) return null;

  if (isTimedExercise(ejercicio)) {
    let best = rows[0];
    rows.forEach(r => { if ((Number(r['Reps']) || 0) > (Number(best['Reps']) || 0)) best = r; });
    return { timed: true, reps: Number(best['Reps']) || 0, variante: best['Variante'] || '' };
  }

  let best = rows[0];
  let bestRM = 0;
  rows.forEach(r => {
    const p = Number(r['Peso (kg)']) || 0;
    const rp = Number(r['Reps']) || 0;
    const rm = rp ? p * (1 + rp / 30) : 0;
    if (rm > bestRM) { bestRM = rm; best = r; }
  });
  return { timed: false, peso: Number(best['Peso (kg)']) || 0, reps: Number(best['Reps']) || 0, rm: Math.round(bestRM * 10) / 10, variante: best['Variante'] || '' };
}

function lastWeekBestMark(dia, ejercicio){
  return bestMarkInWeek(dia, ejercicio, getWeekStartOffset(-1));
}

function updateCardHighlights(){
  renderPriorityBanner();
  renderMuscleLoad();
  const day = DAYS[currentDay];
  if (!day) return;
  document.querySelectorAll('#main .card[data-exercise]').forEach(cardEl => {
    const exName = cardEl.getAttribute('data-exercise');
    const diaForCount = cardEl.getAttribute('data-borrow-dia') || day.name;
    const count = weeklySeriesCount(diaForCount, exName);
    cardEl.classList.toggle('done', count >= 3);
    const prog = cardEl.querySelector('.series-progress');
    if (prog) prog.textContent = count + '/3 esta semana';

    const beatEl = cardEl.querySelector('.beat-last-week');
    if (beatEl) {
      const lastWeek = lastWeekBestMark(diaForCount, exName);
      const variantNote = (lastWeek && lastWeek.variante) ? ' (con ' + lastWeek.variante + ')' : '';
      if (!lastWeek) {
        beatEl.textContent = '';
      } else if (lastWeek.timed) {
        beatEl.textContent = '🎯 Supera: ' + lastWeek.reps + 's (semana pasada' + variantNote + ')';
      } else {
        beatEl.textContent = '🎯 Supera: ' + lastWeek.peso + 'kg × ' + lastWeek.reps + ' (semana pasada' + variantNote + ')';
      }
    }

    const last = lastSessionValue(exName);
    const pesoInput = cardEl.querySelector('.inp-peso');
    const repsInput = cardEl.querySelector('.inp-reps');
    if (last && isTimedExercise(exName) && repsInput) {
      repsInput.placeholder = 'Últ: ' + last.reps + 's';
    } else {
      if (last && pesoInput) pesoInput.placeholder = 'Últ: ' + last.peso + 'kg';
      if (last && repsInput) repsInput.placeholder = 'Últ: ' + last.reps;
    }

    renderCardProgress(cardEl);
  });
  renderStrip();
}
 // logId -> {ids, count}, para poder deshacer el último guardado

function allTimeBestBeforeNow(dia, ejercicio){
  const profile = getProfile();
  const cache = window._progressCache || [];
  const rows = cache.filter(r => (r['Perfil'] || '') === profile && r['Día'] === dia && r['Ejercicio'] === ejercicio && !isWarmupRow(r));
  if (rows.length === 0) return null;
  if (isTimedExercise(ejercicio)) {
    let best = 0;
    rows.forEach(r => { const s = Number(r['Reps']) || 0; if (s > best) best = s; });
    return { timed: true, value: best };
  }
  let bestRM = 0;
  rows.forEach(r => {
    const p = Number(r['Peso (kg)']) || 0, rp = Number(r['Reps']) || 0;
    const rm = rp ? p * (1 + rp / 30) : 0;
    if (rm > bestRM) bestRM = rm;
  });
  return { timed: false, value: Math.round(bestRM * 10) / 10 };
}

// El QR/NFC de las máquinas Technogym solo abre el vídeo dentro de su propio
// escáner (no hay un enlace público reutilizable por ejercicio), así que en su
// lugar se abre una búsqueda de YouTube con el nombre exacto del ejercicio.
function openExerciseVideo(exerciseName){
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(exerciseName + ' ejercicio técnica correcta');
  window.open(url, '_blank');
}

function isDayComplete(day){
  const exerciseNames = effectiveDayGroups(day).flatMap(g => g.exercises.map(ex => ex.name));
  return exerciseNames.length > 0 && exerciseNames.every(
    name => weeklySeriesCount(day.name, name) >= 3
  );
}

function isDayStarted(day){
  const exerciseNames = effectiveDayGroups(day).flatMap(g => g.exercises.map(ex => ex.name));
  return exerciseNames.some(name => weeklySeriesCount(day.name, name) > 0);
}

// Refresca todo lo que depende del estado semanal: fichas de la pantalla de elegir día y
// tira de progreso del día abierto (ambas en day-picker.js). Se llama desde muchos sitios.
function renderTabs(){
  renderDayPicker();
  renderStrip();
}

let borrowedExercises = JSON.parse(localStorage.getItem('borrowedExercises') || '{}');

function findExerciseObjInDay(exerciseName, dayName){
  let found = null;
  DAYS.forEach(day => {
    if (day.name !== dayName) return;
    day.groups.forEach(g => {
      g.exercises.forEach(ex => {
        if (ex.name === exerciseName) found = ex;
      });
    });
  });
  return found;
}

function addBorrowedExercise(targetDayName, exerciseName, grupo, originalDayName){
  const exObj = findExerciseObjInDay(exerciseName, originalDayName);
  if (!exObj) return;
  if (!borrowedExercises[targetDayName]) borrowedExercises[targetDayName] = [];
  const already = borrowedExercises[targetDayName].some(b => b.name === exerciseName && b.originalDayName === originalDayName);
  if (already) {
    showToast('Ya está añadido a ese día');
    return;
  }
  borrowedExercises[targetDayName].push({
    name: exObj.name, sets: exObj.sets, icon: exObj.icon, primary: exObj.primary,
    alts: exObj.alts, howTo: exObj.howTo, grupo: grupo,
    originalDayName: originalDayName,
    originalDayLabel: originalDayName.split('·')[0].trim(),
  });
  localStorage.setItem('borrowedExercises', JSON.stringify(borrowedExercises));
  showToast('Añadido a ' + targetDayName.split('·')[0].trim() + ' ✓');
  renderDay();
}

function removeBorrowedExercise(targetDayName, idx){
  if (borrowedExercises[targetDayName]) {
    borrowedExercises[targetDayName].splice(idx, 1);
    if (borrowedExercises[targetDayName].length === 0) delete borrowedExercises[targetDayName];
    localStorage.setItem('borrowedExercises', JSON.stringify(borrowedExercises));
  }
  renderDay();
}

function buildCardHTML(ex, dia, grupo, logId, extraBadgeHtml){
  const zone = ZONE_META[ICON_TO_ZONE[ex.icon]] || ZONE_META.libre;
  const alts = ex.alts || [];
  const feel = Feel.summaryHTML(ex, logId);
  return `
    <div class="card-head">
      <button class="icon-box" type="button" onclick="openExerciseVideo('${jsArg(ex.name)}')" title="Ver vídeo de cómo hacerlo">${ICONS[ex.icon] || ''}<span class="play-badge">▶</span></button>
      <div class="card-headtext">
        <div class="exname">${escHtml(ex.name)}<span class="zone-badge" style="background:${zone.color}" title="${zone.label}">${zone.icon}</span>${extraBadgeHtml || ''}<span class="done-badge">✓ hecho</span></div>
        <div class="card-sub"><span class="grouptag">${escHtml(grupo)}</span><span class="sets">${escHtml(ex.sets)}</span><span class="series-progress"></span></div>
      </div>
    </div>
    <div class="card-body">
      <button class="pg" type="button" onclick="openProgressSheet('${jsArg(ex.name)}')" aria-label="Ver progresión de ${escHtml(ex.name)}"></button>
      <div class="beat-last-week"></div>
      <div class="log-title">Registrar serie</div>
      <div class="log-form open" id="${logId}">
        <div class="log-form-main">
          ${isTimedExercise(ex.name)
            ? `<input class="inp-reps" type="number" inputmode="numeric" placeholder="Segundos">`
            : `<input class="inp-peso" type="text" inputmode="decimal" placeholder="Peso kg">
               <input class="inp-reps" type="number" inputmode="numeric" placeholder="Reps">`}
          <button class="log-add" onclick="addPendingRow('${logId}')">+ Añadir</button>
        </div>
        <button class="log-adv-toggle" type="button" onclick="toggleAdvanced('${logId}')">⚙️ Variante / calentamiento / nota</button>
        <div class="log-advanced" id="adv-${logId}">
          <select class="inp-variante">
            <option value="">Variante: ${escHtml(ex.primary || 'la habitual')} (la habitual)</option>
            ${alts.map(a => `<option value="${escHtml(a)}">Variante: ${escHtml(a)}</option>`).join('')}
          </select>
          <label class="inp-warmup-label"><input type="checkbox" class="inp-calentamiento"> 🔥 Es calentamiento (no cuenta para el objetivo semanal ni el progreso)</label>
          <input class="inp-nota" type="text" placeholder="Nota opcional">
        </div>
      </div>
      <div class="pending-wrap" id="pendingWrap-${logId}" data-dia="${escHtml(dia)}" data-grupo="${escHtml(grupo)}" data-ejercicio="${escHtml(ex.name)}"></div>
      <div class="card-info">
        <div class="card-info-text">
          ${(ex.primary || alts.length) ? `<div class="machine">
            ${ex.primary ? `<div class="machine-row"><span class="tag primary">USA</span><span class="txt">${escHtml(ex.primary)}</span></div>` : ''}
            ${alts.length ? `<div class="machine-row"><span class="tag alt">SI OCUPADA</span></div>
            <div class="alt-list">${alts.map(escHtml).join(' &nbsp;·&nbsp; ')}</div>` : ''}
          </div>` : ''}
          ${feel.row}
        </div>
        ${feel.mini}
      </div>
      ${ex.howTo ? `<div class="howto"><b>Cómo hacerlo:</b> ${escHtml(ex.howTo)}</div>` : ''}
    </div>
    ${feel.more}
  `;
}

function renderDay(){
  const day = DAYS[currentDay];
  const main = document.getElementById('main');
  const extras = document.getElementById('dayExtras');
  main.innerHTML = '';
  extras.innerHTML = '';

  document.getElementById('dayTitle').textContent = day.name.split('·')[0].trim() + ' · ' + (day.name.split('·')[1] || '').trim();
  document.getElementById('dayScreen').style.setProperty('--c', dayColorVar(currentDay));

  document.getElementById('dayCompareBtn').onclick = () => showDayComparison(currentDay);

  const profileForOverride = getProfile();
  const activeOverride = profileForOverride && getWeekOverride(profileForOverride);
  if (activeOverride && activeOverride.dayName === day.name) {
    const notice = document.createElement('div');
    notice.className = 'priority-banner';
    notice.style.marginLeft = '0';
    notice.style.marginRight = '0';
    notice.innerHTML = '🔄 Esta semana este día es de <b>' + activeOverride.toGroupLabel + '</b> en vez de ' + activeOverride.fromGroupLabel + '. <button class="rest-week-toggle" onclick="revertWeekOverride()">Deshacer</button>';
    extras.appendChild(notice);
  }

  // Cada ejercicio es una tarjeta del carrusel (el grupo muscular va como etiqueta dentro de la tarjeta)
  effectiveDayGroups(day).forEach(g => {
    g.exercises.forEach(ex => {
      const logId = 'log-' + currentDay + '-' + ex.id;
      const card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('data-exercise', ex.name);
      card.innerHTML = buildCardHTML(ex, day.name, g.label, logId, '');
      main.appendChild(card);
      renderPendingWrap(logId);
    });
  });

  const borrowed = borrowedExercises[day.name] || [];
  borrowed.forEach((ex, bIdx) => {
    const logId = 'borrow-' + currentDay + '-' + bIdx;
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-exercise', ex.name);
    card.setAttribute('data-borrow-dia', ex.originalDayName);
    const badge = `<span class="borrow-badge" title="Pendiente de ${ex.originalDayLabel}">de ${ex.originalDayLabel}</span>`;
    card.innerHTML = buildCardHTML(ex, ex.originalDayName, ex.grupo, logId, badge) +
      `<button class="borrow-remove" onclick="removeBorrowedExercise('${day.name.replace(/'/g,"\\'")}', ${bIdx})" title="Quitar">✕</button>`;
    main.appendChild(card);
    renderPendingWrap(logId);
  });

  updateCardHighlights();
  restoreExerciseScroll();
}
