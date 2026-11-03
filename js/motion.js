// =====================================================================
// Movimiento y gestos  (motion.js)
// - Bloqueo de zoom (pellizco y doble toque): decisión de diseño, app de uso con una mano.
// - Entrada a la app: barra con discos (los colores de cada día) que cae y se eleva.
// Se carga el primero tras config para que la entrada salga cuanto antes; no depende de nada.
// Todo el movimiento se omite si el sistema pide "reducir movimiento".
// =====================================================================

function motionOK(){
  try { return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (e) { return true; }
}

// ---- Sin zoom ----
// Safari de iOS ignora user-scalable=no en el viewport; estos gestos cubren el pellizco.
// (El zoom automático al enfocar un campo se evita con campos de 16 px, ver styles.css.)
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });

// ---- Entrada a la app ----
const INTRO_MS = 1500;

function introSvg(){
  // Barra de 260 de ancho; discos de fuera hacia dentro, con los colores de los días (--d1…--d5)
  const plate = (x, y, w, h, c, k) => '<rect class="sp-plate" style="--k:' + k + ';fill:var(--d' + c + ')" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4"/>';
  return '<svg class="sp-svg" viewBox="0 0 260 110" aria-hidden="true"><g class="sp-lift">' +
    '<rect class="sp-bar" x="12" y="51" width="236" height="8" rx="4"/>' +
    plate(44, 12, 14, 86, 1, 0) + plate(60, 22, 12, 66, 2, 1) + plate(74, 32, 10, 46, 3, 2) +
    plate(202, 12, 14, 86, 5, 0) + plate(188, 22, 12, 66, 4, 1) + plate(176, 32, 10, 46, 3, 2) +
    '</g></svg>';
}

function skipIntro(){
  const el = document.getElementById('introSplash');
  if (!el) return;
  clearTimeout(window._introTimer);
  el.classList.add('out');
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
  if (typeof playPickerIntro === 'function') playPickerIntro();   // las fichas entran justo al abrirse el telón
}

(function introSplash(){
  try {
    if (!motionOK()) return;
    if (sessionStorage.getItem('ironlogIntro')) return;                                   // una vez por sesión del navegador
    if (!(localStorage.getItem('profile') && localStorage.getItem('sessionToken'))) return; // sin sesión sale el login
    sessionStorage.setItem('ironlogIntro', '1');
  } catch (e) { return; }
  const el = document.createElement('div');
  el.id = 'introSplash';
  el.innerHTML = introSvg() + '<div class="sp-word">IRONLOG</div><div class="sp-sub">Rutina de fuerza</div>';
  el.addEventListener('click', skipIntro);   // un toque la salta
  document.body.appendChild(el);
  window._introTimer = setTimeout(skipIntro, INTRO_MS);
})();
