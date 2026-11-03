// Datos y gráficas de progresión por ejercicio (js/progress-chart.js).
//   npm test
// Comprueba: la historia de un ejercicio junta todos los días en que se hace; el calentamiento y los
// datos de otros perfiles nunca cuentan; la métrica (media de series, carga × reps^0,10) se comporta
// como se diseñó (subir solo peso o solo reps la sube, una serie extra NO la infla); cambio, tendencia
// y aviso de estancamiento; y que la mini gráfica y la hoja se pintan sin valores inválidos.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const ctx = dom.getInternalVMContext();
const run = f => new vm.Script(fs.readFileSync(path.join(root, 'js', f), 'utf8') + '\n;', { filename: f }).runInContext(ctx);
const get = expr => new vm.Script(expr).runInContext(ctx);
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6, (msg || '') + ' (' + a + ' vs ' + b + ')');
const S = (w, r) => w * Math.pow(r, 0.10);   // fuerza de una serie

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
  // Remo: ponderación por nº de series y propiedades de la métrica
  row({ Fecha: '2026-10-05', 'Día': 'Día 2 · Espalda', Ejercicio: 'Remo', 'Peso (kg)': 60, Reps: 8, Series: 2 }),
  row({ Fecha: '2026-10-05', 'Día': 'Día 2 · Espalda', Ejercicio: 'Remo', 'Peso (kg)': 60, Reps: 6, Series: 1 }),
  row({ Fecha: '2026-10-12', 'Día': 'Día 2 · Espalda', Ejercicio: 'Remo', 'Peso (kg)': 60, Reps: 8, Series: 3 }),
  row({ Fecha: '2026-10-19', 'Día': 'Día 2 · Espalda', Ejercicio: 'Remo', 'Peso (kg)': 60, Reps: 8, Series: 4 }),   // serie extra, misma fuerza
  row({ Fecha: '2026-10-26', 'Día': 'Día 2 · Espalda', Ejercicio: 'Remo', 'Peso (kg)': 60, Reps: 10, Series: 3 }),  // solo más reps
  row({ Fecha: '2026-11-02', 'Día': 'Día 2 · Espalda', Ejercicio: 'Remo', 'Peso (kg)': 65, Reps: 8, Series: 3 }),   // solo más peso
];
// Sentadilla plana (10 sesiones sin mejora) y Prensa creciendo (10 sesiones al alza)
for (let i = 0; i < 10; i++) {
  const d = '2026-09-' + String(1 + i * 3).padStart(2, '0');
  rows.push(row({ Fecha: d, 'Día': 'Día 3 · Pierna', Ejercicio: 'Sentadilla', 'Peso (kg)': 80, Reps: 8 + (i % 2) }));
  rows.push(row({ Fecha: d, 'Día': 'Día 3 · Pierna', Ejercicio: 'Prensa', 'Peso (kg)': 100 + i * 5, Reps: 10 }));
}
// Femoral: la máquina habitual mueve ~40 de fuerza y la secundaria (Leg Curl) ~1,3 veces más (+30 %), intercaladas.
// La fuerza real NO cambia (plano): con las sesiones mezcladas la gráfica daría saltos falsos.
for (let i = 0; i < 10; i++) {
  const d = '2026-08-' + String(1 + i * 3).padStart(2, '0');
  const sec = (i === 2 || i === 4 || i === 7);
  rows.push(row({ Fecha: d, 'Día': 'Día 3 · Pierna', Ejercicio: 'Femoral', 'Peso (kg)': sec ? 52 : 40, Reps: 8, Variante: sec ? 'Leg Curl' : '' }));
}
// Hombro: las 3 ÚLTIMAS sesiones son en la secundaria, mucho más ligera (la habitual estaba ocupada): sin base para ajustarla
for (let i = 0; i < 10; i++) {
  const d = '2026-07-' + String(1 + i * 3).padStart(2, '0');
  const sec = i >= 7;
  rows.push(row({ Fecha: d, 'Día': 'Día 4 · Hombro', Ejercicio: 'Hombro', 'Peso (kg)': sec ? 20 : 30, Reps: 8, Variante: sec ? 'Mancuernas' : '' }));
}
// Cambio definitivo de máquina: las últimas 8 sesiones son todas en la secundaria
for (let i = 0; i < 10; i++) {
  const d = '2026-06-' + String(1 + i * 3).padStart(2, '0');
  const sec = i >= 2;
  rows.push(row({ Fecha: d, 'Día': 'Día 2 · Espalda', Ejercicio: 'Jalón', 'Peso (kg)': sec ? 70 : 55, Reps: 8, Variante: sec ? 'Lat Machine' : '' }));
}
get('window._progressCache = ' + JSON.stringify(rows));

// 1) Sesiones: una por fecha, juntando días, sin calentamiento ni otros perfiles
const bench = get("exerciseSessions('Press banca')");
assert.strictEqual(bench.length, 3, 'press banca: 3 fechas (días 1 y 4 juntos)');
assert.strictEqual(bench[0].fecha, '2026-10-05');
near(bench[0].value, (S(60, 8) + S(60, 6)) / 2, 'valor = media de las series de trabajo (sin calentamiento)');
assert.strictEqual(bench[0].peso, 60); assert.strictEqual(bench[0].reps, 8, 'se guarda la mejor serie para mostrarla');
assert.strictEqual(bench[0].nSets, 2);
assert.strictEqual(bench[0].volume, 60 * 8 + 60 * 6, 'el calentamiento no suma volumen');
assert.strictEqual(bench[1].dia, 'Día 4 · Hombro', 'incluye la sesión de otro día');
assert.strictEqual(bench[1].variante, 'Chest Press', 'recuerda la variante');
assert(!bench.some(s => s.peso === 100), 'los datos de otro perfil no cuentan');
assert.strictEqual(JSON.stringify(get("exerciseDayLabels('Press banca')")), JSON.stringify(['Día 1', 'Día 4']));

// 2) Ponderación por nº de series y propiedades de la métrica
const remo = get("exerciseSessions('Remo')");
near(remo[0].value, (2 * S(60, 8) + 1 * S(60, 6)) / 3, 'una fila con Series=2 pesa el doble');
near(remo[1].value, S(60, 8), '3 series iguales');
near(remo[2].value, remo[1].value, 'una 4ª serie con la misma fuerza NO cambia la métrica');
assert(remo[2].volume > remo[1].volume, '…aunque el volumen sí sube (por eso no sirve como indicador de progreso)');
assert(remo[3].value > remo[2].value, 'subir solo repeticiones sube la métrica');
assert(remo[4].value > remo[2].value, 'subir solo peso sube la métrica');

// 3) Ejercicio por tiempo: valor en segundos (mejor serie)
const plank = get("exerciseSessions('Plancha')");
assert.strictEqual(JSON.stringify(plank.map(s => s.value)), JSON.stringify([45, 60]));

// 4) Tendencia suavizada y cambio reciente
assert.strictEqual(JSON.stringify(get('pgTrend([10, 20, 30, 40])')), JSON.stringify([10, 15, 20, 30]));
assert.strictEqual(get('pgChange([100])'), null);
let c = get('pgChange([100, 110])');       near(c.pct, 10); assert.strictEqual(c.w, 1, '2 sesiones: contra la anterior');
c = get('pgChange([1, 1, 100, 100, 110])'); assert.strictEqual(c.w, 2, '4-5 sesiones: ventanas de 2');
c = get('pgChange([100, 100, 100, 110, 110, 110])'); near(c.pct, 10); assert.strictEqual(c.w, 3, '6+ sesiones: 3 contra 3');
c = get('pgChange([100, 100, 100, 105, 120, 115, 100, 100])');     assert.strictEqual(c.w, 3);

// 5) Aviso de tendencia: solo con 8+ sesiones, por regresión
assert.strictEqual(get('pgTrendInfo([1, 2, 3, 4, 5, 6, 7])'), null, 'con menos de 8 sesiones no se afirma nada');
const flat = get('pgTrendInfo([100, 101, 99, 100, 101, 99, 100, 100])');
assert(flat.stagnant && Math.abs(flat.pct) < 1.5, 'plano -> sin tendencia');
const up = get('pgTrendInfo([100, 101, 102, 103, 104, 105, 106, 107])');
assert(!up.stagnant && up.pct > 5, 'creciendo -> tendencia al alza');
const down = get('pgTrendInfo([107, 106, 105, 104, 103, 102, 101, 100])');
assert(down.stagnant && down.pct < -1.5, 'bajando -> "no sube" y además negativo');

// 6) Mini gráfica de la tarjeta
const doc = dom.window.document;
const mk = (name) => { const el = doc.createElement('div'); el.className = 'card'; el.setAttribute('data-exercise', name); el.innerHTML = '<button class="pg"></button>'; get('renderCardProgress')(el); return el; };
const card = mk('Press banca');
assert(card.querySelector('.pg-spark') && card.querySelector('.pg-trend'), 'con 3 sesiones hay mini gráfica con línea de tendencia');
assert(card.querySelector('.pg-big').textContent.includes('kg'));
assert(card.querySelector('.pg-cap').textContent.includes('Fuerza estimada'));
assert(card.querySelector('.pg-delta'), 'chip de cambio');
const none = mk('Ejercicio nuevo');
assert(none.querySelector('.pg-empty') && none.querySelector('.pg').disabled, 'sin historial: mensaje vacío y sin hoja');
const timed = mk('Plancha');
assert(timed.querySelector('.pg-big').textContent.includes('s') && !timed.querySelector('.pg-big').textContent.includes('kg'), 'por tiempo: segundos');
assert(timed.querySelector('.pg-cap').textContent.includes('Mejor serie'));

// 7) Máquinas (variantes): referencia, ajuste y exclusión
const sessF = get("exerciseSessions('Femoral')");
assert.strictEqual(sessF.length, 10);
assert.strictEqual(get("pgReferenceMachine(exerciseSessions('Femoral'))"), '', 'la habitual es la de referencia (más sesiones)');
const facF = get("pgMachineFactors(exerciseSessions('Femoral'), '')");
assert(Math.abs(facF['Leg Curl'] - 40 / 52) < 1e-9, 'el factor lleva la secundaria a la escala de la habitual: ' + JSON.stringify(facF));
const serF = get("exerciseSeries('Femoral')");
assert.strictEqual(serF.sessions.length, 10, 'las 3 sesiones secundarias se ajustan y entran');
assert.strictEqual(serF.adjusted, 3); assert.strictEqual(serF.excluded, 0);
const vF = Array.from(serF.sessions.map(x => x.value));
assert(Math.max(...vF) - Math.min(...vF) < 1e-9, 'ajustada, la serie es plana (la fuerza real no cambia)');
const rawF = Array.from(sessF.map(x => x.value));
assert(Math.max(...rawF) / Math.min(...rawF) > 1.25, 'sin ajustar (lo que se hacía antes) habría saltos de ~30 %');
assert.strictEqual(serF.sessions.filter(x => x.adj).length, 3, 'las ajustadas quedan marcadas');
// solo una máquina, sin ajustar
const onlyLeg = get("exerciseSeries('Femoral', undefined, 'm:Leg Curl')");
assert.strictEqual(onlyLeg.sessions.length, 3); assert.strictEqual(onlyLeg.excluded, 7);
// peor caso: las últimas 3 sesiones en la secundaria, sin sesiones habituales posteriores -> no se pueden ajustar, no entran
const serH = get("exerciseSeries('Hombro')");
assert.strictEqual(serH.sessions.length, 7, 'las 3 sesiones del final, sin base para ajustar, NO entran'); assert.strictEqual(serH.excluded, 3);
assert(Math.max(...Array.from(serH.sessions.map(x => x.value))) - Math.min(...Array.from(serH.sessions.map(x => x.value))) < 1e-9, 'la serie no muestra un falso retroceso');
// cambio definitivo: la de referencia pasa a ser la secundaria
assert.strictEqual(get("pgReferenceMachine(exerciseSessions('Jalón'))"), 'Lat Machine', 'tras cambiar de máquina, la de referencia es la nueva');
const serJ = get("exerciseSeries('Jalón')");
assert(serJ.sessions.every(x => x.variante === 'Lat Machine'), 'la serie son solo las sesiones de la máquina nueva');
// una misma fecha con dos máquinas = dos sesiones separadas
get("window._progressCache = window._progressCache.concat([{ Perfil: 'David', Fecha: '2026-12-01', 'Día': 'Día 3 · Pierna', Ejercicio: 'Mixto', 'Peso (kg)': 40, Reps: 8, Series: 3, Calentamiento: false, Variante: '' }, { Perfil: 'David', Fecha: '2026-12-01', 'Día': 'Día 3 · Pierna', Ejercicio: 'Mixto', 'Peso (kg)': 52, Reps: 8, Series: 3, Calentamiento: false, Variante: 'Leg Curl' }])");
assert.strictEqual(get("exerciseSessions('Mixto')").length, 2, 'mismo día, dos máquinas: dos sesiones, cada una con su peso');

// 8) Tarjeta: avisa de lo que entra y lo que no
const cF = mk('Femoral'), cH = mk('Hombro'), cB = mk('Press banca');
assert(/incluye 3 sesiones de otra máquina, ajustadas/.test(cF.querySelector('.pg-mnote').textContent), 'la tarjeta dice que hay sesiones ajustadas');
assert(/3 sesiones en otra máquina no entran/.test(cH.querySelector('.pg-mnote').textContent), 'la tarjeta dice que las del final no entran');
assert(/1 sesión en otra máquina no entra/.test(cB.querySelector('.pg-mnote').textContent), 'una sola sesión secundaria no se puede ajustar');
assert(!/NaN|undefined/.test(cF.innerHTML));

// 9) Hoja de detalle
const sheet = () => doc.getElementById('pgSheet');
get("openProgressSheet('Press banca')");
assert(sheet().classList.contains('on'));
assert(sheet().textContent.includes('Día 1') && sheet().textContent.includes('Día 4'), 'muestra en qué días se hace');
assert(sheet().textContent.includes('varios días'));
assert(sheet().querySelectorAll('svg.pg-chart').length === 2, 'gráfica de fuerza + volumen');
assert(sheet().textContent.includes('Con 8 o más sesiones'), 'con pocas sesiones no se afirma tendencia');
assert(sheet().textContent.includes('no cuánto de fuerte eres'), 'aviso sobre el volumen');
assert(sheet().textContent.includes('no coincide con el 1RM'), 'nota sobre la diferencia con el 1RM de otras pantallas');
assert(!/NaN|undefined|Infinity/.test(sheet().innerHTML), 'la hoja no debe tener valores inválidos');
assert(/Chest Press[^<]*no entra/.test(sheet().innerHTML), 'la lista de sesiones marca la que no entra');

get("openProgressSheet('Femoral')");
assert(sheet().querySelectorAll('.pg-mchip').length === 3, 'selector: Combinada + una por máquina');
assert.strictEqual(sheet().querySelector('.pg-mchip[aria-pressed="true"]').textContent, 'Combinada');
assert(sheet().querySelector('.pg-trendln'), 'línea de tendencia en la gráfica grande');
assert(sheet().querySelectorAll('.pg-pt.hol').length === 3, 'las 3 sesiones ajustadas llevan punto hueco');
assert(/Leg Curl ×0,77/.test(sheet().textContent), 'se dice qué factor se aplica: ' + sheet().querySelector('.pg-hint:nth-of-type(1)'));
assert(/ajustada ×0,77/.test(sheet().textContent), 'la lista marca las sesiones ajustadas');
// cambiar a la máquina secundaria sola
const chips = [...sheet().querySelectorAll('.pg-mchip')];
const legIdx = chips.findIndex(b => /Leg Curl/.test(b.textContent));
get('pgPickMachine(' + legIdx + ')');
assert(/Solo las sesiones en/.test(sheet().textContent) && /Leg Curl/.test(sheet().textContent));
assert.strictEqual(sheet().querySelectorAll('.pg-pt.hol').length, 0, 'una máquina sola no lleva puntos ajustados');
assert.strictEqual(sheet().querySelector('.pg-stat:nth-child(3) b').textContent, '3', 'solo 3 sesiones en esa máquina');
assert.strictEqual(sheet().querySelector('.pg-mchip[aria-pressed="true"]').textContent.indexOf('Leg Curl'), 0);

get("openProgressSheet('Sentadilla')");
assert(!sheet().querySelector('.pg-mchip'), 'con una sola máquina no hay selector');
assert(sheet().textContent.includes('Sin tendencia al alza'), 'sentadilla plana -> aviso de estancamiento');
get("openProgressSheet('Prensa')");
assert(sheet().textContent.includes('Tendencia al alza'), 'prensa creciendo -> tendencia al alza');
assert(!sheet().textContent.includes('Sin tendencia'));
get("openProgressSheet('Plancha')");
assert(!sheet().textContent.includes('no coincide con el 1RM'), 'por tiempo: sin nota de 1RM');
get('closeProgressSheet()');
assert(!sheet().classList.contains('on'));

console.log('OK progress-chart: métrica por series, máquinas secundarias, cambio y tendencia, avisos y hoja de detalle');
process.exit(0);
