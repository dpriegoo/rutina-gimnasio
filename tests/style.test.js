// Comprobaciones estáticas del CSS/HTML: legibilidad, contraste, zoom y movimiento.
//   npm test
// Evitan que se cuelen de nuevo texto diminuto, botones con poco contraste o animaciones que
// ignoran "reducir movimiento".
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const lum = hex => { const h = hex.replace('#', ''); const v = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const token = n => { const m = css.match(new RegExp('--' + n + '\\s*:\\s*(#[0-9a-fA-F]{6})')); assert(m, 'falta el token --' + n); return m[1]; };

// 1) Contraste (WCAG AA = 4,5:1 en texto normal)
assert(ratio('#ffffff', token('blue-btn')) >= 4.5, 'texto blanco sobre --blue-btn debe tener >= 4,5:1');
assert(ratio(token('blue-text'), token('card')) >= 4.5, '--blue-text sobre la tarjeta debe tener >= 4,5:1');
assert(ratio(token('blue-text'), token('icon-bg')) >= 4.5, '--blue-text sobre --icon-bg debe tener >= 4,5:1');
assert(ratio(token('muted'), token('card')) >= 4.5, '--muted sobre la tarjeta debe tener >= 4,5:1');
assert(ratio(token('red'), token('card')) >= 4.5, '--red sobre la tarjeta debe tener >= 4,5:1');
// ningún botón con texto blanco usa el azul puro (3,9:1)
const bad = [];
css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sel, body) => { if (/background:\s*var\(--blue\)\s*;/.test(body) && /color:\s*(#fff|var\(--on-accent\))/.test(body)) bad.push(sel.trim()); return m; });
assert.deepStrictEqual(bad, [], 'fondos azules con texto blanco deben usar --blue-btn: ' + bad.join(' | '));

// 2) Ningún texto por debajo de 11 px
const tiny = (css.match(/font-size:\s*[\d.]+px/g) || []).filter(x => parseFloat(x.split(':')[1]) < 11);
assert.deepStrictEqual(tiny, [], 'hay texto por debajo de 11 px: ' + tiny.join(', '));

// 3) Campos a 16 px (si no, iOS hace zoom automático al enfocar) y zona táctil mínima definida
assert(/html input:not\(\[type=checkbox\]\)[^{]*\{[^}]*font-size:\s*16px/.test(css), 'los campos deben ir a 16 px');
assert(/#main\.rail \.log-form-main input\{[^}]*font-size:\s*16px/.test(css), 'los campos de registro deben ir a 16 px');
assert(/--tap:\s*44px/.test(css), 'falta --tap: 44px');
assert(/\.viewtoggle button[^{]*\{[^}]*min-height:\s*var\(--tap\)/.test(css), 'las pestañas principales deben medir 44 px');

// 4) Zoom bloqueado (decisión de diseño)
const vp = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
assert(/maximum-scale=1/.test(vp) && /user-scalable=no/.test(vp), 'el viewport debe bloquear el zoom: ' + vp);
assert(/touch-action:\s*pan-x pan-y/.test(css), 'falta touch-action para bloquear el pellizco');

// 5) Todas las animaciones (@keyframes en uso) viven dentro de "prefers-reduced-motion: no-preference"
function blocks(src, header) {   // devuelve el contenido de cada bloque @media <header> {...} (con llaves anidadas)
  const out = []; let i = 0;
  while ((i = src.indexOf(header, i)) >= 0) {
    let depth = 0, j = src.indexOf('{', i), start = j + 1;
    for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
    out.push(src.slice(start, j)); i = j;
  }
  return out;
}
let outside = css;
blocks(css, '@media (prefers-reduced-motion:no-preference)').forEach(b => { outside = outside.split(b).join(''); });
// Excepción: geminiSpin es el indicador de carga del consejo de Gemini (funcional, no decorativo)
const anim = (outside.match(/[^;{}]*\banimation(-name)?\s*:[^;}]*/g) || []).map(x => x.trim())
  .filter(x => !/animation:\s*none/.test(x) && !/geminiSpin/.test(x));
assert.deepStrictEqual(anim, [], 'hay animaciones fuera del bloque que respeta "reducir movimiento": ' + anim.join(' | '));

// 6) Escalas de diseño cortas (antes: 24 tamaños de texto y 16 radios distintos)
const sizes = new Set((css.match(/font-size:\s*[\d.]+px/g) || []).map(x => parseFloat(x.split(':')[1])));
assert(sizes.size <= 16, 'demasiados tamaños de texto distintos (' + sizes.size + '): ' + [...sizes].sort((a, b) => a - b).join(', '));
const radii = new Set(); (css.match(/border-radius:\s*[^;}]+/g) || []).forEach(d => (d.match(/[\d.]+px/g) || []).forEach(v => radii.add(parseFloat(v))));
assert(radii.size <= 8, 'demasiados radios de borde distintos (' + radii.size + '): ' + [...radii].sort((a, b) => a - b).join(', '));
// 7) Colores: casi nada de literales fuera de las variables
let lits = 0; css.split('\n').forEach(l => { if (!/--[\w-]+\s*:\s*#/.test(l)) lits += (l.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length; });
assert(lits <= 12, 'demasiados colores literales fuera de variables (' + lits + ')');

console.log('OK style: contraste, tamaños mínimos, campos 16 px, zoom bloqueado y movimiento reducido');
