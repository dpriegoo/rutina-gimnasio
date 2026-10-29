// Datos y gráficas de progresión por ejercicio (js/progress-chart.js).
//   npm test
// Comprueba que la historia de un ejercicio junta todos los días en que se hace, que el
// calentamiento y los datos de otros perfiles nunca cuentan, y que la mini gráfica y la hoja se pintan.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const ctx = dom.getInternalVMContext();
const run = f => new vm.Script(fs.readFileSync(path.join(root, 'js', f), 'utf8') + '\n;', { filename: f }).runInContext(ctx);
const get = expr => new vm.Script(expr).runInContext(ctx);

run('utils.js');
get("function getProfile(){ return 'David'; } function isTimedExercise(n){ return n === 'Plancha'; }");
run('progress-chart.js');

const row = (o) => Object.assign({ Perfil: 'David', Series: 1, Calentamiento: false, Variante: '' }, o);
const rows = [
  // Press banca en dos días distintos
  row({ Fecha: '2026-10-05', 'Día': 'Día 1 · Pecho', Ejercicio: 'Press banca', 'Peso (kg)': 60, Reps: 8 }),
  row({ Fecha: '2026-10-05', 'Día': 'Día 1 · Pecho', Ejercicio: 'Press banca', 'Peso (kg)': 60, Reps: 6 }),
  row({ Fecha: '2026-10-05', 'Día': 'Día 1 · Pecho', Ejercicio: 'Press banca', 'Peso (kg)': 20, Reps: 12, Calentamiento: true }),
  row({ Fecha: '2026-10-08', 'Día': 'Día 4 · Hombro', Ejercicio: 'Press banca', 'Peso (kg)': 62.5, Reps: 8, Variante: 'Chest Press' }),
  row({ Fecha: '2026-10-12', 'Día': 'Día 1 · Pecho', Ejercicio: 'Press banca', 'Peso (kg)': 65, Reps: 7 }),
  // otro perfil: no debe aparecer
  row({ Perfil: 'Pedro', Fecha: '2026-10-06', 'Día': 'Día 1 · Pecho', Ejercicio: 'Press banca', 'Peso (kg)': 100, Reps: 10 }),
  // ejercicio por tiempo (segundos)
  row({ Fecha: '2026-10-05', 'Día': 'Día 2 · Core', Ejercicio: 'Plancha', 'Peso (kg)': 0, Reps: 45 }),
  row({ Fecha: '2026-10-12', 'Día': 'Día 2 · Core', Ejercicio: 'Plancha', 'Peso (kg)': 0, Reps: 60 }),
];
dom.window._progressCache = rows;
get('window._progressCache = ' + JSON.stringify(rows));

// 1) Sesiones: una por fecha, juntando días, sin calentamiento ni otros perfiles
const bench = get("exerciseSessions('Press banca')");
assert.strictEqual(bench.length, 3, 'press banca: 3 fechas (días 1 y 4 juntos)');
assert.strictEqual(bench[0].fecha, '2026-10-05');
assert.strictEqual(bench[0].peso, 60); assert.strictEqual(bench[0].reps, 8, 'la mejor serie del día (1RM), no la última');
assert(Math.abs(bench[0].value - 60 * (1 + 8 / 30)) < 1e-9, 'Epley');
assert.strictEqual(bench[0].volume, 60 * 8 + 60 * 6, 'el calentamiento no suma volumen');
assert.strictEqual(bench[1].dia, 'Día 4 · Hombro', 'incluye la sesión de otro día');
assert.strictEqual(bench[1].variante, 'Chest Press', 'recuerda la variante');
assert(!bench.some(s => s.peso === 100), 'los datos de otro perfil no cuentan');
assert.strictEqual(JSON.stringify(get("exerciseDayLabels('Press banca')")), JSON.stringify(['Día 1', 'Día 4']));

// 2) Ejercicio por tiempo: valor en segundos
const plank = get("exerciseSessions('Plancha')");
assert.strictEqual(JSON.stringify(plank.map(s => s.value)), JSON.stringify([45, 60]));

// 3) Estancamiento y variación
assert.strictEqual(get('pgIsStagnant([70, 70.2, 70.1])'), true);
assert.strictEqual(get('pgIsStagnant([70, 72, 75])'), false);
assert.strictEqual(get('pgIsStagnant([70, 70])'), false, 'con menos de 3 sesiones no se avisa');
assert(Math.abs(get('pgDeltaPct([100, 110])') - 10) < 1e-9);
assert.strictEqual(get('pgDeltaPct([100])'), null);

// 4) Mini gráfica de la tarjeta
const doc = dom.window.document;
const card = doc.createElement('div'); card.className = 'card'; card.setAttribute('data-exercise', 'Press banca');
card.innerHTML = '<button class="pg"></button>';
get('renderCardProgress')(card);
assert(card.querySelector('.pg-spark'), 'con 3 sesiones hay mini gráfica');
assert(card.querySelector('.pg-big').textContent.includes('kg'));
const none = doc.createElement('div'); none.setAttribute('data-exercise', 'Ejercicio nuevo');
none.innerHTML = '<button class="pg"></button>';
get('renderCardProgress')(none);
assert(none.querySelector('.pg-empty') && none.querySelector('.pg').disabled, 'sin historial: mensaje vacío y sin hoja');
const timed = doc.createElement('div'); timed.setAttribute('data-exercise', 'Plancha');
timed.innerHTML = '<button class="pg"></button>';
get('renderCardProgress')(timed);
assert(timed.querySelector('.pg-big').textContent.includes('s') && !timed.querySelector('.pg-big').textContent.includes('kg'), 'por tiempo: segundos');

// 5) Hoja de detalle
get("openProgressSheet('Press banca')");
const sheet = doc.getElementById('pgSheet');
assert(sheet.classList.contains('on'));
assert(sheet.textContent.includes('Día 1') && sheet.textContent.includes('Día 4'), 'muestra en qué días se hace');
assert(sheet.textContent.includes('varios días'));
assert(sheet.querySelectorAll('svg.pg-chart').length === 2, 'gráfica de 1RM + volumen');
assert(sheet.querySelector('.pg-pt.hol'), 'la sesión con otra variante lleva punto hueco');
assert(!/NaN|undefined|Infinity/.test(sheet.innerHTML), 'la hoja no debe tener valores inválidos');
get('closeProgressSheet()');
assert(!sheet.classList.contains('on'));

console.log('OK progress-chart: sesiones por ejercicio, mini gráfica y hoja de detalle');
process.exit(0);
