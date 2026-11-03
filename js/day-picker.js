// =====================================================================
// Elegir día y navegar entre ejercicios  (day-picker.js)
// Pantalla inicial "¿Qué día entrenas?" (una ficha por día) y, ya dentro de un día, la tira
// de progreso con un segmento por ejercicio y el desplazamiento del carrusel.
// Las animaciones (cascada de fichas, expansión al elegir día) usan transform/opacity y se
// omiten con "reducir movimiento". Las pantallas se refrescan EN SITIO (no se reconstruyen)
// para que una actualización de datos no repita la animación.
// Depende de: day-view (isDayComplete, isDayStarted, weeklySeriesCount, renderDay),
//             planning (effectiveDayGroups), routine (DAYS, currentDay), utils, motion.
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

// Reinicia una animación de entrada (clase en el contenedor) y la retira al terminar,
// para que los refrescos posteriores no la repitan.
function playIntroClass(el, cls, ms){
  if (!el || !motionOK()) return;
  clearTimeout(el['_t' + cls]);
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el['_t' + cls] = setTimeout(() => el.classList.remove(cls), ms);
}

function playPickerIntro(){ playIntroClass(document.getElementById('dayPicker'), 'dp-play', 1900); }

function dayTileData(d, i, sug){
  const names = dayExerciseNames(d);
  const counts = names.map(n => weeklySeriesCount(d.name, n));
  const done = counts.filter(c => c >= 3).length;
  const any = counts.filter(c => c > 0).length;
  const status = done === names.length && names.length > 0 ? 'Completo' : (any ? 'Empezado · ' + done + '/' + names.length : 'Pendiente');
  return {
    meta: names.length + ' ejercicios · ' + status,
    segs: counts.map((c, k) => '<i class="' + exState(c) + '" style="--k:' + k + '"></i>').join(''),
    aria: 'Día ' + dayNumberOf(d, i) + ', ' + dayGroupsLabel(d) + ', ' + status,
    sug: i === sug,
  };
}

function renderDayPicker(){
  const grid = document.getElementById('dpGrid');
  if (!grid) return;
  const sug = suggestedDayIdx();
  const sig = DAYS.map(d => d.name).join('|');

  if (grid.dataset.sig !== sig) {
    // Primera vez, o la rutina cambió (renombrar / añadir días): se construyen las fichas
    grid.dataset.sig = sig;
    grid.innerHTML = DAYS.map((d, i) => {
      const t = dayTileData(d, i, sug);
      const wide = (DAYS.length % 2 === 1 && i === DAYS.length - 1) ? ' dp-wide' : '';
      return '<button type="button" class="dp-tile' + wide + (t.sug ? ' dp-sug' : '') + '" style="--c:' + dayColorVar(i) + ';--i:' + i + '" onclick="openDayAnimated(' + i + ', this)" aria-label="' + escHtml(t.aria) + '">' +
        (t.sug ? '<span class="dp-tag">Toca hoy</span>' : '') +
        '<span class="dp-num">' + escHtml(dayNumberOf(d, i)) + '</span>' +
        '<span class="dp-info"><span class="dp-name">' + escHtml(dayGroupsLabel(d)) + '</span>' +
        '<span class="dp-meta">' + escHtml(t.meta) + '</span>' +
        '<span class="dp-segs">' + t.segs + '</span></span></button>';
    }).join('');
  } else {
    // Solo cambió el estado semanal: se actualiza lo que haga falta sin reconstruir (no se repite la animación)
    Array.prototype.forEach.call(grid.children, (tile, i) => {
      const t = dayTileData(DAYS[i], i, sug);
      const meta = tile.querySelector('.dp-meta');
      if (meta && meta.textContent !== t.meta) meta.textContent = t.meta;
      const segs = tile.querySelector('.dp-segs');
      if (segs) {
        const cur = Array.prototype.map.call(segs.children, s => s.className).join(',');
        const next = (t.segs.match(/class="(\w+)"/g) || []).map(s => s.slice(7, -1)).join(',');
        if (cur !== next) segs.innerHTML = t.segs;
      }
      tile.setAttribute('aria-label', t.aria);
      tile.classList.toggle('dp-sug', t.sug);
      const tag = tile.querySelector('.dp-tag');
      if (t.sug && !tag) tile.insertAdjacentHTML('afterbegin', '<span class="dp-tag">Toca hoy</span>');
      if (!t.sug && tag) tag.remove();
    });
  }

  const dateEl = document.getElementById('dpDate');
  if (dateEl) {
    const t = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    dateEl.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  }
}

// ---------- Abrir y cerrar un día ----------
function setInDay(on){ document.body.classList.toggle('in-day', !!on); }

// Apertura inmediata (la usan los tests y el modo "reducir movimiento")
function openDay(i){
  if (!DAYS[i]) return;
  currentDay = i;
  currentExIdx = 0;
  dayScreenOpen = true;
  setInDay(true);
  document.getElementById('dayPicker').style.display = 'none';
  document.getElementById('dayScreen').style.display = '';
  renderDay();
  // Se abre en el primer ejercicio sin completar (o en el primero si ya están todos)
  const cards = exerciseCards();
  let first = cards.findIndex(c => !c.classList.contains('done'));
  if (first < 0) first = 0;
  goToExercise(first, true);
  document.documentElement.scrollTop = 0;
  playIntroClass(document.getElementById('dayScreen'), 'day-play', 1500);
}

// Apertura con transición: la ficha se expande a pantalla completa y se funde con el día
function openDayAnimated(i, tile){
  if (!tile || !motionOK() || document.querySelector('.dp-wipe')) return openDay(i);
  const rect = tile.getBoundingClientRect();
  const wipe = document.createElement('div');
  wipe.className = 'dp-wipe';
  wipe.style.setProperty('--c', dayColorVar(i));
  wipe.style.left = rect.left + 'px'; wipe.style.top = rect.top + 'px';
  wipe.style.width = rect.width + 'px'; wipe.style.height = rect.height + 'px';
  const clone = tile.cloneNode(true);                    // la ficha tal cual está: la expansión nace sin saltos
  clone.removeAttribute('onclick'); clone.classList.remove('dp-sug'); clone.classList.add('dp-clone');
  clone.style.width = rect.width + 'px'; clone.style.height = rect.height + 'px';
  wipe.appendChild(clone);
  wipe.insertAdjacentHTML('beforeend', '<div class="dp-wipe-num">' + escHtml(dayNumberOf(DAYS[i], i)) + '</div><div class="dp-wipe-name">' + escHtml(dayGroupsLabel(DAYS[i])) + '</div>');
  document.body.appendChild(wipe);
  void wipe.offsetWidth;
  requestAnimationFrame(() => {
    wipe.classList.add('full');
    wipe.style.left = '0px'; wipe.style.top = '0px';
    wipe.style.width = window.innerWidth + 'px'; wipe.style.height = window.innerHeight + 'px';
    wipe.style.borderRadius = '0px';
  });
  setTimeout(() => {                                     // con la pantalla cubierta se cambia al día
    openDay(i);
    wipe.classList.add('out');
    setTimeout(() => { if (wipe.parentNode) wipe.parentNode.removeChild(wipe); }, 350);
  }, 560);
}

function showDayPicker(){
  if (typeof closeProgressSheet === 'function') closeProgressSheet();
  if (typeof Feel !== 'undefined') Feel.closeAll();
  dayScreenOpen = false;
  setInDay(false);
  document.getElementById('dayScreen').style.display = 'none';
  document.getElementById('dayPicker').style.display = '';
  renderDayPicker();
  playPickerIntro();
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
  if (main.scrollTo) main.scrollTo({ left: left, behavior: (instant || !motionOK()) ? 'auto' : 'smooth' });
  else main.scrollLeft = left;
  renderStrip();
}

// Tras redibujar el día (p. ej. al añadir un ejercicio prestado) se vuelve al ejercicio en el que se estaba
function restoreExerciseScroll(){
  if (!dayScreenOpen) return;
  goToExercise(currentExIdx, true);
}

// La tira se actualiza en sitio: si hay los mismos segmentos solo cambian clases (sin repetir animaciones)
function renderStrip(){
  const strip = document.getElementById('exStrip');
  const pos = document.getElementById('exPos');
  if (!strip || !dayScreenOpen) return;
  const day = DAYS[currentDay];
  const cards = exerciseCards();
  const states = cards.map(c => exState(weeklySeriesCount(c.getAttribute('data-borrow-dia') || day.name, c.getAttribute('data-exercise'))));
  if (strip.children.length !== cards.length) {
    strip.innerHTML = cards.map((c, i) =>
      '<button type="button" role="tab" style="--i:' + i + '" onclick="goToExercise(' + i + ')"><i></i></button>').join('');
  }
  Array.prototype.forEach.call(strip.children, (b, i) => {
    b.className = states[i] + (i === currentExIdx ? ' cur' : '');
    b.setAttribute('aria-selected', i === currentExIdx ? 'true' : 'false');
    b.setAttribute('aria-label', cards[i].getAttribute('data-exercise') + ', ' + ({ done: 'completado', warn: 'empezado', none: 'sin empezar' })[states[i]]);
  });
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
