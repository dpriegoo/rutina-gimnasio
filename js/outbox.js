// =====================================================================
// Series pendientes y cola de sincronización  (outbox.js)
// Series tecleadas antes de aceptar, cola de envío (guardado instantáneo con reintentos
// 3/8/20/60 s), insignia de sincronización y medición de tiempos.
// Depende de: api, utils, routine, summary/day-view (para repintar).
// =====================================================================

// ---- Pending rows per card (acumular antes de aceptar) ----
// Se lee de localStorage justo antes de cada cambio, en vez de guardar una única
// copia en memoria durante toda la sesión — si la app se queda abierta en más de
// una pestaña/instancia a la vez (típico en Android: una pestaña normal + la app
// instalada, o "apps recientes" reteniendo una copia antigua), esto evita que la
// última en escribir borre sin querer lo que había puesto la otra.
function getPendingRows(){
  try { return JSON.parse(localStorage.getItem('pendingRows') || '{}'); } catch(e) { return {}; }
}

function savePendingRows(rows){
  try { localStorage.setItem('pendingRows', JSON.stringify(rows)); } catch(e) {}
}

function addPendingRow(logId){
  const box = document.getElementById(logId);
  const wrap = document.getElementById('pendingWrap-' + logId);
  const ejercicio = wrap ? wrap.dataset.ejercicio : '';
  const timed = isTimedExercise(ejercicio);
  let peso = '0', reps;
  if (timed) {
    reps = box.querySelector('.inp-reps').value.trim();
    if (!reps || isNaN(parseFloat(reps))) {
      showToast('Falta el tiempo en segundos');
      return;
    }
  } else {
    peso = box.querySelector('.inp-peso').value.replace(',', '.').trim();
    reps = box.querySelector('.inp-reps').value;
    if (!peso || !reps || isNaN(parseFloat(peso))) {
      showToast('Falta peso o reps');
      return;
    }
  }
  const variante = (box.querySelector('.inp-variante') && box.querySelector('.inp-variante').value) || '';
  const calentamiento = !!(box.querySelector('.inp-calentamiento') && box.querySelector('.inp-calentamiento').checked);
  const nota = (box.querySelector('.inp-nota') && box.querySelector('.inp-nota').value.trim()) || '';

  const rows = getPendingRows();
  if (!rows[logId]) rows[logId] = [];
  rows[logId].push({
    peso, reps, variante, calentamiento, nota,
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
  });
  savePendingRows(rows);
  const pesoEl = box.querySelector('.inp-peso');
  if (pesoEl) pesoEl.value = '';
  box.querySelector('.inp-reps').value = '';
  // La variante seleccionada se mantiene (si sigues usando la alternativa, no hay que reelegirla en cada serie).
  const calentamientoEl = box.querySelector('.inp-calentamiento');
  if (calentamientoEl) calentamientoEl.checked = false;
  const notaEl = box.querySelector('.inp-nota');
  if (notaEl) notaEl.value = '';
  renderPendingWrap(logId);
}

function removePendingRow(logId, idx){
  const rows = getPendingRows();
  if (rows[logId]) rows[logId].splice(idx, 1);
  savePendingRows(rows);
  renderPendingWrap(logId);
}

const savingPending = new Set();
 // logId de las tarjetas con un guardado en curso, para evitar dobles envíos
let lastAcceptedByLogId = {};

// ---- Cola de sincronización (guardado instantáneo) ----
// Al aceptar, las series se dan por guardadas al momento en la app y se envían al
// servidor en segundo plano. Si falla la red, se reintenta sola. Cada serie lleva un
// id estable y el servidor ignora los ids que ya tiene, así que reintentar es seguro.
function getOutbox(){
  try { return JSON.parse(localStorage.getItem('syncOutbox') || '[]'); } catch(e) { return []; }
}

function saveOutbox(list){
  try { localStorage.setItem('syncOutbox', JSON.stringify(list)); } catch(e) {}
  updateSyncBadge();
}

function outboxEntryToRow(e){
  return {
    'Fecha': e.fecha, 'Perfil': e.perfil, 'Día': e.dia, 'Grupo': e.grupo,
    'Ejercicio': e.ejercicio, 'Peso (kg)': e.peso, 'Reps': e.reps, 'Series': e.series,
    'Nota': e.nota, 'ID': e.id, 'Variante': e.variante, 'Calentamiento': e.calentamiento,
    '_unsynced': true,
  };
}

// Añade a la caché local lo que aún está en la cola (sin duplicar), para que un
// refresco del servidor no "borre" series que todavía no se han sincronizado.
function applyOutboxToCache(){
  normalizeCacheNames();
  const outbox = getOutbox();
  if (outbox.length === 0) return;
  if (!Array.isArray(window._progressCache)) window._progressCache = [];
  const have = new Set(window._progressCache.map(r => String(r['ID'])));
  outbox.forEach(e => { if (!have.has(String(e.id))) window._progressCache.push(outboxEntryToRow(e)); });
}

let flushing = false;

let flushAttempt = 0;

let flushRetryTimer = null;

function updateSyncBadge(){
  const el = document.getElementById('syncBadge');
  if (!el) return;
  const profile = getProfile();
  const n = getOutbox().filter(e => !profile || e.perfil === profile).length;
  if (n === 0) { el.style.display = 'none'; return; }
  el.textContent = (flushing ? '🔄 Sincronizando ' : '⏳ Sin sincronizar: ') + n;
  el.style.display = 'inline-block';
}

function recordSyncTiming(totalMs, serverMs){
  try {
    localStorage.setItem('lastSyncTiming', JSON.stringify({
      total: Math.round(totalMs), server: (typeof serverMs === 'number' ? serverMs : null), at: Date.now(), b: getBackend(), sb: window._sbLast || null,
    }));
  } catch(e) {}
  renderSyncTiming();
}

function renderSyncTiming(){
  const el = document.getElementById('syncTimingText');
  if (!el) return;
  try {
    const t = JSON.parse(localStorage.getItem('lastSyncTiming') || 'null');
    if (!t) { el.textContent = ''; return; }
    el.textContent = 'Última sincronización' + (t.b === 'supabase' ? ' [Supabase]' : ' [Sheets]') + ': ' + (t.total / 1000).toFixed(1) + ' s en total'
      + (t.server !== null ? ' (' + (t.server / 1000).toFixed(1) + ' s dentro del servidor)' : '')
      + (t.sb ? ' · sesión ' + t.sb.sess + ' ms, base de datos ' + t.sb.db + ' ms' : '');
  } catch(e) {}
}

function scheduleFlushRetry(){
  clearTimeout(flushRetryTimer);
  const delays = [3000, 8000, 20000, 60000];
  const delay = delays[Math.min(flushAttempt, delays.length - 1)];
  if (flushAttempt === 0) showToast('Sin conexión con el servidor: se reintentará solo');
  flushAttempt++;
  flushRetryTimer = setTimeout(flushOutbox, delay);
  updateSyncBadge();
}

async function flushOutbox(){
  if (flushing) return;
  const profile = getProfile();
  if (!profile || !getSessionToken()) return;
  const batch = getOutbox().filter(e => e.perfil === profile);
  if (batch.length === 0) { updateSyncBadge(); return; }

  flushing = true;
  clearTimeout(flushRetryTimer);
  updateSyncBadge();
  const t0 = Date.now();
  const data = await postToSheetChecked({ entries: batch });
  flushing = false;

  if (data && data.ok) {
    const sent = new Set(batch.map(e => String(e.id)));
    // Solo se quitan las enviadas: lo que se haya añadido mientras tanto se queda en cola
    saveOutbox(getOutbox().filter(e => !sent.has(String(e.id))));
    (window._progressCache || []).forEach(r => { if (sent.has(String(r['ID']))) delete r._unsynced; });
    flushAttempt = 0;
    recordSyncTiming(Date.now() - t0, data.ms);
    if (getOutbox().some(e => e.perfil === profile)) flushOutbox();
    return;
  }
  if (data && data.unauthorized) { updateSyncBadge(); return; } // tras iniciar sesión de nuevo se retoma solo
  scheduleFlushRetry();
}

function waitForFlushIdle(maxMs){
  return new Promise(resolve => {
    const t0 = Date.now();
    (function check(){
      if (!flushing || Date.now() - t0 > maxMs) return resolve();
      setTimeout(check, 100);
    })();
  });
}

async function acceptPending(logId){
  const wrap = document.getElementById('pendingWrap-' + logId);
  if (!wrap) return;
  const dia = wrap.dataset.dia, grupo = wrap.dataset.grupo, ejercicio = wrap.dataset.ejercicio;
  const rows = getPendingRows()[logId] || [];
  if (rows.length === 0) return;

  const priorBest = allTimeBestBeforeNow(dia, ejercicio);

  const entries = rows.map(r => ({
    fecha: localDateStr(),
    perfil: getProfile(),
    dia: dia, grupo: grupo, ejercicio: ejercicio,
    peso: r.peso, reps: r.reps, series: 1,
    variante: r.variante || '',
    calentamiento: !!r.calentamiento,
    nota: r.nota || '',
    id: r.id || (Date.now() + '-' + Math.random().toString(36).slice(2, 7)), // fallback por si venía de un pendiente guardado antes de este cambio
  }));

  // 1) Salen de "pendientes" (solo las de esta tanda, por id) y pasan a la cola de envío.
  //    Esto es instantáneo, así que un doble toque en "Aceptar" ya no puede duplicar nada.
  const acceptedIds = new Set(entries.map(e => e.id));
  const freshRows = getPendingRows();
  freshRows[logId] = (freshRows[logId] || []).filter(r => !acceptedIds.has(r.id));
  savePendingRows(freshRows);
  saveOutbox(getOutbox().concat(entries));

  // 2) Se refleja ya en la app (tarjetas en verde, volumen, etc.)
  applyOutboxToCache();

  // ¿Alguna de las series NO-calentamiento de esta tanda bate tu mejor marca de siempre en este ejercicio?
  let newBest = null;
  const timed = isTimedExercise(ejercicio);
  entries.forEach((e, i) => {
    if (rows[i].calentamiento) return;
    const value = timed ? (Number(e.reps) || 0) : (Number(e.reps) ? Number(e.peso) * (1 + Number(e.reps) / 30) : 0);
    if (newBest === null || value > newBest) newBest = value;
  });
  const isPR = newBest !== null && newBest > 0 && (!priorBest || newBest > priorBest.value);

  showToast(isPR
    ? '🏆 ¡Marca personal en ' + ejercicio + '!'
    : 'Guardado ✓ (' + rows.length + (rows.length > 1 ? ' series)' : ' serie)'));

  lastAcceptedByLogId[logId] = { ids: entries.map(e => e.id), count: entries.length };
  renderPendingWrap(logId);
  renderTabs();
  updateCardHighlights();

  // 3) Se envía al servidor en segundo plano
  flushOutbox();
}

async function undoLastAccept(logId){
  const info = lastAcceptedByLogId[logId];
  if (!info) return;
  delete lastAcceptedByLogId[logId];
  renderPendingWrap(logId);

  // Si justo se están enviando, se espera a que termine para no dejar una serie "fantasma" en el servidor
  await waitForFlushIdle(15000);

  const idSet = new Set(info.ids.map(String));
  const outbox = getOutbox();
  const queued = new Set(outbox.filter(e => idSet.has(String(e.id))).map(e => String(e.id)));

  // Las que aún están en la cola no han llegado al servidor: basta con quitarlas de aquí
  saveOutbox(outbox.filter(e => !queued.has(String(e.id))));
  window._progressCache = (window._progressCache || []).filter(r => !queued.has(String(r['ID'])));

  // Las que ya se sincronizaron sí hay que borrarlas en el servidor
  for (const id of info.ids) {
    if (queued.has(String(id))) continue;
    const data = await postToSheetChecked({ action: 'delete', id });
    if (data && data.ok) {
      window._progressCache = window._progressCache.filter(r => String(r['ID']) !== String(id));
    }
  }
  showToast('Deshecho ✓');
  renderHeatmap();
  populateExerciseSelect();
  renderTabs();
  updateCardHighlights();
  renderPendingWrap(logId);
}

function renderPendingWrap(logId){
  const wrap = document.getElementById('pendingWrap-' + logId);
  if (!wrap) return;
  const rows = getPendingRows()[logId] || [];
  const timed = isTimedExercise(wrap.dataset.ejercicio);
  if (rows.length === 0) {
    const undo = lastAcceptedByLogId[logId];
    wrap.innerHTML = undo
      ? `<button class="undo-btn" onclick="undoLastAccept('${logId}')">↩️ Deshacer último guardado (${undo.count} ${undo.count > 1 ? 'series' : 'serie'})</button>`
      : '';
    return;
  }
  const saving = savingPending.has(logId);
  wrap.innerHTML = `
    <div class="pending-list">
      ${rows.map((r, i) => {
        const badges = [
          r.calentamiento ? '🔥 calentamiento' : '',
          r.variante ? '🔀 ' + r.variante : '',
          r.nota ? '📝 ' + r.nota : '',
        ].filter(Boolean).join(' · ');
        return `
        <div class="pending-row">
          <div>
            <span>Serie ${i + 1}: ${timed ? r.reps + ' seg' : r.peso + ' kg × ' + r.reps + ' reps'}</span>
            ${badges ? `<div class="pending-row-badges">${badges}</div>` : ''}
          </div>
          <button class="pending-del" onclick="removePendingRow('${logId}', ${i})" ${saving ? 'disabled' : ''}>✕</button>
        </div>
      `;
      }).join('')}
    </div>
    <button class="accept-btn" onclick="acceptPending('${logId}')" ${saving ? 'disabled' : ''}>${saving ? '⏳ Guardando…' : '✅ Aceptar (' + rows.length + (rows.length > 1 ? ' series)' : ' serie)')}</button>
  `;
}
