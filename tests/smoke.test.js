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

  // Cabecera compacta solo dentro de un día
  assert(d.body.classList.contains('in-day'), 'dentro de un día la cabecera se compacta');

  // Peso y reps se conservan al añadir una serie (lo normal es repetir carga)
  const c0 = d.querySelector('#main > .card'), logId = c0.querySelector('.log-form').id;
  c0.querySelector('.inp-peso').value = '60'; c0.querySelector('.inp-reps').value = '8';
  r.w.addPendingRow(logId); r.w.addPendingRow(logId);
  assert.strictEqual(c0.querySelector('.inp-peso').value, '60', 'el peso debe conservarse');
  assert.strictEqual(c0.querySelector('.inp-reps').value, '8', 'las reps deben conservarse');
  assert.strictEqual(c0.querySelectorAll('.pending-row').length, 2, 'dos series pendientes sin reescribir nada');
  r.w.removePendingRow(logId, 1); r.w.removePendingRow(logId, 0);

  // Las pantallas se refrescan en sitio (así una actualización de datos no repite la animación)
  const strip0 = d.querySelector('#exStrip button');
  r.w.renderStrip();
  assert.strictEqual(d.querySelector('#exStrip button'), strip0, 'la tira no debe reconstruirse');
  r.w.showDayPicker();
  const tile0 = d.querySelector('#dpGrid .dp-tile');
  r.w.renderDayPicker();
  assert.strictEqual(d.querySelector('#dpGrid .dp-tile'), tile0, 'las fichas no deben reconstruirse al refrescar');
  assert(!d.body.classList.contains('in-day'), 'en la pantalla de elegir día la cabecera vuelve a su tamaño');

  // Entrada a la app (solo con sesión) y bloqueo de zoom
  assert.strictEqual(r.w.sessionStorage.getItem('ironlogIntro'), '1', 'con sesión se muestra la entrada animada');
  r.w.skipIntro();
  assert(/user-scalable=no/.test(d.querySelector('meta[name=viewport]').content), 'el zoom debe estar bloqueado en el viewport');

  // Elegir día con transición: el telón se expande, cambia de pantalla y se retira
  r.w.openDayAnimated(1, d.querySelectorAll('#dpGrid .dp-tile')[1]);
  assert(d.querySelector('.dp-wipe'), 'debe aparecer el telón de la transición');
  assert.strictEqual(d.getElementById('dayScreen').style.display, 'none', 'durante la expansión aún no se ha cambiado de pantalla');
  await new Promise(x => setTimeout(x, 1200));
  assert(!d.querySelector('.dp-wipe'), 'el telón debe retirarse al terminar');
  assert.notStrictEqual(d.getElementById('dayScreen').style.display, 'none', 'al terminar debe verse el día elegido');

  // Con "reducir movimiento" no hay transición: se abre al instante y sin telón
  r.w.showDayPicker();
  const mm = r.w.matchMedia; r.w.matchMedia = () => ({ matches: true, addListener() {}, addEventListener() {} });
  r.w.openDayAnimated(2, d.querySelectorAll('#dpGrid .dp-tile')[2]);
  assert(!d.querySelector('.dp-wipe'), 'con reducir movimiento no debe haber telón');
  assert.notStrictEqual(d.getElementById('dayScreen').style.display, 'none', 'con reducir movimiento se abre al instante');
  r.w.matchMedia = mm;
  r.w.showDayPicker(); r.w.openDay(0);
  r.w.setView('metricas'); await new Promise(x => setTimeout(x, 400));
  r.w.setView('editar');   await new Promise(x => setTimeout(x, 200));
  r.w.setView('rutina');
  assert(d.getElementById('rutinaView').innerHTML.length > 1000, 'la vista Rutina debería seguir pintada');
  r.w.close();
  console.log('OK smoke: arranque, carga de datos y navegación');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
