// =====================================================================
// Exportar datos  (export.js)
// Tarjeta al final de Métricas: se elige un rango de fechas y se exportan los registros de todos los ejercicios de
// ese rango (solo los del perfil con sesión) a un archivo pensado para pasárselo a Claude y hacerle preguntas sobre
// la rutina. Tres formatos:
//   md   (por defecto) contexto + datos: cómo leer las columnas, la rutina actual, resumen semanal y las series en CSV.
//                      Autoexplicativo: Claude lo entiende sin que haya que contarle nada.
//   csv  solo las series (para hojas de cálculo; con protección contra fórmulas y BOM para Excel).
//   json contexto + datos, una serie por línea.
// Números siempre con punto decimal y fechas AAAA-MM-DD (legible por máquinas), a diferencia de la pantalla.
// Los datos salen de la caché local, que se refresca desde la base de datos al abrir Métricas y cada 2 minutos.
// Depende de: utils, routine (DAYS), outbox (getOutbox), api (fetchSheetData, postToSheet), planning.
// =====================================================================

const EXPORT_COLS = ['fecha', 'dia', 'grupo', 'ejercicio', 'peso_kg', 'reps', 'series', 'variante', 'calentamiento', 'nota'];
const EXPORT_WEIGHT_COLS = ['fecha', 'peso_kg'];
const EXPORT_BIG_KB = 600;                 // a partir de aquí se avisa de que el archivo es grande
const EXPORT_STALE_MS = 60 * 1000;         // al abrir Métricas se vuelve a descargar de la base si hace más de esto

const EXPORT_FORMATS = {
  md:   { ext: 'md',   mime: 'text/markdown;charset=utf-8' },
  csv:  { ext: 'csv',  mime: 'text/csv;charset=utf-8' },
  json: { ext: 'json', mime: 'application/json;charset=utf-8' },
};

const EXPORT_LEYENDA = {
  columnas: {
    fecha: 'fecha del registro, AAAA-MM-DD',
    dia: 'día de la rutina (nombre completo y grupos en «rutina»)',
    grupo: 'grupo muscular del ejercicio dentro de ese día',
    ejercicio: 'nombre del ejercicio',
    peso_kg: 'carga en kg (punto decimal)',
    reps: 'repeticiones; en ejercicios por tiempo son SEGUNDOS',
    series: 'nº de series que representa la fila: peso_kg × reps repetido «series» veces (normalmente 1)',
    variante: 'máquina o variante usada; vacío = la habitual (la «maquina_habitual» de la rutina)',
    calentamiento: '1 = serie de calentamiento, 0 = serie de trabajo',
    nota: 'comentario libre del usuario',
  },
  notas: [
    'Las series de calentamiento (calentamiento = 1) no cuentan para el objetivo semanal, el volumen ni el progreso: ignóralas salvo que se pregunte por ellas.',
    'Objetivo de la rutina: 3 series de trabajo por ejercicio y semana, en el rango de repeticiones de «series_reps». Se usa doble progresión: al clavar el tope de repeticiones en todas las series se sube la carga.',
    'Un mismo ejercicio y fecha suelen tener varias filas (una por serie o grupo de series).',
    'La semana va de lunes a domingo.',
    'Una variante/máquina distinta puede mover más o menos peso que la habitual: sus cargas no son comparables directamente con las de la habitual.',
    'La app mide la progresión con la «fuerza estimada» de cada sesión = media de las series de trabajo con peso × reps^0,10 (no es el 1RM).',
    'La «rutina» es la actual: si cambió durante el rango, los registros antiguos conservan el día y el grupo con los que se guardaron.',
    'En las semanas con «descarga» = true se entrenó menos a propósito (2 series por ejercicio con la carga de siempre y un RIR más): un volumen más bajo ahí no es una caída de rendimiento.',
    'Los datos son solo del perfil indicado en «meta».',
  ],
};

function exportShortDay(name){ return String(name || '').split('·')[0].trim(); }
function exportDay(r){ return String(r['Fecha']).slice(0, 10); }
function exportNum(v){ const n = Number(v); return isFinite(n) ? n : 0; }

// ---------- Recogida de datos ----------
// o = { from, to, warmups, body }  (fechas AAAA-MM-DD, ambas incluidas)
function exportCollect(o){
  const inRange = f => f >= o.from && f <= o.to;
  const mine = myRows().filter(r => inRange(exportDay(r)) && (o.warmups || !isWarmupRow(r)));
  const rows = mine.map((r, i) => ({ r: r, i: i })).sort((a, b) => exportDay(a.r).localeCompare(exportDay(b.r)) || a.i - b.i).map(x => x.r);   // estable: dentro de un día se conserva el orden original

  const series = rows.map(r => ({
    fecha: exportDay(r), dia: exportShortDay(r['Día']), grupo: r['Grupo'] || '', ejercicio: r['Ejercicio'] || '',
    peso_kg: exportNum(r['Peso (kg)']), reps: exportNum(r['Reps']), series: exportNum(r['Series']) || 1,
    variante: r['Variante'] || '', calentamiento: isWarmupRow(r) ? 1 : 0, nota: r['Nota'] || '',
  }));
  const work = rows.filter(r => !isWarmupRow(r));
  const dates = {}; work.forEach(r => { dates[exportDay(r)] = true; });

  // Resumen por semana (solo series de trabajo)
  const weeks = {};
  work.forEach(r => {
    const wk = localDateStr(mondayOf(parseLocalDate(exportDay(r))));
    const w = weeks[wk] || (weeks[wk] = { semana_desde: wk, _d: {}, _e: {}, series: 0, volumen_kg: 0 });
    w._d[exportDay(r)] = true; w._e[r['Ejercicio']] = true;
    w.series += exportNum(r['Series']) || 0; w.volumen_kg += rowVolume(r);
  });
  const semanal = Object.keys(weeks).sort().map(k => { const w = weeks[k]; return { semana_desde: k, dias_entrenados: Object.keys(w._d).length, series: w.series, volumen_kg: Math.round(w.volumen_kg), ejercicios_distintos: Object.keys(w._e).length, descarga: typeof deloadWeekHas === 'function' && deloadWeekHas(parseLocalDate(k)) }; });

  const peso = o.body ? (window._weightHistory || []).filter(w => inRange(String(w.fecha).slice(0, 10)))
    .map(w => ({ fecha: String(w.fecha).slice(0, 10), peso_kg: exportNum(w.peso) })).sort((a, b) => a.fecha.localeCompare(b.fecha)) : [];

  const rutina = [];
  (typeof DAYS !== 'undefined' ? DAYS : []).forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => rutina.push({
    dia: exportShortDay(d.name), nombre_del_dia: d.name, grupo: g.label, ejercicio: ex.name, series_reps: ex.sets,
    tipo: (typeof isTimedExercise === 'function' && isTimedExercise(ex.name)) ? 'tiempo (segundos)' : 'peso y repeticiones',
    maquina_habitual: ex.primary || '', alternativas: ex.alts || [],
  }))));

  const pend = (typeof getOutbox === 'function') ? getOutbox().length : 0;
  const synced = window._lastSyncAt ? new Date(window._lastSyncAt) : null;
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const meta = {
    perfil: getProfile(), desde: o.from, hasta: o.to, generado: localDateStr(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
    fuente: synced ? 'base de datos de IronLog, sincronizada a las ' + pad(synced.getHours()) + ':' + pad(synced.getMinutes()) : 'copia local del dispositivo (sin sincronizar con la base de datos en esta sesión)',
    registros: series.length, series_de_trabajo: work.reduce((s, r) => s + (exportNum(r['Series']) || 0), 0),
    sesiones: Object.keys(dates).length, volumen_kg: Math.round(work.reduce((s, r) => s + rowVolume(r), 0)),
    incluye_calentamientos: !!o.warmups, incluye_peso_corporal: !!o.body,
  };
  if (pend) meta.pendientes_de_sincronizar_incluidos = pend;
  if (o.body && window._height) meta.altura_cm = window._height;
  return { meta: meta, leyenda: EXPORT_LEYENDA, rutina: rutina, semanal: semanal, series: series, peso_corporal: peso };
}

// ---------- Serializadores ----------
function exportCsvCell(v, guard){
  let s = String(v == null ? '' : v);
  // Protección contra inyección de fórmulas al abrir el CSV en una hoja de cálculo: un texto que empieza por = + - @ se marca como texto
  if (guard && typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsvRows(cols, rows, guard){
  return [cols.join(',')].concat(rows.map(r => cols.map(c => exportCsvCell(r[c], guard)).join(','))).join('\n');
}

function exportMdCell(v){ return String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, ' '); }
function exportMdTable(head, rows){
  return '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.map(exportMdCell).join(' | ') + ' |').join('\n');
}

function exportMarkdown(d){
  const m = d.meta;
  const L = ['# IronLog · exportación de datos', '',
    '- **Perfil:** ' + m.perfil,
    '- **Rango:** ' + m.desde + ' a ' + m.hasta + ' (ambos incluidos)',
    '- **Generado:** ' + m.generado,
    '- **Fuente:** ' + m.fuente,
    '- **Contenido:** ' + m.registros + ' registros (' + m.series_de_trabajo + ' series de trabajo) en ' + m.sesiones + ' sesiones · ' + (m.incluye_calentamientos ? 'con' : 'sin') + ' calentamientos · ' + (m.incluye_peso_corporal ? 'con' : 'sin') + ' peso corporal',
  ];
  if (m.pendientes_de_sincronizar_incluidos) L.push('- **Pendientes de sincronizar:** ' + m.pendientes_de_sincronizar_incluidos + ' registros del dispositivo todavía no están en la base de datos (ya incluidos aquí)');
  if (m.altura_cm) L.push('- **Altura:** ' + m.altura_cm + ' cm');
  L.push('', '## Cómo leer estos datos', '');
  d.leyenda.notas.forEach(n => L.push('- ' + n));
  L.push('', 'Columnas de «Series»:', '');
  Object.keys(d.leyenda.columnas).forEach(c => L.push('- `' + c + '`: ' + d.leyenda.columnas[c]));
  L.push('', '## Rutina actual', '',
    exportMdTable(['Día', 'Nombre del día', 'Grupo', 'Ejercicio', 'Series · reps', 'Tipo', 'Máquina habitual', 'Alternativas'],
      d.rutina.map(x => [x.dia, x.nombre_del_dia, x.grupo, x.ejercicio, x.series_reps, x.tipo, x.maquina_habitual, x.alternativas.join(' | ')])));
  L.push('', '## Resumen semanal (solo series de trabajo)', '');
  L.push(d.semanal.length ? exportMdTable(['Semana desde (lunes)', 'Días entrenados', 'Series', 'Volumen (kg)', 'Ejercicios distintos', 'Descarga'], d.semanal.map(w => [w.semana_desde, w.dias_entrenados, w.series, w.volumen_kg, w.ejercicios_distintos, w.descarga ? 'sí' : ''])) : '_Sin series de trabajo en el rango._');
  L.push('', '## Series', '', '```csv', exportCsvRows(EXPORT_COLS, d.series, false), '```');
  if (m.incluye_peso_corporal) L.push('', '## Peso corporal', '', d.peso_corporal.length ? '```csv\n' + exportCsvRows(EXPORT_WEIGHT_COLS, d.peso_corporal, false) + '\n```' : '_Sin registros de peso corporal en el rango._');
  return L.join('\n') + '\n';
}

function exportJson(d){
  const arr = (k, a) => '  "' + k + '": [' + (a.length ? '\n' + a.map(x => '    ' + JSON.stringify(x)).join(',\n') + '\n  ' : '') + ']';
  return '{\n  "meta": ' + JSON.stringify(d.meta) + ',\n  "leyenda": ' + JSON.stringify(d.leyenda) + ',\n' +
    [arr('rutina', d.rutina), arr('resumen_semanal', d.semanal), arr('series', d.series), arr('peso_corporal', d.peso_corporal)].join(',\n') + '\n}\n';
}

// forFile = true añade el BOM al CSV (para que Excel respete los acentos); al copiar o compartir texto no hace falta
function exportSerialize(d, fmt, forFile){
  if (fmt === 'csv') return (forFile ? '\uFEFF' : '') + exportCsvRows(EXPORT_COLS, d.series, true) + '\n';
  if (fmt === 'json') return exportJson(d);
  return exportMarkdown(d);
}

function exportFileName(d, fmt){
  const clean = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'datos';
  return 'ironlog_' + clean(d.meta.perfil) + '_' + d.meta.desde + '_a_' + d.meta.hasta + '.' + EXPORT_FORMATS[fmt].ext;
}

// ---------- Descarga fresca de la base de datos ----------
// Vuelve a leer los registros (y el peso corporal) de la base, como hace "Actualizar datos". Si no hay red se queda con la caché local.
async function exportFetchFresh(){
  if (!getSessionToken()) return { fresh: false };
  try {
    const data = await fetchSheetData();
    if (data && data.error === 'unauthorized') { handleUnauthorized(); return { fresh: false, unauthorized: true }; }
    if (!Array.isArray(data)) return { fresh: false };
    window._progressCache = data;
    try { localStorage.setItem('progressCache', JSON.stringify(data)); } catch (e) {}
    applyOutboxToCache();                                  // los registros aún sin enviar también cuentan
    try { const r = await postToSheet({ action: 'listWeights' }); const j = await r.json(); if (Array.isArray(j)) window._weightHistory = j; } catch (e) {}
    window._lastSyncAt = Date.now();
    return { fresh: true };
  } catch (e) { return { fresh: false }; }
}

// ---------- Interfaz ----------
const expEl = id => document.getElementById(id);

function exportRead(){
  const from = expEl('expFrom').value, to = expEl('expTo').value, ok = /^\d{4}-\d{2}-\d{2}$/;
  if (!ok.test(from) || !ok.test(to)) return { ok: false, error: 'Elige las dos fechas.' };
  if (from > to) return { ok: false, error: 'La fecha «desde» no puede ser posterior a «hasta».' };
  return { ok: true, from: from, to: to, warmups: expEl('expWarm').checked, body: expEl('expBody').checked, fmt: expEl('expFormat').value };
}

function exportPreset(id){
  const today = new Date(), to = localDateStr(today);
  let from;
  if (id === 'year') from = today.getFullYear() + '-01-01';
  else if (id === 'all') { const ds = myRows().map(exportDay).sort(); from = ds.length ? ds[0] : to; }
  else { const d = new Date(today); d.setDate(d.getDate() - (parseInt(id, 10) - 1)); from = localDateStr(d); }
  expEl('expFrom').value = from; expEl('expTo').value = to;
  exportRefresh();
}

// Texto de vista previa y botones habilitados según el rango
function exportRefresh(){
  const prev = expEl('expPreview'), err = expEl('expError');
  if (!prev) return null;
  const o = exportRead();
  const buttons = ['expDownload', 'expShare', 'expCopy'].map(expEl);
  const setEnabled = on => buttons.forEach(b => { b.disabled = !on; });
  if (!o.ok) { prev.textContent = ''; err.textContent = o.error; setEnabled(false); return null; }
  const d = exportCollect(o), text = exportSerialize(d, o.fmt, false), kb = Math.max(1, Math.round(text.length / 1024));
  if (!d.meta.registros) { prev.textContent = ''; err.textContent = 'No hay registros en ese rango.'; setEnabled(false); return null; }
  err.textContent = '';
  prev.textContent = d.meta.registros + ' registros · ' + d.meta.series_de_trabajo + ' series de trabajo · ' + d.meta.sesiones + ' sesiones · ≈ ' + kb + ' KB' +
    (kb > EXPORT_BIG_KB ? ' — archivo grande: para Claude suele ir mejor un rango de 1 a 3 meses' : '');
  setEnabled(true);
  return { o: o, d: d, text: text };
}

// Se llama al abrir Métricas: valores por defecto (últimos 30 días) y datos frescos de la base
function exportInit(){
  if (!expEl('exportCard')) return;
  if (!expEl('expFrom').value || !expEl('expTo').value) exportPreset('30');
  const share = expEl('expShare');
  share.hidden = !(typeof navigator !== 'undefined' && navigator.share && navigator.canShare);
  if (!window._lastSyncAt || Date.now() - window._lastSyncAt > EXPORT_STALE_MS) exportFetchFresh().then(r => { if (r.fresh) exportRefresh(); });
  exportRefresh();
}

function exportTriggerDownload(name, text, mime){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 1500);
}

function exportDownload(){
  const x = exportRefresh(); if (!x) return;
  const f = EXPORT_FORMATS[x.o.fmt], name = exportFileName(x.d, x.o.fmt);
  exportTriggerDownload(name, exportSerialize(x.d, x.o.fmt, true), f.mime);
  showToast('📥 ' + name + ' (' + x.d.meta.registros + ' registros)');
}

// El menú de compartir del móvil (Claude, Archivos, Drive…). Se usa la caché local sin esperas de red para no perder el gesto del usuario.
async function exportShare(){
  const x = exportRefresh(); if (!x) return;
  const f = EXPORT_FORMATS[x.o.fmt], name = exportFileName(x.d, x.o.fmt);
  try {
    const file = new File([exportSerialize(x.d, x.o.fmt, true)], name, { type: f.mime.split(';')[0] });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) { showToast('Tu navegador no puede compartir archivos: usa Descargar'); return; }
    await navigator.share({ files: [file], title: 'IronLog · ' + x.d.meta.desde + ' a ' + x.d.meta.hasta });
  } catch (e) {
    if (e && e.name === 'AbortError') return;               // el usuario cerró el menú de compartir
    showToast('No se pudo compartir: usa Descargar');
  }
}

// Copia el contenido al portapapeles para pegarlo directamente en un chat con Claude
async function exportCopy(){
  const x = exportRefresh(); if (!x) return;
  const text = exportSerialize(x.d, x.o.fmt, false);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
    else {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); document.body.removeChild(ta);
      if (!ok) throw new Error('copy');
    }
    showToast('📋 Copiado (' + Math.max(1, Math.round(text.length / 1024)) + ' KB): pégalo en Claude');
  } catch (e) { showToast('No se pudo copiar: usa Descargar'); }
}
