// Comprueba que cada ejercicio de la rutina por defecto tiene su ficha "dónde sentirlo",
// que cada ficha apunta a una animación que existe y que las animaciones se pintan sin valores NaN.
//   npm test
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const ctx = dom.getInternalVMContext();
const run = f => new vm.Script(fs.readFileSync(path.join(root, 'js', f), 'utf8') + '\n;', { filename: f }).runInContext(ctx);
run('utils.js'); run('icons.js'); run('routine-default.js'); run('body-svg.js'); run('feel-data.js'); run('feel-anim.js'); run('feel.js');
const w = dom.window;
const get = expr => new vm.Script(expr).runInContext(ctx);
// 1) todos los ejercicios por defecto resuelven ficha
const exs = get('DEFAULT_DAYS.flatMap(d => d.groups.flatMap(g => g.exercises))');
const names = new Set();
exs.forEach(ex => { const k = get('Feel').keyFor(ex); assert(k, 'sin ficha: ' + ex.name); names.add(ex.name); });
// 2) cada ficha apunta a una animación existente y tiene el contenido mínimo
const profiles = get('FEEL_PROFILES');
Object.keys(profiles).forEach(k => { const p = profiles[k];
  assert(get('FeelAnim').has(p.anim), k + ': animación inexistente ' + p.anim);
  ['mainTxt','focus','warn'].forEach(f => assert(p[f], k + ': falta ' + f));
  assert(p.cues.length >= 3, k + ': pocas indicaciones');
  assert(['front','back'].includes(p.view), k + ': vista inválida');
});
// 2b) las zonas finas existen en la silueta de su vista y la silueta se dibuja
Object.keys(profiles).forEach(k => { const p = profiles[k];
  const fine = get('FEEL_FINE')[k]; if (!fine) return;
  fine[0].concat(fine[1]).forEach(z => assert(get('BODY_FINE')[p.view].includes(z), k + ': zona ' + z + ' no existe en vista ' + p.view));
  assert(fine[0].length > 0, k + ': sin zona principal');
});
['front','back'].forEach(v => assert(get(`bodyMarkup('${v}', z => '#000')`).includes('data-z="gemelo"'), 'silueta ' + v));
// 3) cada animación se pinta en varios instantes sin NaN
w.FEEL_FREEZE = 0;
get('FeelAnim').keys().forEach(key => {
  [0, .4, 1.5, 2.5, 3.6].forEach(t => {
    w.FEEL_FREEZE = t;
    const svg = w.document.createElementNS('http://www.w3.org/2000/svg', 'svg'); w.document.body.appendChild(svg);
    const ph = w.document.createElement('div'), tp = w.document.createElement('div');
    get('FeelAnim').start(key, svg, ph, tp);
    const bad = svg.outerHTML.match(/NaN|undefined|Infinity/);
    assert(!bad, `${key} t=${t}: valor inválido (${bad})`);
    assert(ph.textContent.length > 3, key + ': sin texto de fase');
  });
});
console.log('OK feel: ' + names.size + ' ejercicios, ' + Object.keys(profiles).length + ' fichas, ' + get('FeelAnim').keys().length + ' animaciones');
