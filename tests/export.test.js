// Exportar datos (js/export.js): rango de fechas, formatos md / csv / json, y la tarjeta de Métricas.
//   npm test
// Lo importante: lo que sale en el archivo es lo que hay en la base (solo el perfil con sesión, solo el rango, con sus
// extremos), nada se deforma al escribirlo (comas, comillas y saltos de línea en notas y nombres), y el archivo
// se puede volver a leer por una máquina (CSV y JSON válidos, punto decimal, fechas ISO).
const path = require('path'), assert = require('assert');
const { boot } = require('./page-helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = x => JSON.parse(JSON.stringify(x));

// Lector de CSV (RFC 4180) independiente del código de la app, para comprobar el viaje de ida y vuelta
function parseCsv(t) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

(async () => {
  const r = await boot(path.join(__dirname, '..', 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const w = r.w, d = w.document;
  const D1 = 'Día 1 · Pectoral, deltoides y tríceps', D2 = 'Día 2 · Dorsales, bíceps y core';
  const R = (f, dia, grupo, ej, peso, reps, series, extra) => Object.assign({ Perfil: 'David', Fecha: f, 'Día': dia, Grupo: grupo, Ejercicio: ej, 'Peso (kg)': peso, Reps: reps, Series: series, Nota: '', Variante: '', Calentamiento: false, ID: 'x' }, extra || {});
  const NOTE = 'dolor, "leve" en hombro\nse pasó';
  const rows = [
    R('2026-10-05', D1, 'Pectoral', 'Press banca plano', 60, 8, 1),
    R('2026-10-05', D1, 'Pectoral', 'Press banca plano', 20, 12, 1, { Calentamiento: true, Nota: 'calentamiento ligero' }),
    R('2026-10-05', D1, 'Pectoral', 'Press banca plano', 62.5, 6, 1, { Nota: NOTE }),
    R('2026-10-03', D2, 'Dorsales', 'Jalón, agarre neutro', 55, 10, 2),
    R('2026-10-01', D1, 'Pectoral', 'Press banca plano', 57.5, 8, 1),                    // extremo inferior del rango
    R('2026-10-10', D2, 'Core', 'Plancha', 0, 45, 1),                                     // extremo superior
    R('2026-10-08', D1, 'Pectoral', 'Press banca plano', 65, 7, 1, { Variante: 'Chest Press (Technogym)', Nota: '=1+1' }),
    R('2026-10-08', D1, 'Pectoral', 'Press banca plano', 66, 6, 1, { Nota: '-2+3' }),
    R('2026-10-09', D2, 'Dorsales', 'Jalón, agarre neutro', 57.5, 10, 1, { Nota: '@SUMA(A1)' }),
    R('2026-09-30', D1, 'Pectoral', 'Press banca plano', 50, 8, 1),                       // fuera (antes)
    R('2026-10-11', D1, 'Pectoral', 'Press banca plano', 70, 5, 1),                       // fuera (después)
    R('2026-10-06', D1, 'Pectoral', 'Press banca plano', 100, 10, 1, { Perfil: 'Pedro' }),  // otro perfil
  ];
  w._progressCache = rows;
  w._weightHistory = [{ fecha: '2026-09-29', peso: 80 }, { fecha: '2026-10-09', peso: 79 }, { fecha: '2026-10-02', peso: 79.4 }, { fecha: '2026-10-20', peso: 78 }];
  w._height = 178; w._lastSyncAt = new Date(2026, 9, 10, 18, 30).getTime();
  const O = { from: '2026-10-01', to: '2026-10-10', warmups: true, body: true };
  const collect = o => J(w.exportCollect(Object.assign({}, O, o)));

  // ---------- 1) Qué entra en el rango ----------
  let c = collect();
  assert.strictEqual(c.meta.registros, 9, '9 registros: dentro del rango, solo el perfil con sesión, extremos incluidos');
  assert.deepStrictEqual(c.series.map(s => s.fecha), ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-05', '2026-10-05', '2026-10-08', '2026-10-08', '2026-10-09', '2026-10-10'], 'ordenado por fecha');
  assert(!c.series.some(s => s.fecha === '2026-09-30' || s.fecha === '2026-10-11'), 'los días justo fuera no entran');
  assert(!c.series.some(s => s.peso_kg === 100), 'los datos de otro perfil no salen nunca');
  assert.deepStrictEqual(c.series.filter(s => s.fecha === '2026-10-05').map(s => s.peso_kg), [60, 20, 62.5], 'dentro de un día se conserva el orden original');
  assert.strictEqual(c.series[0].dia, 'Día 1', 'día corto (el nombre completo está en la rutina)');
  assert.strictEqual(c.series[3].calentamiento, 1); assert.strictEqual(c.series[2].calentamiento, 0);
  assert.strictEqual(c.meta.series_de_trabajo, 9, 'series de trabajo: 8 filas de trabajo, y el jalón de 2 series cuenta 2');
  assert.strictEqual(c.meta.sesiones, 6, 'sesiones = días con series de trabajo');
  assert.strictEqual(collect({ warmups: false }).meta.registros, 8, 'sin calentamientos');
  assert(!collect({ warmups: false }).series.some(s => s.calentamiento === 1));
  assert.deepStrictEqual(c.peso_corporal, [{ fecha: '2026-10-02', peso_kg: 79.4 }, { fecha: '2026-10-09', peso_kg: 79 }], 'peso corporal del rango, ordenado');
  assert.deepStrictEqual(collect({ body: false }).peso_corporal, []);
  assert.strictEqual(collect({ from: '2026-12-01', to: '2026-12-31' }).meta.registros, 0, 'rango sin datos');
  assert.strictEqual(collect({ from: '2026-10-05', to: '2026-10-05' }).meta.registros, 3, 'un solo día');
  // semana y volumen (solo trabajo): semana del lunes 2026-09-28 (1, 3 oct) y del 5 oct (5, 8, 9, 10 oct)
  const sem = c.semanal; assert.deepStrictEqual(sem.map(x => x.semana_desde), ['2026-09-28', '2026-10-05']);
  assert.strictEqual(sem[0].dias_entrenados, 2); assert.strictEqual(sem[0].series, 3);
  assert.strictEqual(sem[0].volumen_kg, Math.round(57.5 * 8 + 55 * 10 * 2));
  assert.strictEqual(sem[1].dias_entrenados, 4); assert.strictEqual(sem[1].ejercicios_distintos, 3);
  assert.strictEqual(c.meta.volumen_kg, sem[0].volumen_kg + sem[1].volumen_kg, 'el volumen total suma las semanas');
  // meta
  assert.strictEqual(c.meta.perfil, 'David'); assert.strictEqual(c.meta.altura_cm, 178);
  assert(/sincronizada a las 18:30/.test(c.meta.fuente), 'dice de cuándo son los datos: ' + c.meta.fuente);
  w._lastSyncAt = 0; assert(/copia local/.test(collect().meta.fuente), 'sin sincronización reciente lo dice'); w._lastSyncAt = new Date(2026, 9, 10, 18, 30).getTime();
  assert(c.rutina.length > 20 && c.rutina[0].series_reps && 'maquina_habitual' in c.rutina[0] && Array.isArray(c.rutina[0].alternativas), 'la rutina actual va en el archivo');

  // ---------- 2) CSV ----------
  const csvRaw = w.exportSerialize(w.exportCollect(O), 'csv', false), csvFile = w.exportSerialize(w.exportCollect(O), 'csv', true);
  assert.strictEqual(csvFile[0], '\uFEFF', 'el archivo CSV lleva BOM (Excel respeta los acentos)'); assert.strictEqual(csvFile.slice(1), csvRaw); assert(csvRaw[0] !== '\uFEFF', 'copiar/compartir texto no lleva BOM');
  const rowsCsv = parseCsv(csvRaw);
  assert.deepStrictEqual(rowsCsv[0], ['fecha', 'dia', 'grupo', 'ejercicio', 'peso_kg', 'reps', 'series', 'variante', 'calentamiento', 'nota']);
  assert.strictEqual(rowsCsv.length, 10);
  const noteRow = rowsCsv.find(x => x[4] === '62.5'); assert.strictEqual(noteRow[9], NOTE, 'comas, comillas y saltos de línea sobreviven intactos');
  assert(rowsCsv.some(x => x[3] === 'Jalón, agarre neutro'), 'una coma en el nombre del ejercicio no rompe columnas');
  assert(rowsCsv.every(x => x.length === 10), 'todas las filas tienen 10 columnas');
  assert(/,62\.5,/.test(csvRaw) && !/62,5/.test(csvRaw), 'punto decimal, no coma');
  assert(rowsCsv.find(x => x[4] === '65')[9] === "'=1+1" && rowsCsv.find(x => x[4] === '66')[9] === "'-2+3" && rowsCsv.find(x => x[4] === '57.5' && x[3].startsWith('Jal'))[9] === "'@SUMA(A1)", 'en CSV, las notas que empiezan por = + - @ se protegen contra fórmulas de hojas de cálculo');
  assert.strictEqual(rowsCsv.find(x => x[4] === '65')[7], 'Chest Press (Technogym)', 'la variante se exporta');

  // ---------- 3) JSON ----------
  const js = w.exportSerialize(w.exportCollect(O), 'json', true);
  const jo = JSON.parse(js);
  assert.deepStrictEqual(Object.keys(jo), ['meta', 'leyenda', 'rutina', 'resumen_semanal', 'series', 'peso_corporal']);
  assert.strictEqual(jo.series.length, 9); assert.strictEqual(jo.series.find(s => s.peso_kg === 62.5).nota, NOTE, 'JSON conserva la nota tal cual (sin protección de fórmulas)');
  assert.strictEqual(jo.series.find(s => s.peso_kg === 65).nota, '=1+1'); assert.strictEqual(jo.peso_corporal.length, 2); assert(jo.leyenda.columnas.reps && jo.leyenda.notas.length >= 5);
  assert.strictEqual(js.split('\n').filter(l => /^\s{4}\{"fecha".*"ejercicio"/.test(l)).length, 9, 'una serie por línea (poco texto para el mismo dato)');
  assert.deepStrictEqual(JSON.parse(w.exportSerialize(w.exportCollect({ ...O, from: '2026-12-01', to: '2026-12-31', body: false }), 'json', true)).series, [], 'un JSON sin datos sigue siendo válido');

  // ---------- 4) Markdown para Claude: contexto + datos, y vuelta atrás ----------
  const md = w.exportSerialize(w.exportCollect(O), 'md', true);
  const order = ['# IronLog · exportación de datos', '## Cómo leer estos datos', '## Rutina actual', '## Resumen semanal', '## Series', '## Peso corporal'].map(h => md.indexOf(h));
  assert(order.every(i => i >= 0) && order.slice(1).every((x, i) => x > order[i]), 'secciones en orden');
  assert(/\*\*Perfil:\*\* David/.test(md) && /2026-10-01 a 2026-10-10 \(ambos incluidos\)/.test(md) && /9 registros \(\d+ series de trabajo\) en 6 sesiones/.test(md) && /Altura:\*\* 178 cm/.test(md));
  assert(/calentamiento = 1/.test(md) && /SEGUNDOS/.test(md) && /doble progresión/.test(md) && /reps\^0,10/.test(md), 'explica cómo interpretar los datos');
  assert(/\| Día \| Nombre del día \| Grupo \| Ejercicio \| Series · reps \|/.test(md), 'tabla de la rutina');
  const blocks = [...md.matchAll(/```csv\n([\s\S]*?)\n```/g)].map(m => m[1]);
  assert.strictEqual(blocks.length, 2, 'dos bloques CSV: series y peso corporal');
  const back = parseCsv(blocks[0]); assert.strictEqual(back.length, 10); assert.strictEqual(back.find(x => x[4] === '62.5')[9], NOTE, 'viaje de ida y vuelta: la nota con coma, comillas y salto de línea sale igual');
  assert.strictEqual(back.find(x => x[4] === '65')[9], '=1+1', 'en el .md las notas no se alteran (no es para hojas de cálculo)');
  assert.deepStrictEqual(parseCsv(blocks[1]), [['fecha', 'peso_kg'], ['2026-10-02', '79.4'], ['2026-10-09', '79']]);
  assert(!/NaN|undefined|\[object/.test(md), 'sin valores inválidos');
  const mdNoBody = w.exportSerialize(w.exportCollect({ ...O, body: false }), 'md', true); assert(!/## Peso corporal/.test(mdNoBody) && /sin peso corporal/.test(mdNoBody));
  const mdEmpty = w.exportSerialize(w.exportCollect({ ...O, from: '2026-12-01', to: '2026-12-31' }), 'md', true); assert(/_Sin series de trabajo en el rango\._/.test(mdEmpty) && /_Sin registros de peso corporal/.test(mdEmpty), 'rango vacío: el .md sigue siendo válido y lo dice');
  assert.strictEqual(w.exportMdCell('Press | con barra\nlínea 2'), 'Press \\| con barra línea 2', 'una barra vertical o un salto de línea no rompen las tablas del .md');

  // ---------- 5) Nombre del archivo ----------
  assert.strictEqual(w.exportFileName(w.exportCollect(O), 'md'), 'ironlog_David_2026-10-01_a_2026-10-10.md');
  assert.strictEqual(w.exportFileName({ meta: { perfil: 'José Ñandú/../x', desde: '2026-01-01', hasta: '2026-02-01' } }, 'csv'), 'ironlog_Jose_Nandu_.._x_2026-01-01_a_2026-02-01.csv', 'nombre de archivo seguro');
  assert(!/[\/\\:*?"<>|]/.test(w.exportFileName({ meta: { perfil: 'a/b\\c:d', desde: '2026-01-01', hasta: '2026-01-02' } }, 'json')));

  // ---------- 6) Tarjeta de Métricas ----------
  assert(d.getElementById('exportCard') && d.getElementById('metricasView').contains(d.getElementById('exportCard')), 'la tarjeta está en Métricas');
  ['expFrom', 'expTo', 'expFormat', 'expWarm', 'expBody'].forEach(id => assert(d.querySelector('label[for="' + id + '"]') || d.getElementById(id).closest('label'), id + ' tiene etiqueta'));
  [...d.querySelectorAll('#exportCard button')].forEach(b => assert.strictEqual(b.getAttribute('type'), 'button'));
  assert(d.getElementById('expPreview').getAttribute('aria-live') === 'polite' && d.getElementById('expError').getAttribute('role') === 'alert');
  w.exportInit();
  const today = w.localDateStr(); const t30 = new Date(); t30.setDate(t30.getDate() - 29);
  assert.strictEqual(d.getElementById('expTo').value, today, 'por defecto hasta hoy'); assert.strictEqual(d.getElementById('expFrom').value, w.localDateStr(t30), 'y 30 días atrás');
  assert.strictEqual(d.getElementById('expShare').hidden, true, 'sin menú de compartir del sistema, el botón no aparece');
  // atajos
  w.exportPreset('90'); const t90 = new Date(); t90.setDate(t90.getDate() - 89); assert.strictEqual(d.getElementById('expFrom').value, w.localDateStr(t90));
  w.exportPreset('year'); assert.strictEqual(d.getElementById('expFrom').value, new Date().getFullYear() + '-01-01');
  w.exportPreset('all'); assert.strictEqual(d.getElementById('expFrom').value, '2026-09-30', '"Todo" empieza en tu primer registro (y no cuenta los de otro perfil)'); assert.strictEqual(d.getElementById('expTo').value, today);
  // vista previa y validación
  const set = (f, t) => { d.getElementById('expFrom').value = f; d.getElementById('expTo').value = t; w.exportRefresh(); };
  set('2026-10-01', '2026-10-10');
  assert(/9 registros · \d+ series de trabajo · 6 sesiones · ≈ \d+ KB/.test(d.getElementById('expPreview').textContent), 'vista previa: ' + d.getElementById('expPreview').textContent);
  assert(!d.getElementById('expDownload').disabled && !d.getElementById('expCopy').disabled && d.getElementById('expError').textContent === '');
  d.getElementById('expWarm').checked = false; w.exportRefresh(); assert(/^8 registros/.test(d.getElementById('expPreview').textContent), 'la vista previa sigue a las opciones'); d.getElementById('expWarm').checked = true;
  set('2026-10-10', '2026-10-01'); assert(/no puede ser posterior/.test(d.getElementById('expError').textContent)); assert(d.getElementById('expDownload').disabled && d.getElementById('expCopy').disabled && d.getElementById('expShare').disabled, 'rango al revés: todo desactivado');
  set('', '2026-10-01'); assert(/Elige las dos fechas/.test(d.getElementById('expError').textContent) && d.getElementById('expDownload').disabled);
  set('2026-12-01', '2026-12-31'); assert(/No hay registros en ese rango/.test(d.getElementById('expError').textContent) && d.getElementById('expDownload').disabled, 'sin registros: nada que exportar');
  set('2026-10-01', '2026-10-10');
  d.getElementById('expFormat').value = 'csv'; w.exportRefresh(); assert(/^9 registros/.test(d.getElementById('expPreview').textContent));
  d.getElementById('expFormat').value = 'md'; w.exportRefresh();

  // ---------- 7) Descargar, copiar, compartir ----------
  let blobSeen = null, clicks = [], toasts = [];
  w.URL.createObjectURL = b => { blobSeen = b; return 'blob:fake'; }; w.URL.revokeObjectURL = () => {};
  const clickProto = w.HTMLAnchorElement.prototype.click; w.HTMLAnchorElement.prototype.click = function () { clicks.push({ download: this.download, href: this.href }); };
  const realToast = w.showToast; w.showToast = m => toasts.push(m);
  d.getElementById('expFormat').value = 'md'; w.exportDownload();
  assert.strictEqual(clicks.length, 1); assert.strictEqual(clicks[0].download, 'ironlog_David_2026-10-01_a_2026-10-10.md'); assert.strictEqual(clicks[0].href, 'blob:fake');
  assert(blobSeen && blobSeen.size > 500 && /text\/markdown/.test(blobSeen.type), 'el archivo se crea con su tipo'); assert(/ironlog_David/.test(toasts[0]) && /9 registros/.test(toasts[0]));
  d.getElementById('expFormat').value = 'csv'; w.exportDownload(); assert.strictEqual(clicks[1].download, 'ironlog_David_2026-10-01_a_2026-10-10.csv'); assert(/text\/csv/.test(blobSeen.type));
  d.getElementById('expFormat').value = 'json'; w.exportDownload(); assert(/\.json$/.test(clicks[2].download) && /application\/json/.test(blobSeen.type));
  d.getElementById('expFrom').value = '2026-12-01'; d.getElementById('expTo').value = '2026-12-31'; const nClicks = clicks.length; w.exportDownload(); assert.strictEqual(clicks.length, nClicks, 'sin datos no se descarga nada');
  set('2026-10-01', '2026-10-10'); d.getElementById('expFormat').value = 'md'; w.exportRefresh();
  // copiar
  let copied = null; Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async t => { copied = t; } } });
  await w.exportCopy(); assert(copied && copied.indexOf('# IronLog · exportación de datos') === 0 && /Copiado/.test(toasts[toasts.length - 1]), 'copia el contenido al portapapeles');
  d.getElementById('expFormat').value = 'csv'; w.exportRefresh(); await w.exportCopy(); assert(copied[0] !== '\uFEFF' && copied.indexOf('fecha,dia,grupo') === 0, 'el CSV copiado no lleva BOM');
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denegado'); } } });
  await w.exportCopy(); assert(/No se pudo copiar/.test(toasts[toasts.length - 1]), 'si el portapapeles falla, avisa');
  // compartir
  let shared = null;
  Object.defineProperty(w.navigator, 'canShare', { configurable: true, value: o => !!(o && o.files && o.files.length) });
  Object.defineProperty(w.navigator, 'share', { configurable: true, value: async o => { shared = o; } });
  w.exportInit(); assert.strictEqual(d.getElementById('expShare').hidden, false, 'con menú de compartir, el botón aparece');
  d.getElementById('expFormat').value = 'md'; w.exportRefresh(); await w.exportShare();
  assert(shared && shared.files.length === 1 && shared.files[0].name === 'ironlog_David_2026-10-01_a_2026-10-10.md' && /markdown/.test(shared.files[0].type), 'se comparte el archivo con su nombre y tipo');
  Object.defineProperty(w.navigator, 'share', { configurable: true, value: async () => { const e = new Error('cerrado'); e.name = 'AbortError'; throw e; } });
  const nT = toasts.length; await w.exportShare(); assert.strictEqual(toasts.length, nT, 'cerrar el menú de compartir no es un error');
  Object.defineProperty(w.navigator, 'share', { configurable: true, value: async () => { throw new Error('fallo'); } }); await w.exportShare(); assert(/No se pudo compartir/.test(toasts[toasts.length - 1]));
  w.HTMLAnchorElement.prototype.click = clickProto; w.showToast = realToast;

  // ---------- 8) Datos frescos de la base ----------
  const fresh = [R('2026-10-02', D1, 'Pectoral', 'Press banca plano', 61, 8, 1)];
  let postCalls = [];
  w.fetchSheetData = async () => fresh; w.postToSheet = async a => { postCalls.push(a.action); return { json: async () => [{ fecha: '2026-10-02', peso: 77 }] }; };
  w._lastSyncAt = 0; const f1 = J(await w.exportFetchFresh());
  assert.strictEqual(f1.fresh, true); assert(w._lastSyncAt > 0, 'queda anotada la hora de la sincronización'); assert.deepStrictEqual(postCalls, ['listWeights']);
  assert(w._progressCache.some(x => x['Peso (kg)'] === 61), 'la caché se actualiza con lo de la base'); assert.strictEqual(w._weightHistory[0].peso, 77);
  w.fetchSheetData = async () => { throw new Error('sin red'); }; const keep = w._progressCache, t0 = w._lastSyncAt;
  assert.strictEqual(J(await w.exportFetchFresh()).fresh, false); assert.strictEqual(w._progressCache, keep, 'sin red se queda con lo local'); assert.strictEqual(w._lastSyncAt, t0);
  let unauth = 0; w.handleUnauthorized = () => { unauth++; }; w.fetchSheetData = async () => ({ error: 'unauthorized' }); assert.strictEqual(J(await w.exportFetchFresh()).unauthorized, true); assert.strictEqual(unauth, 1, 'sesión caducada: se trata como siempre');
  w.fetchSheetData = async () => ({ ok: false }); assert.strictEqual(J(await w.exportFetchFresh()).fresh, false, 'una respuesta que no es una lista se ignora');
  // al abrir Métricas: solo se vuelve a descargar si los datos son viejos
  let freshCalls = 0; w.exportFetchFresh = async () => { freshCalls++; return { fresh: false }; };
  w._lastSyncAt = Date.now(); w.exportInit(); assert.strictEqual(freshCalls, 0, 'datos recientes: no se vuelve a descargar'); w._lastSyncAt = Date.now() - 5 * 60e3; w.exportInit(); assert.strictEqual(freshCalls, 1, 'datos viejos: se refrescan al abrir la tarjeta');
  assert(/exportInit\(\)/.test(w.eval('setView.toString()')), 'abrir Métricas inicializa la tarjeta');

  console.log('OK exportar: rango, formatos md/csv/json, ida y vuelta sin pérdidas, tarjeta de Métricas y datos frescos');
  r.w.close(); process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); if (e.stack) console.error(e.stack.split('\n').slice(1, 4).join('\n')); process.exit(1); });
