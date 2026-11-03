// Accesibilidad básica: etiquetas, roles, estados, teclado, foco y "reducir movimiento" en las animaciones de "Siente".
//   npm test
// (El zoom está bloqueado a propósito: ver README y tests/style.test.js.)
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const { JSDOM } = require('jsdom');
const { boot } = require('./page-helper');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---------- 1) HTML estático ----------
  const doc = new JSDOM(html).window.document;
  const noType = [...doc.querySelectorAll('button')].filter(b => !b.hasAttribute('type')).map(b => b.textContent.trim());
  assert.deepStrictEqual(noType, [], 'todos los <button> del HTML llevan type: ' + noType.join(' | '));
  doc.querySelectorAll('[role=dialog]').forEach(d => {
    assert.strictEqual(d.getAttribute('aria-modal'), 'true', d.id + ': falta aria-modal');
    const l = d.getAttribute('aria-labelledby');
    assert(l && doc.getElementById(l), d.id + ': aria-labelledby debe apuntar a un título existente');
  });
  assert(doc.querySelectorAll('[role=dialog]').length >= 5, 'resumen, comparativa y 3 diálogos');
  doc.querySelectorAll('.summary-close').forEach(b => assert(b.getAttribute('aria-label'), 'el botón ✕ debe tener aria-label'));
  doc.querySelectorAll('canvas').forEach(c => assert(c.getAttribute('aria-label') && c.getAttribute('role') === 'img', 'cada gráfica necesita role=img y aria-label: ' + c.id));
  doc.querySelectorAll('svg[id^=muscleSvg]').forEach(c => assert(c.getAttribute('aria-label'), 'los mapas musculares necesitan aria-label'));
  assert.strictEqual(doc.getElementById('toast').getAttribute('role'), 'status', 'el aviso de guardado debe anunciarse');
  ['profileIndicator', 'syncBadge'].forEach(id => { const e = doc.getElementById(id); assert(e.getAttribute('role') === 'button' && e.getAttribute('tabindex') === '0', id + ' debe ser operable con teclado'); });

  // ---------- 2) Página en marcha ----------
  const r = await boot(path.join(root, 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const d = r.w.document;

  // pestañas principales con estado
  assert.strictEqual(d.getElementById('viewBtnRutina').getAttribute('aria-pressed'), 'true');
  r.w.setView('metricas'); await sleep(300);
  assert.strictEqual(d.getElementById('viewBtnMetricas').getAttribute('aria-pressed'), 'true');
  assert.strictEqual(d.getElementById('viewBtnRutina').getAttribute('aria-pressed'), 'false');
  r.w.setMuscleView('back');
  assert.strictEqual(d.getElementById('muscleViewBtnBack').getAttribute('aria-pressed'), 'true');
  r.w.setView('rutina');

  // el estado de cada ejercicio no depende solo del color
  r.w.openDay(0);
  const seg = [...d.querySelectorAll('#exStrip button')].map(b => b.getAttribute('aria-label'));
  assert(seg.length > 0 && seg.every(l => /, (completado|empezado|sin empezar)$/.test(l)), 'cada segmento dice su estado: ' + seg[0]);
  const tiles = [...d.querySelectorAll('#dpGrid .dp-tile')].map(b => b.getAttribute('aria-label'));
  assert(tiles.every(l => /(Completo|Empezado|Pendiente)/.test(l)), 'cada ficha de día dice su estado');
  assert(d.querySelector('.card .pending-wrap'), 'hay tarjetas');

  // botones solo-icono con nombre
  const logId = d.querySelector('#main > .card .log-form').id;
  d.querySelector('#main > .card .inp-peso').value = '60'; d.querySelector('#main > .card .inp-reps').value = '8';
  r.w.addPendingRow(logId);
  const del = d.querySelector('.pending-del');
  assert(/Quitar serie 1/.test(del.getAttribute('aria-label')), 'el ✕ de una serie pendiente tiene nombre');
  r.w.removePendingRow(logId, 0);

  // foco y Escape en pantallas superpuestas
  const opener = d.querySelector('.week-summary-btn'); opener.focus();
  r.w.showWeekSummary();
  assert(d.activeElement.classList.contains('summary-close'), 'al abrir el resumen el foco pasa a su botón de cerrar');
  d.dispatchEvent(new r.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.strictEqual(d.getElementById('summaryScreen').style.display, 'none', 'Escape cierra el resumen');
  assert.strictEqual(d.activeElement, opener, 'al cerrar, el foco vuelve a donde estaba');
  r.w.showDayComparison(0);
  assert(d.getElementById('dayCompareScreen').style.getPropertyValue('--c'), 'la comparativa lleva el color de su día');
  assert(!/1RM est/.test(d.getElementById('dayCompareBody').innerHTML), 'la comparativa ya no habla del 1RM de Epley');
  d.dispatchEvent(new r.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.strictEqual(d.getElementById('dayCompareScreen').style.display, 'none', 'Escape cierra la comparativa');

  // Resumen: título con la métrica unificada, números en español
  r.w.showWeekSummary();
  assert(/Mejoras de la semana \(fuerza estimada\)/.test(d.getElementById('summaryBody').innerHTML), 'el resumen mide mejoras en fuerza estimada');
  assert(!/peso máximo/.test(d.getElementById('summaryBody').innerHTML), 'ya no se mide el peso máximo');
  r.w.hideWeekSummary();

  // Editar: cada día con su color
  r.w.setView('editar'); await sleep(200);
  const dayCards = [...d.querySelectorAll('#editViewBody .edit-day')].filter(e => e.style.getPropertyValue('--c'));
  assert(dayCards.length >= 5, 'cada día de Editar lleva el color de su día');
  r.w.setView('rutina');
  r.w.close();

  // ---------- 3) "Siente": con reducir movimiento la animación queda en una pose fija ----------
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const ctx = dom.getInternalVMContext();
  const run = (f, extra) => new vm.Script((extra || '') + fs.readFileSync(path.join(root, 'js', f), 'utf8') + '\n;', { filename: f }).runInContext(ctx);
  const get = e => new vm.Script(e).runInContext(ctx);
  run('utils.js'); run('icons.js'); run('routine-default.js'); run('body-svg.js'); run('feel-data.js');
  for (const reduce of [true, false]) {
    const dom2 = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
    const c2 = dom2.getInternalVMContext(); let calls = 0;
    dom2.window.requestAnimationFrame = () => { calls++; return 0; };
    new vm.Script('function motionOK(){ return ' + (!reduce) + '; }').runInContext(c2);
    new vm.Script(fs.readFileSync(path.join(root, 'js', 'feel-anim.js'), 'utf8') + '\n;', { filename: 'feel-anim.js' }).runInContext(c2);
    const w2 = dom2.window, B = w2.document.body;
    const svg = w2.document.createElementNS('http://www.w3.org/2000/svg', 'svg'), ph = w2.document.createElement('div'), tp = w2.document.createElement('div');
    B.appendChild(svg); B.appendChild(ph); B.appendChild(tp);
    const key = new vm.Script('FeelAnim.keys()[0]').runInContext(c2);
    new vm.Script('FeelAnim.start(' + JSON.stringify(key) + ', document.querySelector("svg"), document.querySelectorAll("div")[0], document.querySelectorAll("div")[1])').runInContext(c2);
    assert(svg.children.length > 0 && /<b>/.test(ph.innerHTML), 'la animación se pinta (al menos una pose)');
    if (reduce) assert.strictEqual(calls, 0, 'con reducir movimiento no se programa ningún fotograma');
    else assert(calls >= 1, 'con movimiento normal sí se anima');
  }

  console.log('OK a11y: etiquetas, roles, estados, teclado, foco y reducir movimiento en "Siente"');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
