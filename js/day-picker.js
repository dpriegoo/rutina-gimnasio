// =====================================================================
// Elegir día y navegar entre ejercicios  (day-picker.js)
// Pantalla inicial "¿Qué día entrenas?" (una ficha por día) y, ya dentro de un día, la tira
// de progreso con un segmento por ejercicio y el desplazamiento del carrusel.
// Depende de: day-view (isDayComplete, isDayStarted, weeklySeriesCount, renderDay),
//             planning (effectiveDayGroups), routine (DAYS, currentDay), utils.
// =====================================================================

let dayScreenOpen = false;
let currentExIdx = 0;

const DAY_COLORS = 5; // --d1 … --d5 en styles.css (los días se reparten cíclicamente si hubiera más)

function dayColorVar(i){ return 'var(--d' + ((i % DAY_COLORS) + 1) + ')'; }

function dayNumberOf(d, i){
  const m = String(d.name).match(/\d+/);
  return m ? m[0] : String(i + 1);
}

function dayGroupsLabel(d){
  const parts = String(d.name).split('·');
  return (parts[1] || parts[0]).trim();
}

function dayExerciseNames(d){
  return effectiveDayGroups(d).flatMap(g => g.exercises.map(ex => ex.name));
}

// Día sugerido: el que está empezado; si no hay, el siguiente sin empezar después del último completo.
// Si todos están completos, ninguno.
function suggestedDayIdx(){
  const st = DAYS.map(d => isDayComplete(d) ? 2 : (isDayStarted(d) ? 1 : 0));
  const partial = st.indexOf(1);
  if (partial >= 0) return partial;
  let last = -1;
  st.forEach((s, i) => { if (s === 2) last = i; });
  for (let k = 1; k <= DAYS.length; k++) {
    const i = (last + k) % DAYS.length;
    if (st[i] === 0) return i;
  }
  return -1;
}

function exState(n){ return n >= 3 ? 'done' : (n > 0 ? 'warn' : 'none'); }

function renderDayPicker(){
  const grid = document.getElementById('dpGrid');
  if (!grid) return;
  const sug = suggestedDayIdx();
  grid.innerHTML = DAYS.map((d, i) => {
    const names = dayExerciseNames(d);
    const counts = names.map(n => weeklySeriesCount(d.name, n));
    const done = counts.filter(c => c >= 3).length;
    const any = counts.filter(c => c > 0).length;
    const status = done === names.length && names.length > 0 ? 'Completo' : (any ? 'Empezado · ' + done + '/' + names.length : 'Pendiente');
    const segs = counts.map(c => '<i class="' + exState(c) + '"></i>').join('');
    const wide = (DAYS.length % 2 === 1 && i === DAYS.length - 1) ? ' dp-wide' : '';
    const tag = i === sug ? '<span class="dp-tag">Toca hoy</span>' : '';
    return '<button type="button" class="dp-tile' + wide + '" style="--c:' + dayColorVar(i) + '" onclick="openDay(' + i + ')" ' +
      'aria-label="' + escHtml('Día ' + dayNumberOf(d, i) + ', ' + dayGroupsLabel(d) + ', ' + status) + '">' + tag +
      '<span class="dp-num">' + escHtml(dayNumberOf(d, i)) + '</span>' +
      '<span class="dp-info"><span class="dp-name">' + escHtml(dayGroupsLabel(d)) + '</span>' +
      '<span class="dp-meta">' + names.length + ' ejercicios · ' + status + '</span>' +
      '<span class="dp-segs">' + segs + '</span></span></button>';
  }).join('');

  const dateEl = document.getElementById('dpDate');
  if (dateEl) {
    const t = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    dateEl.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  }
}

function openDay(i){
  if (!DAYS[i]) return;
  currentDay = i;
  currentExIdx = 0;
  dayScreenOpen = true;
  document.getElementById('dayPicker').style.display = 'none';
  document.getElementById('dayScreen').style.display = '';
  renderDay();
  // Se abre en el primer ejercicio sin completar (o en el primero si ya están todos)
  const cards = exerciseCards();
  let first = cards.findIndex(c => !c.classList.contains('done'));
  if (first < 0) first = 0;
  goToExercise(first, true);
  document.documentElement.scrollTop = 0;
}

function showDayPicker(){
  if (typeof closeProgressSheet === 'function') closeProgressSheet();
  if (typeof Feel !== 'undefined') Feel.closeAll();
  dayScreenOpen = false;
  document.getElementById('dayScreen').style.display = 'none';
  document.getElementById('dayPicker').style.display = '';
  renderDayPicker();
  document.documentElement.scrollTop = 0;
}

// ---------- Carrusel ----------
function exerciseCards(){
  return Array.prototype.slice.call(document.querySelectorAll('#main > .card'));
}

function goToExercise(i, instant){
  const main = document.getElementById('main');
  const cards = exerciseCards();
  if (!cards.length) { currentExIdx = 0; renderStrip(); return; }
  i = Math.max(0, Math.min(cards.length - 1, i));
  currentExIdx = i;
  const card = cards[i];
  const left = card.offsetLeft - (main.clientWidth - card.offsetWidth) / 2;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (main.scrollTo) main.scrollTo({ left: left, behavior: (instant || reduce) ? 'auto' : 'smooth' });
  else main.scrollLeft = left;
  renderStrip();
}

// Tras redibujar el día (p. ej. al añadir un ejercicio prestado) se vuelve al ejercicio en el que se estaba
function restoreExerciseScroll(){
  if (!dayScreenOpen) return;
  goToExercise(currentExIdx, true);
}

function renderStrip(){
  const strip = document.getElementById('exStrip');
  const pos = document.getElementById('exPos');
  if (!strip || !dayScreenOpen) return;
  const day = DAYS[currentDay];
  const cards = exerciseCards();
  strip.innerHTML = cards.map((c, i) => {
    const name = c.getAttribute('data-exercise');
    const dia = c.getAttribute('data-borrow-dia') || day.name;
    const st = exState(weeklySeriesCount(dia, name));
    return '<button type="button" role="tab" class="' + st + (i === currentExIdx ? ' cur' : '') + '" onclick="goToExercise(' + i + ')" ' +
      'aria-label="' + escHtml(name) + '" aria-selected="' + (i === currentExIdx) + '"><i></i></button>';
  }).join('');
  if (pos) {
    const cur = cards[currentExIdx];
    pos.textContent = cards.length ? 'Ejercicio ' + (currentExIdx + 1) + ' de ' + cards.length + ' · ' + cur.getAttribute('data-exercise') : '';
  }
}

(function watchCarouselScroll(){
  const main = document.getElementById('main');
  if (!main) return;
  let raf = 0;
  main.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const cards = exerciseCards();
      if (!cards.length) return;
      const mid = main.scrollLeft + main.clientWidth / 2;
      let best = 0, bestDist = Infinity;
      cards.forEach((c, i) => {
        const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      if (best !== currentExIdx) { currentExIdx = best; renderStrip(); }
    });
  }, { passive: true });
})();
