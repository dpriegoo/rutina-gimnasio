// Prueba de humo: la página arranca sin errores, con y sin sesión, y se puede navegar entre vistas.
//   npm test
const { boot } = require('./page-helper');
const path = require('path');
const assert = require('assert');
const INDEX = path.join(__dirname, '..', 'index.html');

(async () => {
  let r = await boot(INDEX, { logged: false });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar sin sesión: ' + r.errs);
  assert.notStrictEqual(r.w.document.getElementById('profileScreen').style.display, 'none', 'debería verse el login');
  r.w.close();

  r = await boot(INDEX, { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar con sesión: ' + r.errs);
  const d = r.w.document;
  assert.strictEqual(d.getElementById('profileScreen').style.display, 'none', 'con sesión no debe verse el login');
  assert((r.w._progressCache || []).length > 0, 'el progreso debería cargarse desde la API simulada');

  // Pantalla inicial: elegir día (una ficha por día, una sola marcada como "Toca hoy")
  assert.notStrictEqual(d.getElementById('dayPicker').style.display, 'none', 'al abrir debe verse "¿Qué día entrenas?"');
  assert.strictEqual(d.getElementById('dayScreen').style.display, 'none', 'el día no debe verse hasta elegirlo');
  assert.strictEqual(d.querySelectorAll('#dpGrid .dp-tile').length, 5, 'una ficha por cada día de la rutina');
  assert.strictEqual(d.querySelectorAll('#dpGrid .dp-tag').length, 1, 'un único día sugerido');

  // Elegir día: carrusel de tarjetas + tira de progreso con un segmento por ejercicio
  r.w.openDay(0);
  assert.strictEqual(d.getElementById('dayPicker').style.display, 'none', 'al elegir día se oculta la pantalla de elegir');
  assert.notStrictEqual(d.getElementById('dayScreen').style.display, 'none', 'debe verse el día elegido');
  const cards = d.querySelectorAll('#main > .card');
  assert(cards.length > 0, 'deberían pintarse tarjetas de ejercicio');
  assert.strictEqual(d.querySelectorAll('#exStrip button').length, cards.length, 'un segmento por ejercicio');
  assert.strictEqual(d.querySelectorAll('#main .pg').length, cards.length, 'cada tarjeta tiene su bloque de progresión');

  // Gráfica: el press banca tiene 2 sesiones en la API simulada -> mini gráfica con línea
  const bench = [...cards].find(c => c.getAttribute('data-exercise') === 'Press banca plano');
  assert(bench && bench.querySelector('.pg-spark'), 'el press banca debería mostrar su mini gráfica');

  // Hoja de detalle: abre y cierra
  r.w.openProgressSheet('Press banca plano');
  const sheet = d.getElementById('pgSheet');
  assert(sheet.classList.contains('on') && sheet.querySelector('svg.pg-chart'), 'la hoja de detalle debería abrirse con su gráfica');
  r.w.closeProgressSheet();
  assert(!sheet.classList.contains('on'), 'la hoja de detalle debería cerrarse');

  // Volver a elegir día
  r.w.showDayPicker();
  assert.notStrictEqual(d.getElementById('dayPicker').style.display, 'none');
  assert.strictEqual(d.getElementById('dayScreen').style.display, 'none');
  r.w.openDay(0); // las vistas siguientes (Métricas, Editar, Rutina) se prueban con un día abierto
  r.w.setView('metricas'); await new Promise(x => setTimeout(x, 400));
  r.w.setView('editar');   await new Promise(x => setTimeout(x, 200));
  r.w.setView('rutina');
  assert(d.getElementById('rutinaView').innerHTML.length > 1000, 'la vista Rutina debería seguir pintada');
  r.w.close();
  console.log('OK smoke: arranque, carga de datos y navegación');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
