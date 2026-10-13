// =====================================================================
// Silueta del cuerpo  (body-svg.js)
// Dibuja el cuerpo (frente o espalda) con zonas musculares finas. Lo usan la
// carga muscular semanal y las fichas "dónde sentir".
//   bodyMarkup(view, colorOf)  -> contenido SVG (viewBox 0 0 160 380)
//   BODY_FINE_TO_COARSE        -> a qué zona gruesa de la carga semanal pertenece cada zona fina
// Sin dependencias.
// =====================================================================
const BODY_FINE = {
  front: ['trap','delt','pecho','biceps','antebrazo','abs','oblicuos','cuadriceps','aductores','gemelo'],
  back:  ['trap','delt','dorsal','espalda_media','lumbar','triceps','antebrazo','gluteo','femoral','gemelo'],
};
const BODY_FINE_LABEL = {
  trap:'Trapecio', delt:'Deltoides', pecho:'Pectoral', biceps:'Bíceps', antebrazo:'Antebrazo', abs:'Abdomen', oblicuos:'Oblicuos',
  cuadriceps:'Cuádriceps', aductores:'Aductores', gemelo:'Gemelo', dorsal:'Dorsal ancho', espalda_media:'Espalda media',
  lumbar:'Lumbar', triceps:'Tríceps', gluteo:'Glúteo', femoral:'Femoral',
};
// Zona gruesa (la de MUSCLE_ZONES) a la que suma cada zona fina. El antebrazo sigue al brazo que se ve en esa vista.
const BODY_FINE_TO_COARSE = {
  front: { trap:'dorsales', delt:'hombros', pecho:'pectoral', biceps:'biceps', antebrazo:'biceps', abs:'core', oblicuos:'core', cuadriceps:'piernas', aductores:'piernas', gemelo:'piernas' },
  back:  { trap:'dorsales', delt:'hombros', dorsal:'dorsales', espalda_media:'dorsales', lumbar:'core', triceps:'triceps', antebrazo:'triceps', gluteo:'piernas', femoral:'piernas', gemelo:'piernas' },
};
// Equivalencia inversa: de una zona gruesa a las zonas finas que se pintan
function bodyFineOf(view, coarse){
  const m = BODY_FINE_TO_COARSE[view], out = [];
  Object.keys(m).forEach(f => { if (m[f] === coarse) out.push(f); });
  return out;
}
function bodyMarkup(view, colorOf){
  const ST = 'stroke="#3a3f47" stroke-width="1"';
  const mirror = s => `<g transform="matrix(-1 0 0 1 160 0)">${s}</g>`;
  const pair = s => s + mirror(s);
  const Z = (z, shape, attrs) => shape.replace('/>', ` fill="${colorOf(z)}" ${ST} data-z="${z}"${attrs || ''}/>`);
  const ell = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  const rect = (x, y, w, h, r) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
  const path = d => `<path d="${d}"/>`;
  const neutral = colorOf('_base');
  let s = `<circle cx="80" cy="24" r="20" fill="${neutral}" ${ST}/><rect x="72" y="40" width="16" height="12" fill="${neutral}"/>` +
          `<path d="M54,52 L106,52 L100,186 L60,186 Z" fill="${neutral}" ${ST}/>`;
  if (view === 'front') {
    s += Z('trap', path('M68,42 L92,42 L108,54 L52,54 Z')) +
         Z('pecho', path('M52,54 Q80,46 108,54 L106,92 Q80,100 54,92 Z')) +
         Z('abs', path('M64,96 Q80,100 96,96 L95,176 Q80,184 65,176 Z')) +
         pair(Z('oblicuos', path('M54,94 L63,96 L64,176 L58,172 Q52,134 54,94 Z'))) +
         pair(Z('delt', ell(40,62,15,14))) +
         pair(Z('biceps', rect(18,70,24,54,12))) + pair(Z('antebrazo', rect(19,127,22,62,11))) +
         pair(Z('cuadriceps', rect(50,186,26,88,13))) + pair(Z('aductores', rect(67,192,9,70,4))) +
         pair(Z('gemelo', rect(53,278,21,84,10.5)));
  } else {
    s += Z('trap', path('M80,42 L110,56 L80,98 L50,56 Z')) +
         pair(Z('dorsal', path('M52,64 Q48,92 58,116 L74,118 L72,90 Z'))) +
         Z('espalda_media', path('M72,70 L88,70 L90,100 L80,108 L70,100 Z')) +
         Z('lumbar', path('M68,118 L92,118 L94,152 L66,152 Z')) +
         pair(Z('delt', ell(40,64,15,14))) +
         pair(Z('triceps', rect(18,70,24,54,12))) + pair(Z('antebrazo', rect(19,127,22,62,11))) +
         pair(Z('femoral', rect(50,186,26,88,13))) + pair(Z('gluteo', ell(67,172,16,15))) +
         pair(Z('gemelo', rect(53,278,21,84,10.5)));
  }
  return s;
}
