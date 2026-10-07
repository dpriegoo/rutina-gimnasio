// =====================================================================
// Carga muscular  (muscles.js)
// Zonas musculares, mapa ejercicio->zona y cálculo/diagrama de carga semanal
// (frente/espalda).
// Depende de: utils, routine.
// =====================================================================

// ---- Carga muscular semanal (diagrama frente/espalda) ----
const MUSCLE_ZONES = {
  pectoral: { label: 'Pectoral', groups: ['Pectoral'] },
  hombros:  { label: 'Hombros / Deltoides', groups: ['Deltoides', 'Hombros'] },
  biceps:   { label: 'Bíceps', groups: ['Bíceps'] },
  triceps:  { label: 'Tríceps', groups: ['Tríceps'] },
  dorsales: { label: 'Dorsales', groups: ['Dorsales'] },
  core:     { label: 'Core', groups: ['Core'] },
  piernas:  { label: 'Piernas', groups: ['Piernas'] },
};

const MUSCLE_LOAD_LEVELS = [
  { label: 'Sin carga',     color: 'var(--card-border)' },
  { label: 'Carga baja',    color: '#1e3a72' },
  { label: 'Carga media',   color: '#274a94' },
  { label: 'Carga alta',    color: '#3f7cf0' },
  { label: 'Carga muy alta', color: '#8ab4ff' },
];

// El Día 5 guarda 2 ejercicios distintos bajo la etiqueta genérica "Brazos" en el
// Excel (para no tocar datos históricos ni la pestaña de rutina). Aquí, solo para
// este cálculo de volumen por zona, se resuelve cada ejercicio a su grupo real.
const EXERCISE_GROUP_OVERRIDES = {
  'Curl predicador bíceps': 'Bíceps',
  'Extensión de tríceps en polea': 'Tríceps',
};

function buildExerciseGroupMap(){
  // Se recorre la rutina completa (incluye ejercicios archivados) para que su historial siga resolviéndose.
  const map = {};
  const days = ROUTINE ? ROUTINE.days : DEFAULT_DAYS;
  days.forEach(day => day.groups.forEach(g => g.exercises.forEach(ex => {
    const label = ex.canonical || EXERCISE_GROUP_OVERRIDES[ex.name] || (g.label === 'Brazos' ? null : g.label);
    if (!label) return; // ambiguo sin zona explícita, se ignora para este cálculo
    [ex.name].concat(ex.aliases || []).forEach(n => {
      if (!map[day.name + '|' + n]) map[day.name + '|' + n] = label;
      if (!map[n]) map[n] = label;
    });
  })));
  return map;
}

let EXERCISE_GROUP_MAP = null;
 // se construye la primera vez que hace falta (DAYS aún no existe en este punto del script)
function getExerciseGroupMap(){
  if (!EXERCISE_GROUP_MAP) EXERCISE_GROUP_MAP = buildExerciseGroupMap();
  return EXERCISE_GROUP_MAP;
}

function preciseGroupForRow(r){
  const gm = getExerciseGroupMap();
  const fromExercise = gm[r['Día'] + '|' + r['Ejercicio']] || gm[r['Ejercicio']];
  if (fromExercise) return fromExercise;
  return r['Grupo'] !== 'Brazos' ? r['Grupo'] : null;
}

function computeMuscleLoad(profile){
  const cache = window._progressCache || [];
  const weekStart = getWeekStart();
  const rows = cache.filter(r => (r['Perfil'] || '') === profile && !isWarmupRow(r));
  const zoneKeys = Object.keys(MUSCLE_ZONES);

  const thisWeekVol = {}; zoneKeys.forEach(z => thisWeekVol[z] = 0);
  const histSum = {}; const histWeeks = {};
  zoneKeys.forEach(z => { histSum[z] = 0; histWeeks[z] = new Set(); });

  rows.forEach(r => {
    const g = preciseGroupForRow(r);
    if (!g) return;
    const zoneKey = zoneKeys.find(z => MUSCLE_ZONES[z].groups.includes(g));
    if (!zoneKey) return;
    const f = parseLocalDate(r['Fecha']);
    const vol = rowVolume(r);
    if (f >= weekStart) {
      thisWeekVol[zoneKey] += vol;
    } else {
      histSum[zoneKey] += vol;
      histWeeks[zoneKey].add(localDateStr(mondayOf(f)));
    }
  });

  const maxThisWeek = Math.max(0, ...zoneKeys.map(z => thisWeekVol[z]));

  const result = {};
  zoneKeys.forEach(z => {
    const vol = thisWeekVol[z];
    if (vol <= 0) { result[z] = Object.assign({ level: 0, vol: 0 }, MUSCLE_LOAD_LEVELS[0]); return; }
    const n = histWeeks[z].size;
    const histAvg = n > 0 ? histSum[z] / n : null;
    let level;
    if (histAvg && histAvg > 0) {
      const ratio = vol / histAvg;
      if (ratio < 0.6) level = 1;
      else if (ratio <= 1.3) level = 2;
      else if (ratio <= 1.7) level = 3;
      else level = 4;
    } else {
      const ratio = maxThisWeek > 0 ? vol / maxThisWeek : 1;
      if (ratio < 0.4) level = 1;
      else if (ratio < 0.75) level = 2;
      else level = 3;
    }
    result[z] = Object.assign({ level: level, vol: vol }, MUSCLE_LOAD_LEVELS[level]);
  });
  return result;
}

let currentMuscleView = 'front';

function setMuscleView(view){
  currentMuscleView = view;
  document.getElementById('muscleSvgFront').style.display = view === 'front' ? 'block' : 'none';
  document.getElementById('muscleSvgBack').style.display = view === 'back' ? 'block' : 'none';
  document.getElementById('muscleViewBtnFront').classList.toggle('active', view === 'front');
  document.getElementById('muscleViewBtnBack').classList.toggle('active', view === 'back');
}

function renderMuscleLoad(){
  const listEl = document.getElementById('muscleLoadList');
  if (!listEl) return;
  const profile = getProfile();
  if (!profile) { listEl.innerHTML = ''; return; }

  const load = computeMuscleLoad(profile);
  const setFill = (id, color) => { const el = document.getElementById(id); if (el) el.setAttribute('fill', color); };

  setFill('zone-pectoral', load.pectoral.color);
  setFill('zone-core', load.core.color);
  setFill('zone-dorsales', load.dorsales.color);
  ['L', 'R'].forEach(side => {
    setFill('zone-hombros-front-' + side, load.hombros.color);
    setFill('zone-hombros-back-' + side, load.hombros.color);
    setFill('zone-biceps-' + side, load.biceps.color);
    setFill('zone-triceps-' + side, load.triceps.color);
    setFill('zone-piernas-front-' + side, load.piernas.color);
    setFill('zone-piernas-back-' + side, load.piernas.color);
  });

  listEl.innerHTML = Object.keys(MUSCLE_ZONES).map(z => `
    <div class="muscle-legend-row">
      <span class="muscle-dot" style="background:${load[z].color}"></span>
      <span class="muscle-zone-name">${MUSCLE_ZONES[z].label}</span>
      <span class="muscle-zone-status">${load[z].label}</span>
    </div>
  `).join('');
}

const ICON_TO_ZONE = {
  barbellBench: 'libre', inclineDumbbell: 'libre', barbellRow: 'libre', preacherCurl: 'libre',
  squatRack: 'libre', dumbbells: 'libre', lunge: 'libre',
  pecDeck: 'maquina', reversePecDeck: 'maquina', latPulldown: 'maquina', seatedRow: 'maquina',
  legPress: 'maquina', legExtension: 'maquina', legCurl: 'maquina', shoulderPress: 'maquina', abBench: 'maquina',
  cableHigh: 'polea', cableLow: 'polea', pullover: 'polea',
  floorMat: 'suelo',
};

const ZONE_META = {
  libre:   { label: 'Zona de peso libre', icon: '🏋️', color: 'rgba(63,124,240,0.28)' },
  maquina: { label: 'Zona de máquinas',   icon: '⚙️', color: 'rgba(242,169,59,0.28)' },
  polea:   { label: 'Zona de poleas',     icon: '🔗', color: 'rgba(76,175,125,0.28)' },
  suelo:   { label: 'Zona de suelo',      icon: '🧘', color: 'rgba(167,139,250,0.28)' },
};
