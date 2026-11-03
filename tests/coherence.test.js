// Coherencia entre pantallas: un mismo formato de números y una misma métrica de progreso en la hoja de
// cada ejercicio, el Resumen y Métricas (antes: peso máximo, 1RM de Epley y fuerza estimada a la vez).
//   npm test
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const ctx = dom.getInternalVMContext();
const run = f => new vm.Script(fs.readFileSync(path.join(root, 'js', f), 'utf8') + '\n;', { filename: f }).runInContext(ctx);
const get = expr => new vm.Script(expr).runInContext(ctx);
const S = (w, r) => w * Math.pow(r, 0.10);

run('utils.js');
get("function getProfile(){ return 'David'; } function isTimedExercise(n){ return n === 'Plancha'; } function getBackend(){ return 'supabase'; }");
run('progress-chart.js'); run('summary.js'); run('metrics.js');

// ---------- 1) Formato de números en español ----------
const f = (v, d) => get('fmtNum(' + JSON.stringify(v) + ', ' + d + ')');
assert.strictEqual(f(1234, 0), '1.234', 'los de 4 cifras también llevan punto de millar (toLocaleString no lo hace)');
assert.strictEqual(f(15161, 0), '15.161');
assert.strictEqual(f(1234567, 0), '1.234.567');
assert.strictEqual(f(71.25, 2), '71,25');
assert.strictEqual(f(72.5, 2), '72,5', 'sin ceros sobrantes');
assert.strictEqual(f(60, 2), '60');
assert.strictEqual(f(-0.04, 1), '0', 'un negativo que redondea a 0 no sale como "-0"');
assert.strictEqual(f(-2.14, 1), '-2,1');
assert.strictEqual(get('fmtNum(NaN, 1)'), '–');
assert.strictEqual(get('fmtKg(71.25)'), '71,25 kg');

// ---------- 2) Mejoras de la semana: misma métrica que la hoja de ejercicio ----------
const wk = get('getWeekStart()'), lw = new Date(wk); lw.setDate(lw.getDate() - 7);
const ds = d => get('localDateStr')(d);
const mk = (ej, d, peso, reps, series) => ({ Perfil: 'David', Fecha: ds(d), 'Día': 'Día 1 · X', Ejercicio: ej, 'Peso (kg)': peso, Reps: reps, Series: series || 3, Calentamiento: false, Variante: '' });
const rows = [
  // A: sube el peso
  mk('A', lw, 60, 8), mk('A', wk, 62.5, 8),
  // B: mismo peso, SOLO más repeticiones (el peso máximo no lo veía)
  mk('B', lw, 60, 8), mk('B', wk, 60, 10),
  // C: variación de ~1 % (ruido): no es mejora
  mk('C', lw, 60, 8), mk('C', wk, 60.5, 8),
  // D: sube el peso pero bajan las reps: apenas cambia la fuerza
  mk('D', lw, 60, 8), mk('D', wk, 62.5, 6),
  // E: peso máximo igual pero hace una serie más (volumen sube, fuerza no)
  mk('E', lw, 60, 8, 3), mk('E', wk, 60, 8, 4),
  // F: ejercicio por tiempo: no entra en esta lista
  mk('Plancha', lw, 0, 45), mk('Plancha', wk, 0, 60),
  // otro perfil: no cuenta
  Object.assign(mk('G', lw, 60, 8), { Perfil: 'Pedro' }), Object.assign(mk('G', wk, 100, 8), { Perfil: 'Pedro' }),
];
get('window._progressCache = ' + JSON.stringify(rows));
const imp = get("weeklyImprovements('David')");
const names = Array.from(imp.map(x => x.ex));
assert(names.includes('A'), 'subir peso cuenta como mejora');
assert(names.includes('B'), 'subir solo repeticiones cuenta como mejora (con el peso máximo no se veía)');
assert(!names.includes('C'), 'una variación de ~1 % es ruido y no se anuncia como mejora');
assert(!names.includes('D'), 'más peso con menos reps apenas cambia la fuerza: no es una mejora clara');
assert(!names.includes('E'), 'una serie extra con la misma fuerza no es mejora (sí lo sería para el volumen)');
assert(!names.includes('Plancha') && !names.includes('G'));
const a = imp.find(x => x.ex === 'A'), b = imp.find(x => x.ex === 'B');
assert(Math.abs(a.pct - Math.round((S(62.5, 8) / S(60, 8) - 1) * 1000) / 10) < 0.11, 'el % de A coincide con la fuerza estimada');
assert(Math.abs(b.pct - Math.round((S(60, 10) / S(60, 8) - 1) * 1000) / 10) < 0.11, 'el % de B coincide con la fuerza estimada');
assert(imp[0].pct >= imp[1].pct, 'ordenadas de mayor a menor mejora');

// El valor semanal de la hoja de ejercicio y el del Resumen son el mismo número
const wvA = get("pgWeekValue('A', getWeekStart())");
const sessA = get("exerciseSessions('A')");
assert(Math.abs(wvA.value - sessA[sessA.length - 1].value) < 1e-9, 'Resumen y hoja de ejercicio usan el mismo valor');

// ---------- 3) Índice de fuerza de Métricas: misma métrica, base = primera sesión ----------
const idxRows = [];
for (let i = 0; i < 4; i++) {            // 4 semanas, un ejercicio que sube un 2,5 % de peso cada semana
  const d = new Date(wk); d.setDate(d.getDate() - 7 * (3 - i));
  idxRows.push(mk('P', d, 60 * (1 + 0.025 * i), 8));
}
get('window._progressCache = ' + JSON.stringify(idxRows));
const idx = get("computeStrengthIndexByWeek('David')");
assert.strictEqual(idx.values.length, 4);
assert(Math.abs(idx.values[0] - 100) < 0.11, 'la primera semana es el 100 %');
assert(Math.abs(idx.values[3] - 107.5) < 0.2, 'subir 2,5 % de peso cada semana = ~107,5 % a la 4ª semana: ' + idx.values[3]);
for (let i = 1; i < 4; i++) assert(idx.values[i] > idx.values[i - 1], 'el índice sube cada semana');

// ---------- 4) Textos: la gráfica de Métricas ya no se llama "de peso" ----------
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(!/Progresión de peso/.test(index), 'el título "Progresión de peso" ya no describe la gráfica');
assert(/Progresión del ejercicio/.test(index));
assert(/fuerza estimada/.test(index), 'el recordatorio rápido explica la fuerza estimada');
const metrics = fs.readFileSync(path.join(root, 'js', 'metrics.js'), 'utf8');
assert(!/#[0-9a-fA-F]{6}['"]\s*[,}]/.test(metrics.replace(/themeColor\([^)]*\)/g, '')), 'las gráficas de Métricas toman los colores del tema, no literales');

console.log('OK coherencia: formato es-ES y misma métrica en Resumen, hoja de ejercicio e índice de fuerza');
process.exit(0);
