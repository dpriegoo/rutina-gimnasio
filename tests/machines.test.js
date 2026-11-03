// Máquinas (variantes) en el registro de series: "Últ", "Supera" y la marca personal 🏆 van por máquina.
// Una máquina secundaria que mueve más peso no debe sugerirte esa carga en la habitual ni impedirte batir tu
// récord en ella (ni darte un 🏆 falso por cambiar de máquina).
//   npm test
const path = require('path'), assert = require('assert');
const { boot } = require('./page-helper');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const r = await boot(path.join(__dirname, '..', 'index.html'), { logged: true });
  assert.deepStrictEqual(r.errs, [], 'errores al arrancar: ' + r.errs);
  const w = r.w, d = w.document;
  const DIA = 'Día 1 · Pectoral, deltoides y tríceps', EX = 'Press banca plano';
  const SEC = 'Chest Press (Technogym)', SEC2 = 'Mancuernas en banco plano';   // alternativas de la rutina por defecto
  const lwStart = w.getWeekStartOffset(-1), lw = w.localDateStr(lwStart);
  const lwMid = new Date(lwStart); lwMid.setDate(lwMid.getDate() + 2);   // miércoles de la semana pasada
  const row = (f, peso, reps, v) => ({ Perfil: 'David', Fecha: f, 'Día': DIA, Ejercicio: EX, 'Peso (kg)': peso, Reps: reps, Series: 1, Calentamiento: false, Variante: v || '' });
  // habitual: mejor 60x8 ; secundaria: mejor 90x8 (mucho más peso). La ÚLTIMA en el tiempo es la secundaria (miércoles).
  w._progressCache = [row('2026-09-01', 55, 8), row('2026-09-08', 60, 8), row('2026-09-15', 85, 8, SEC), row(lw, 60, 8), row(w.localDateStr(lwMid), 90, 8, SEC)];
  w.openDay(0);
  const card = [...d.querySelectorAll('#main > .card')].find(c => c.getAttribute('data-exercise') === EX);
  assert(card, 'la tarjeta del press banca existe');

  // ---------- 1) Funciones por máquina ----------
  const any = w.lastSessionValue(EX), hab = w.lastSessionValue(EX, ''), sec = w.lastSessionValue(EX, SEC);
  assert.strictEqual(String(any.peso), '90', 'sin filtrar, la última es la de la secundaria (el comportamiento que metía ruido)');
  assert.strictEqual(String(hab.peso), '60', 'la habitual: 60');
  assert.strictEqual(String(sec.peso), '90', 'la secundaria: 90');
  assert.strictEqual(w.lastSessionValue(EX, SEC2), null, 'sin historial en una máquina nueva');
  assert.strictEqual(w.allTimeBestBeforeNow(DIA, EX, '').value, Math.round(60 * (1 + 8 / 30) * 10) / 10, 'récord de la habitual');
  assert(w.allTimeBestBeforeNow(DIA, EX, SEC).value > w.allTimeBestBeforeNow(DIA, EX, '').value, 'la secundaria tiene un récord mayor en kilos');

  // ---------- 2) La tarjeta sugiere según la máquina elegida ----------
  const sel = card.querySelector('.inp-variante');
  assert(/updateCardHints/.test(sel.getAttribute('onchange')), 'al cambiar de máquina se refrescan las pistas');
  w.updateCardHints(card);
  assert(/60/.test(card.querySelector('.inp-peso').placeholder) && !/90/.test(card.querySelector('.inp-peso').placeholder), 'habitual: sugiere 60, no 90: ' + card.querySelector('.inp-peso').placeholder);
  sel.value = SEC; w.updateCardHints(card);
  assert(/90/.test(card.querySelector('.inp-peso').placeholder), 'secundaria: sugiere 90');
  assert(/90 kg × 8/.test(card.querySelector('.beat-last-week').textContent), '"Supera" con la marca de la secundaria');
  sel.value = SEC2; w.updateCardHints(card);
  assert.strictEqual(card.querySelector('.inp-peso').placeholder, 'Peso kg', 'máquina sin historial: vuelve al texto neutro');
  assert(/Sin marcas de la semana pasada en esta máquina/.test(card.querySelector('.beat-last-week').textContent), 'y lo dice (hay marcas, pero de otra máquina)');
  sel.value = ''; w.updateCardHints(card);
  assert(/60 kg × 8/.test(card.querySelector('.beat-last-week').textContent), '"Supera" de la habitual: 60 kg × 8, no los 90 de la secundaria: ' + card.querySelector('.beat-last-week').textContent);
  assert(!/90/.test(card.querySelector('.beat-last-week').textContent));

  // ---------- 3) Marca personal por máquina ----------
  const logId = card.querySelector('.log-form').id;
  const log = async (peso, reps, variante) => {
    card.querySelector('.inp-peso').value = String(peso); card.querySelector('.inp-reps').value = String(reps);
    card.querySelector('.inp-variante').value = variante || '';
    w.addPendingRow(logId);
    await w.acceptPending(logId);
    const t = d.getElementById('toast').textContent;
    await sleep(30);
    return t;
  };
  assert(/🏆/.test(await log(62, 8, '')), 'batir tu récord en la HABITUAL da 🏆 aunque la secundaria tenga 90 kg (antes: no)');
  assert(!/🏆/.test(await log(80, 8, SEC)), '80 kg en la secundaria no bate sus 90 kg');
  assert(/🏆/.test(await log(100, 8, SEC)), 'batir el récord de la secundaria sí da 🏆');
  assert(!/🏆/.test(await log(30, 8, SEC2)), 'primera vez en una máquina nueva: no es marca personal');
  assert(!/🏆/.test(await log(61, 8, '')), '61 kg no bate los 62 recién hechos en la habitual');

  console.log('OK máquinas: Últ, Supera y marca personal por máquina');
  r.w.close();
  process.exit(0);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
