// =====================================================================
// Dónde sentir el esfuerzo  (feel.js)
// Parte visible: línea "SIENTE", silueta, y panel desplegable con la animación,
// el zoom del músculo, la parte a notar y las indicaciones.
// Depende de: utils (escHtml), feel-data, feel-anim.
// =====================================================================
const Feel = (function(){
const N='#323843',ST='#3a3f47',L={3:'var(--feel)',2:'rgba(255,107,87,.55)',1:'rgba(255,107,87,.25)',0:'#323843'};
// ---- silueta pequeña (la del diagrama actual) ----
// Silueta con zonas finas: intenso = trabajo principal, suave = apoyo. fine = [[principales],[apoyo]]
function mini(view, fine){
  const m = new Set(fine[0]), h = new Set(fine[1]);
  const colorOf = z => z === '_base' ? N : m.has(z) ? L[3] : h.has(z) ? L[1] : N;
  return '<svg viewBox="0 0 160 380">' + bodyMarkup(view, colorOf) + '</svg>';
}
function fineFor(key){
  const p = FEEL_PROFILES[key], f = FEEL_FINE[key];
  if (f) return f;
  const conv = zs => [].concat(...zs.map(z => bodyFineOf(p.view, z)));
  return [conv(p.main), conv(p.help)];
}
// ---- zoom del pecho (frente): 3 porciones del pectoral mayor + deltoides anterior + tríceps ----
function zoomChest(l,target){
 const half=(t)=>`
 <path d="M122,42 L194,48 L198,70 Q160,66 122,74 Z" fill="${L[l.upper]}" stroke="${ST}"/>
 <path d="M122,74 Q160,66 198,70 L196,94 Q160,92 122,104 Z" fill="${L[l.mid]}" stroke="${ST}"/>
 <path d="M122,104 Q160,92 196,94 L186,118 Q156,134 122,138 Z" fill="${L[l.lower]}" stroke="${ST}"/>
 <ellipse cx="210" cy="68" rx="15" ry="26" fill="${L[l.delt]}" stroke="${ST}"/>
 <rect x="206" y="92" width="18" height="70" rx="9" fill="${L[l.arm||0]}" stroke="${ST}"/>`;
 const ring={upper:'M122,42 L194,48 L198,70 Q160,66 122,74 Z',mid:'M122,74 Q160,66 198,70 L196,94 Q160,92 122,104 Z',lower:'M122,104 Q160,92 196,94 L186,118 Q156,134 122,138 Z'}[target];
 return `<svg viewBox="0 0 240 190"><path d="M30,24 Q120,10 210,24 L214,190 L26,190 Z" fill="#262b32" stroke="${ST}"/>
 <path d="M80,36 Q120,30 160,36" stroke="#5a616c" stroke-width="2" fill="none" stroke-dasharray="3 3"/>
 <line x1="120" y1="38" x2="120" y2="140" stroke="#5a616c" stroke-width="2"/>
 <g>${half()}</g><g transform="translate(240,0) scale(-1,1)">${half()}</g>
 <g><path d="${ring}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"><animate attributeName="stroke-opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></path><path transform="translate(240,0) scale(-1,1)" d="${ring}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"><animate attributeName="stroke-opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></path></g>
 <text x="120" y="162" fill="#7c8490" font-size="9" text-anchor="middle">esternón</text><text x="120" y="30" fill="#7c8490" font-size="9" text-anchor="middle">clavícula</text></svg>`}
// ---- zoom de la espalda ----
function zoomBack(l,target){
 const half=()=>`
 <path d="M124,70 L152,78 L150,112 L124,112 Z" fill="${L[l.mid]}" stroke="${ST}"/>
 <path d="M128,116 L154,102 Q192,98 204,80 Q210,124 178,160 Q152,172 128,168 Z" fill="${L[l.lats]}" stroke="${ST}"/>
 <ellipse cx="212" cy="62" rx="14" ry="18" fill="${L[l.rear]}" stroke="${ST}"/>
 <rect x="208" y="84" width="18" height="70" rx="9" fill="${L[l.arm||0]}" stroke="${ST}"/>`;
 const ring={lats:'M128,116 L154,102 Q192,98 204,80 Q210,124 178,160 Q152,172 128,168 Z',mid:'M124,70 L152,78 L150,112 L124,112 Z'}[target];
 return `<svg viewBox="0 0 240 190"><path d="M30,24 Q120,10 210,24 L214,190 L26,190 Z" fill="#262b32" stroke="${ST}"/>
 <path d="M120,28 L176,52 L120,100 L64,52 Z" fill="${L[l.trap]}" stroke="${ST}"/>
 <line x1="120" y1="30" x2="120" y2="176" stroke="#5a616c" stroke-width="2"/>
 <g>${half()}</g><g transform="translate(240,0) scale(-1,1)">${half()}</g>
 <g fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"><path d="${ring}"><animate attributeName="stroke-opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></path><path transform="translate(240,0) scale(-1,1)" d="${ring}"><animate attributeName="stroke-opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></path></g>
 <text x="120" y="184" fill="#7c8490" font-size="9" text-anchor="middle">columna</text></svg>`}
const fillLabel = {3:'var(--feel)',2:'rgba(255,107,87,.55)',1:'rgba(255,107,87,.25)',0:'#323843'};
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const stops = {};   // logId -> función para parar su animación

// Silueta grande para los ejercicios sin dibujo de zoom propio
function zoomBody(p, key){
  return '<div class="feel-bodyzoom">' + mini(p.view, fineFor(key)).replace('<svg ', '<svg class="feel-bigsil" ') +
    '<div class="feel-bodynote">' + (p.view==='back' ? 'Vista trasera' : 'Vista frontal') + '<br><b>' + fineFor(key)[0].map(z => BODY_FINE_LABEL[z]).join(', ') + '</b><br><span>coral intenso = trabajo principal<br>coral suave = apoyo</span></div></div>';
}

function keyFor(ex){
  if (!ex) return null;
  if (ex.feel && FEEL_PROFILES[ex.feel]) return ex.feel;
  const names = [ex.name].concat(ex.aliases || []).map(norm);
  for (const k in FEEL_PROFILES) { if (FEEL_PROFILES[k].names.some(n => names.indexOf(n) >= 0)) return k; }
  const k = FEEL_ICON_DEFAULT[ex.icon];
  return k && FEEL_PROFILES[k] ? k : null;
}
function profileFor(ex){ const k = keyFor(ex); return k ? FEEL_PROFILES[k] : null; }

// Parte fija de la tarjeta: línea SIENTE + silueta
function summaryHTML(ex, logId){
  const key = keyFor(ex), p = key && FEEL_PROFILES[key]; if (!p) return { row:'', mini:'', more:'' };
  const row = `<div class="feelrow" onclick="toggleFeel('${logId}')"><span class="tag feel">SIENTE</span><b>${escHtml(p.mainTxt)}</b></div>` +
              (p.helpTxt ? `<div class="feel-help">${escHtml(p.helpTxt)}</div>` : '');
  const mn = `<button type="button" class="minibox" onclick="toggleFeel('${logId}')" title="Ver dónde sentirlo"><span class="chev">▼</span>${mini(p.view, fineFor(key))}<small>${p.view==='back'?'ESPALDA':'FRENTE'}</small><span class="zoomhint">ver zoom</span></button>`;
  return { row, mini: mn, more: `<div class="feel-more" id="fm-${logId}" data-key="${key}"></div>` };
}

function detailHTML(p, logId, key){
  const z = p.zoom || {type:'body'};
  const zoomSvg = z.type==='chest' ? zoomChest(z.levels, z.target) : z.type==='back' ? zoomBack(z.levels, z.target) : zoomBody(p, key);
  const anim = FeelAnim.has(p.anim) ? `<div class="zoomtitle">Movimiento</div><div class="zoom anim"><svg id="fa-${logId}" viewBox="0 0 300 200"></svg><div class="phase" id="fph-${logId}"></div><div class="tempo" id="ftp-${logId}"></div></div>` : '';
  const parts = (p.parts||[]).map(x => `<div class="part ${x[1]===3?'target':''}"><i style="background:${fillLabel[x[1]]}"></i><span>${x[2]}</span><em>${x[3]}</em></div>`).join('');
  return `<div class="zoomwrap">${anim}
    <div class="zoomtitle" style="margin-top:14px">${escHtml(z.title || 'Músculo')}</div><div class="zoom">${zoomSvg}</div>
    <div class="parts">${parts}</div>
    <div class="focus">${p.focus}</div>
    <div class="zoomtitle" style="margin-top:14px">Cómo conseguirlo</div><ul class="cues">${p.cues.map(c=>`<li><span>${c}</span></li>`).join('')}</ul>
    <div class="hint">${p.warn}</div><div class="fine">Guía general de técnica: la sensación varía con la máquina, la variante y tu anatomía.</div></div>`;
}

function closeAll(except){
  document.querySelectorAll('.feel-more.open').forEach(m => {
    if (m.id === 'fm-' + except) return;
    m.classList.remove('open'); const id = m.id.slice(3);
    if (stops[id]) { stops[id](); delete stops[id]; }
    const c = m.closest('.card'); if (c) c.classList.remove('feel-open');
  });
}

function toggle(logId){
  const m = document.getElementById('fm-' + logId); if (!m) return;
  const card = m.closest('.card');
  const was = m.classList.contains('open');
  closeAll(was ? null : logId);
  if (was) { m.classList.remove('open'); card.classList.remove('feel-open'); if (stops[logId]) { stops[logId](); delete stops[logId]; } return; }
  const p = FEEL_PROFILES[m.dataset.key]; if (!p) return;
  if (!m.firstChild) m.innerHTML = detailHTML(p, logId, m.dataset.key);
  m.classList.add('open'); card.classList.add('feel-open');
  if (FeelAnim.has(p.anim)) {
    const svg = document.getElementById('fa-' + logId);
    stops[logId] = FeelAnim.start(p.anim, svg, document.getElementById('fph-' + logId), document.getElementById('ftp-' + logId));
  }
}

return { keyFor, profileFor, summaryHTML, toggle, closeAll, profiles: () => FEEL_PROFILES };
})();
function toggleFeel(logId){ Feel.toggle(logId); }
