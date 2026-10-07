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
  assert(d.querySelectorAll('.card, .ex-card').length > 0, 'deberían pintarse tarjetas de ejercicio');
  assert((r.w._progressCache || []).length > 0, 'el progreso debería cargarse desde la API simulada');
  r.w.setView('metricas'); await new Promise(x => setTimeout(x, 400));
  r.w.setView('editar');   await new Promise(x => setTimeout(x, 200));
  r.w.setView('rutina');
  assert(d.getElementById('rutinaView').innerHTML.length > 1000, 'la vista Rutina debería seguir pintada');
  r.w.close();
  console.log('OK smoke: arranque, carga de datos y navegación');
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
