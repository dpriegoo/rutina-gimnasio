// =====================================================================
// Iconos de la interfaz  (ui-icons.js)
// Iconos SVG de trazo propios (no emojis: se ven igual en todos los sistemas y heredan el color del texto).
// uiIcon('nombre') devuelve el SVG; hydrateIcons(raíz) rellena los <span data-ic="nombre"> del HTML estático.
// Sin dependencias.
// =====================================================================

const UI_ICONS = {
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  clipboard: '<path d="M9 4h6v3H9zM7 5.5H5.5A1.5 1.5 0 0 0 4 7v12.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H17M8 12h8M8 16h5"/>',
  compare: '<path d="M3 12h4v8H3zM10 4h4v16h-4zM17 9h4v11h-4z"/>',
  swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  chevU: '<path d="M6 15l6-6 6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  share: '<path d="M12 16V4M7 8l5-5 5 5M5 14v5h14v-5"/>',
  copy: '<path d="M9 9h10v11H9zM5 15V4h10"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 3h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 13v4M8 20h8"/>',
  zoneLibre: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  zoneMaquina: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M8 15v4"/>',
  zonePolea: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  zoneSuelo: '<path d="M3 17h18M5 17V9a4 4 0 0 1 8 0v8M17 17v-4"/>',
  play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  logo: '',
};

function uiIcon(name, cls){
  const p = UI_ICONS[name] || '';
  return '<svg class="ui-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
}

// Logotipo: una barra con discos en los colores de los cinco días
function uiLogo(w){
  const h = Math.round(w * 72 / 168);
  return '<svg class="ui-logo" viewBox="0 0 168 72" width="' + w + '" height="' + h + '" aria-hidden="true">' +
    '<rect x="8" y="32" width="152" height="8" rx="4" fill="#cfd6e0"/>' +
    '<rect x="30" y="8" width="14" height="56" rx="4" fill="#7ba2f7"/><rect x="46" y="16" width="12" height="40" rx="4" fill="#3cc0cc"/><rect x="60" y="24" width="10" height="24" rx="3" fill="#f09060"/>' +
    '<rect x="124" y="8" width="14" height="56" rx="4" fill="#e888b9"/><rect x="110" y="16" width="12" height="40" rx="4" fill="#a995ff"/><rect x="98" y="24" width="10" height="24" rx="3" fill="#f09060"/></svg>';
}

function hydrateIcons(root){
  (root || document).querySelectorAll('[data-ic]').forEach(el => {
    const n = el.getAttribute('data-ic');
    if (n === 'logo') el.innerHTML = uiLogo(Number(el.getAttribute('data-w')) || 34);
    else el.innerHTML = uiIcon(n);
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrateIcons());
  else hydrateIcons();
}
