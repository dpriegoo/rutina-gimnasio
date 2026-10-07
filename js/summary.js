// =====================================================================
// Resumen semanal  (summary.js)
// Resumen de la semana, comparación con el compañero y semana pasada, y consejo de
// Gemini.
// Depende de: api, utils, planning, muscles.
// =====================================================================

function weeklyVolumeForProfile(profile, weekStart){
  if (getBackend() === 'supabase' && profile !== getProfile()) {
    const pv = window._partnerVol;
    return (pv && pv.week === localDateStr(weekStart)) ? pv.vol : 0;
  }
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const cache = window._progressCache || [];
  return cache
    .filter(r => (r['Perfil'] || '') === profile && !isWarmupRow(r))
    .filter(r => { const f = parseLocalDate(r['Fecha']); return f >= weekStart && f < weekEnd; })
    .reduce((sum, r) => sum + rowVolume(r), 0);
}

function dayVolumeForWeek(profile, dia, weekStart){
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const cache = window._progressCache || [];
  return cache
    .filter(r => (r['Perfil'] || '') === profile && r['Día'] === dia && !isWarmupRow(r))
    .filter(r => { const f = parseLocalDate(r['Fecha']); return f >= weekStart && f < weekEnd; })
    .reduce((sum, r) => sum + rowVolume(r), 0);
}

function daysTrainedThisWeek(profile){
  const weekStart = getWeekStart();
  const cache = window._progressCache || [];
  const dates = new Set(
    cache.filter(r => (r['Perfil'] || '') === profile)
      .filter(r => parseLocalDate(r['Fecha']) >= weekStart)
      .map(r => String(r['Fecha']).slice(0,10))
  );
  return dates;
}

function weeklyImprovements(profile){
  const thisWeekStart = getWeekStart();
  const lastWeekStart = getWeekStartOffset(-1);
  const cache = window._progressCache || [];
  const rows = cache.filter(r => (r['Perfil'] || '') === profile && !isTimedExercise(r['Ejercicio']) && !isWarmupRow(r));
  const byExercise = {};
  rows.forEach(r => {
    const f = parseLocalDate(r['Fecha']);
    const ex = r['Ejercicio'];
    const peso = Number(r['Peso (kg)']) || 0;
    if (!byExercise[ex]) byExercise[ex] = { thisWeek: 0, lastWeek: 0 };
    if (f >= thisWeekStart) {
      byExercise[ex].thisWeek = Math.max(byExercise[ex].thisWeek, peso);
    } else if (f >= lastWeekStart && f < thisWeekStart) {
      byExercise[ex].lastWeek = Math.max(byExercise[ex].lastWeek, peso);
    }
  });
  const improvements = [];
  Object.keys(byExercise).forEach(ex => {
    const { thisWeek, lastWeek } = byExercise[ex];
    if (thisWeek > 0 && lastWeek > 0 && thisWeek > lastWeek) {
      improvements.push({ ex, from: lastWeek, to: thisWeek, delta: Math.round((thisWeek - lastWeek) * 10) / 10 });
    }
  });
  improvements.sort((a, b) => b.delta - a.delta);
  return improvements;
}

function showWeekSummary(){
  renderWeekSummary();
  document.getElementById('summaryScreen').style.display = 'block';
}

function hideWeekSummary(){
  document.getElementById('summaryScreen').style.display = 'none';
}

function showDayComparison(dayIdx){
  renderDayComparison(dayIdx);
  document.getElementById('dayCompareScreen').style.display = 'block';
}

function hideDayComparison(){
  document.getElementById('dayCompareScreen').style.display = 'none';
}

function renderDayComparison(dayIdx){
  const day = DAYS[dayIdx];
  const profile = getProfile();
  const thisWeekStart = getWeekStart();
  const lastWeekStart = getWeekStartOffset(-1);

  document.getElementById('dayCompareTitle').textContent = day.name.split('·')[0].trim() + ': esta semana vs. la pasada';

  const volThis = Math.round(dayVolumeForWeek(profile, day.name, thisWeekStart));
  const volLast = Math.round(dayVolumeForWeek(profile, day.name, lastWeekStart));
  let volDeltaHtml;
  if (volLast > 0) {
    const pct = Math.round(((volThis - volLast) / volLast) * 100);
    const cls = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat');
    const arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '·');
    volDeltaHtml = `<div class="sum-delta ${cls}">${arrow} ${pct > 0 ? '+' : ''}${pct}% vs. semana pasada (${volLast.toLocaleString('es-ES')} kg)</div>`;
  } else {
    volDeltaHtml = `<div class="sum-delta flat">Sin datos de la semana pasada para comparar</div>`;
  }

  const exerciseEntries = effectiveDayGroups(day).flatMap(g => g.exercises.map(ex => ({ name: ex.name, timed: isTimedExercise(ex.name) })));
  const rowsHtml = exerciseEntries.map(e => {
    const thisMark = bestMarkInWeek(day.name, e.name, thisWeekStart);
    const lastMark = bestMarkInWeek(day.name, e.name, lastWeekStart);
    const thisTxt = !thisMark ? 'Sin registrar' : (e.timed ? thisMark.reps + 's' : thisMark.peso + 'kg × ' + thisMark.reps);
    const lastTxt = !lastMark ? 'Sin datos' : (e.timed ? lastMark.reps + 's' : lastMark.peso + 'kg × ' + lastMark.reps);

    let deltaHtml = '';
    if (thisMark && lastMark) {
      if (e.timed) {
        const d = thisMark.reps - lastMark.reps;
        deltaHtml = d > 0 ? `<span class="sum-improve-delta">+${d}s</span>`
          : (d < 0 ? `<span class="sum-improve-delta" style="color:#e0656a;">${d}s</span>`
          : `<span class="metric-sub">Igual</span>`);
      } else {
        const d = Math.round((thisMark.rm - lastMark.rm) * 10) / 10;
        deltaHtml = d > 0 ? `<span class="sum-improve-delta">+${d}kg (1RM est.)</span>`
          : (d < 0 ? `<span class="sum-improve-delta" style="color:#e0656a;">${d}kg (1RM est.)</span>`
          : `<span class="metric-sub">Igual</span>`);
      }
    }

    const variantMismatch = thisMark && lastMark && (thisMark.variante || '') !== (lastMark.variante || '');
    const mismatchHtml = variantMismatch
      ? `<div style="font-size:11px; color:var(--amber); text-align:right;">⚠️ variante distinta (${lastMark.variante || 'la habitual'} → ${thisMark.variante || 'la habitual'}), la comparación no es del todo justa</div>`
      : '';

    return `
      <div class="sum-improve-row" style="flex-direction:column; align-items:stretch; gap:4px;">
        <div><b>${e.name}</b></div>
        <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--muted);">
          <span>Pasada: ${lastTxt}</span>
          <span>Esta semana: ${thisTxt}</span>
        </div>
        ${deltaHtml ? `<div style="text-align:right;">${deltaHtml}</div>` : ''}
        ${mismatchHtml}
      </div>
    `;
  }).join('');

  document.getElementById('dayCompareBody').innerHTML = `
    <div class="sum-card">
      <div class="sum-title">Volumen total del día</div>
      <div class="sum-big">${volThis.toLocaleString('es-ES')} kg</div>
      ${volDeltaHtml}
    </div>
    <div class="sum-card">
      <div class="sum-title">Por ejercicio</div>
      ${rowsHtml}
    </div>
  `;
}

function renderWeekSummary(){
  const profile = getProfile();
  const otherProfile = profile === 'David' ? 'Pedro' : 'David';
  const body = document.getElementById('summaryBody');

  // Días entrenados
  const trainedDates = daysTrainedThisWeek(profile);
  const weekStart = getWeekStart();
  const dayLabels = ['L','M','X','J','V','S','D'];
  const dayPills = dayLabels.map((lbl, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = localDateStr(d);
    const done = trainedDates.has(key);
    return `<div class="sum-day-pill${done ? ' done' : ''}">${lbl}</div>`;
  }).join('');

  // Volumen esta semana vs semana pasada
  const volThis = Math.round(weeklyVolumeForProfile(profile, getWeekStart()));
  const volLast = Math.round(weeklyVolumeForProfile(profile, getWeekStartOffset(-1)));
  let deltaHtml = '';
  if (volLast > 0) {
    const pct = Math.round(((volThis - volLast) / volLast) * 100);
    const cls = pct > 0 ? 'up' : (pct < 0 ? 'down' : 'flat');
    const arrow = pct > 0 ? '▲' : (pct < 0 ? '▼' : '·');
    deltaHtml = `<div class="sum-delta ${cls}">${arrow} ${pct > 0 ? '+' : ''}${pct}% vs. semana pasada (${volLast.toLocaleString('es-ES')} kg)</div>`;
  } else {
    deltaHtml = `<div class="sum-delta flat">Sin datos de la semana pasada para comparar</div>`;
  }

  // Mejoras de la semana
  const improvements = weeklyImprovements(profile);
  const improvementsHtml = improvements.length === 0
    ? `<div class="metric-empty" style="padding:8px 0;">Aún no hay mejoras registradas esta semana respecto a la pasada.</div>`
    : improvements.slice(0, 6).map(imp => `
        <div class="sum-improve-row">
          <span>${imp.ex}</span>
          <span class="sum-improve-delta">+${imp.delta} kg</span>
        </div>
      `).join('');

  // Comparativa con el compañero
  const volOtherThis = Math.round(weeklyVolumeForProfile(otherProfile, getWeekStart()));
  const maxVol = Math.max(volThis, volOtherThis, 1);
  const barsHtml = `
    <div class="sum-vs-row">
      <div class="sum-vs-name">${profile}</div>
      <div class="sum-vs-bar-wrap"><div class="sum-vs-bar" style="width:${(volThis/maxVol*100)}%; background:var(--blue);"></div></div>
      <div class="sum-vs-value">${volThis.toLocaleString('es-ES')} kg</div>
    </div>
    <div class="sum-vs-row">
      <div class="sum-vs-name">${otherProfile}</div>
      <div class="sum-vs-bar-wrap"><div class="sum-vs-bar" style="width:${(volOtherThis/maxVol*100)}%; background:var(--amber);"></div></div>
      <div class="sum-vs-value">${volOtherThis.toLocaleString('es-ES')} kg</div>
    </div>
  `;

  // Ejercicios pendientes de días empezados pero no completados
  const pending = pendingFromPartialDays();
  const pendingHtml = pending.length === 0 ? '' : `
    <div class="sum-card">
      <div class="sum-title">⚠️ Ejercicios pendientes de esta semana</div>
      <div class="metric-sub" style="margin-bottom:10px;">Días que empezaste pero no terminaste — te sugiero dónde encajarlos, y puedes registrarlos aquí mismo</div>
      ${pending.map(p => `
        <div style="margin-bottom:10px;">
          <div style="font-size:12.5px; font-weight:700; color:var(--amber); margin-bottom:4px;">${p.dayLabel}</div>
          ${p.missing.map(m => `
            <div style="padding:8px 0; border-bottom:1px solid var(--card-border);">
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:13.5px;">
                <span>${m.name}</span>
                <span class="sum-improve-delta" style="color:var(--blue);">${m.recommendedDay ? '→ ' + m.recommendedDay.dayLabel : 'la semana que viene'}</span>
              </div>
              ${m.recommendedDay ? `
                <div class="metric-sub" style="margin-top:4px; margin-bottom:6px; text-align:left;">
                  ${m.recommendedDay.sameExercise
                    ? 'No queda otro día con ese músculo suelto, así que tocaría repetir este mismo ejercicio en la sesión de ' + m.recommendedDay.dayLabel + '. No es lo ideal (mejor repartido que junto), pero si no hay otro hueco esta semana, añádelo igualmente.'
                    : 'Aprovecha esa sesión (trabaja el mismo músculo, sin repetir este ejercicio).'}
                </div>
                <button class="accept-btn" onclick="addBorrowedExercise('${m.recommendedDay.dayName.replace(/'/g,"\\'")}','${m.name.replace(/'/g,"\\'")}','${m.grupo.replace(/'/g,"\\'")}','${m.originalDayName.replace(/'/g,"\\'")}')">+ Añadir a ${m.recommendedDay.dayLabel}</button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;

  body.innerHTML = `
    <div class="sum-card">
      <div class="sum-title">Días entrenados esta semana</div>
      <div class="sum-big">${trainedDates.size} / 5</div>
      <div class="sum-days">${dayPills}</div>
    </div>

    ${pendingHtml}
    <div class="sum-card">
      <div class="sum-title">Volumen total esta semana</div>
      <div class="sum-big">${volThis.toLocaleString('es-ES')} kg</div>
      ${deltaHtml}
    </div>

    <div class="sum-card">
      <div class="sum-title">Mejoras de la semana (peso máximo por ejercicio)</div>
      ${improvementsHtml}
    </div>

    <div class="sum-card">
      <div class="sum-title">Volumen esta semana: ${profile} vs. ${otherProfile}</div>
      ${barsHtml}
    </div>

    <div class="sum-card" id="geminiCard">
      <div class="sum-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>💡 Consejo de la semana</span>
        <button class="gemini-regen-btn" onclick="regenerateAdvice()" title="Regenerar consejo">✨</button>
      </div>
      <div id="geminiAdviceText" class="metric-empty" style="padding:8px 0; text-align:left;">Generando consejo…</div>
    </div>
  `;

  const weightTrend = getWeightTrend();
  const statsForAdvice = {
    days: trainedDates.size,
    volThis: volThis,
    volLast: volLast,
    improvements: improvements.slice(0, 5).map(i => i.ex + ' (+' + i.delta + 'kg)').join(', '),
    altura: window._height || null,
    pesoActual: weightTrend.pesoActual,
    pesoHaceSemana: weightTrend.pesoHaceSemana
  };
  window._lastAdviceProfile = profile;
  window._lastAdviceStats = statsForAdvice;
  loadGeminiAdvice(profile, statsForAdvice);
}

function regenerateAdvice(){
  const profile = window._lastAdviceProfile;
  const stats = window._lastAdviceStats;
  if (!profile || !stats) return;
  const today = localDateStr();
  localStorage.removeItem('geminiAdvice_' + profile + '_' + today);
  loadGeminiAdvice(profile, stats);
}

function loadGeminiAdvice(profile, stats){
  const today = localDateStr();
  const cacheKey = 'geminiAdvice_' + profile + '_' + today;
  const cached = localStorage.getItem(cacheKey);
  const textEl = document.getElementById('geminiAdviceText');
  if (cached) {
    textEl.textContent = cached;
    textEl.className = '';
    return;
  }
  textEl.className = '';
  textEl.innerHTML = '<div class="gemini-loading"><div class="gemini-spinner"></div><span>Generando consejo… puede tardar hasta 30s la primera vez del día</span></div>';
  postToSheet({ action: 'advice', stats: stats })
    .then(res => res.json())
    .then(data => {
      if (data && data.advice) {
        localStorage.setItem(cacheKey, data.advice);
        textEl.textContent = data.advice;
        textEl.className = '';
      } else {
        textEl.textContent = 'No se pudo generar el consejo esta vez. Prueba a reabrir el resumen más tarde.';
      }
    })
    .catch(() => {
      textEl.textContent = 'No se pudo generar el consejo esta vez. Prueba a reabrir el resumen más tarde.';
    });
}
