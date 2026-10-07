// =====================================================================
// Iconos  (icons.js)
// Pictogramas SVG de los ejercicios y sus etiquetas.
// Sin dependencias.
// =====================================================================

// ---- Schematic icons (simple pictograms, not photos) ----
const ICONS = {
  barbellBench: `<svg viewBox="0 0 40 40"><rect x="10" y="24" width="20" height="5" rx="1"/><line x1="4" y1="14" x2="36" y2="14"/><rect x="4" y="11" width="6" height="6" rx="1"/><rect x="30" y="11" width="6" height="6" rx="1"/><line x1="12" y1="29" x2="12" y2="34"/><line x1="28" y1="29" x2="28" y2="34"/></svg>`,
  inclineDumbbell: `<svg viewBox="0 0 40 40"><rect x="12" y="14" width="6" height="20" rx="1" transform="rotate(-25 15 24)"/><circle cx="10" cy="12" r="3"/><circle cx="26" cy="12" r="3"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="23" y1="12" x2="29" y2="12"/></svg>`,
  pecDeck: `<svg viewBox="0 0 40 40"><rect x="16" y="10" width="8" height="20" rx="2"/><path d="M16 16 C8 14 4 20 8 24" /><path d="M24 16 C32 14 36 20 32 24" /><circle cx="20" cy="34" r="2"/></svg>`,
  reversePecDeck: `<svg viewBox="0 0 40 40"><rect x="16" y="10" width="8" height="20" rx="2"/><path d="M8 14 C4 20 8 24 16 22" /><path d="M32 14 C36 20 32 24 24 22" /><circle cx="20" cy="34" r="2"/></svg>`,
  cableHigh: `<svg viewBox="0 0 40 40"><line x1="8" y1="4" x2="8" y2="36"/><line x1="32" y1="4" x2="32" y2="36"/><circle cx="8" cy="8" r="2.5"/><circle cx="32" cy="8" r="2.5"/><line x1="8" y1="10" x2="20" y2="24"/><line x1="14" y1="26" x2="26" y2="26"/></svg>`,
  cableLow: `<svg viewBox="0 0 40 40"><line x1="8" y1="4" x2="8" y2="36"/><line x1="32" y1="4" x2="32" y2="36"/><circle cx="8" cy="32" r="2.5"/><circle cx="32" cy="32" r="2.5"/><line x1="8" y1="30" x2="20" y2="18"/><line x1="14" y1="16" x2="26" y2="16"/></svg>`,
  latPulldown: `<svg viewBox="0 0 40 40"><line x1="20" y1="4" x2="20" y2="14"/><circle cx="20" cy="4" r="2.5"/><line x1="10" y1="14" x2="30" y2="14"/><rect x="16" y="20" width="8" height="10" rx="2"/><line x1="14" y1="32" x2="26" y2="32"/><line x1="16" y1="34" x2="16" y2="30"/><line x1="24" y1="34" x2="24" y2="30"/></svg>`,
  seatedRow: `<svg viewBox="0 0 40 40"><rect x="17" y="10" width="6" height="6" rx="1"/><rect x="16" y="18" width="8" height="10" rx="2"/><line x1="24" y1="22" x2="34" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/><circle cx="6" cy="22" r="2.5"/></svg>`,
  barbellRow: `<svg viewBox="0 0 40 40"><line x1="6" y1="26" x2="30" y2="10"/><rect x="4" y="24" width="6" height="6" rx="1" transform="rotate(-30 7 27)"/><circle cx="30" cy="10" r="2.5"/><line x1="27" y1="10" x2="34" y2="10"/></svg>`,
  preacherCurl: `<svg viewBox="0 0 40 40"><rect x="10" y="16" width="8" height="18" rx="2" transform="rotate(20 14 25)"/><line x1="18" y1="12" x2="30" y2="12"/><circle cx="16" cy="12" r="2.5"/><circle cx="30" cy="12" r="2.5"/></svg>`,
  squatRack: `<svg viewBox="0 0 40 40"><line x1="8" y1="6" x2="8" y2="34"/><line x1="32" y1="6" x2="32" y2="34"/><line x1="4" y1="18" x2="36" y2="18"/><rect x="2" y="15" width="6" height="6" rx="1"/><rect x="32" y="15" width="6" height="6" rx="1"/></svg>`,
  legPress: `<svg viewBox="0 0 40 40"><rect x="6" y="24" width="20" height="6" rx="1" transform="rotate(-18 16 27)"/><rect x="24" y="10" width="10" height="16" rx="2" transform="rotate(-18 29 18)"/></svg>`,
  legExtension: `<svg viewBox="0 0 40 40"><rect x="14" y="10" width="8" height="14" rx="2"/><line x1="18" y1="24" x2="18" y2="30"/><line x1="8" y1="30" x2="28" y2="30"/><rect x="22" y="26" width="10" height="4" rx="1"/></svg>`,
  legCurl: `<svg viewBox="0 0 40 40"><rect x="14" y="10" width="8" height="14" rx="2"/><line x1="18" y1="24" x2="18" y2="30"/><rect x="22" y="16" width="10" height="4" rx="1"/><line x1="8" y1="30" x2="28" y2="30"/></svg>`,
  shoulderPress: `<svg viewBox="0 0 40 40"><rect x="16" y="16" width="8" height="12" rx="2"/><line x1="12" y1="10" x2="18" y2="16"/><line x1="28" y1="10" x2="22" y2="16"/><circle cx="12" cy="8" r="2.2"/><circle cx="28" cy="8" r="2.2"/><line x1="14" y1="30" x2="26" y2="30"/></svg>`,
  abBench: `<svg viewBox="0 0 40 40"><rect x="8" y="18" width="20" height="5" rx="1" transform="rotate(-15 18 20)"/><circle cx="30" cy="12" r="2.5"/><line x1="28" y1="14" x2="24" y2="20"/></svg>`,
  dumbbells: `<svg viewBox="0 0 40 40"><line x1="10" y1="20" x2="30" y2="20"/><rect x="6" y="15" width="7" height="10" rx="2"/><rect x="27" y="15" width="7" height="10" rx="2"/></svg>`,
  floorMat: `<svg viewBox="0 0 40 40"><rect x="6" y="12" width="28" height="16" rx="2" stroke-dasharray="3 2"/><line x1="6" y1="20" x2="34" y2="20" stroke-dasharray="1 3"/></svg>`,
  lunge: `<svg viewBox="0 0 40 40"><rect x="6" y="15" width="7" height="10" rx="2"/><rect x="27" y="15" width="7" height="10" rx="2"/><line x1="10" y1="25" x2="10" y2="32"/><line x1="30" y1="25" x2="24" y2="32"/></svg>`,
  pullover: `<svg viewBox="0 0 40 40"><line x1="20" y1="4" x2="20" y2="16"/><circle cx="20" cy="4" r="2.5"/><rect x="10" y="20" width="20" height="6" rx="1"/><line x1="20" y1="16" x2="20" y2="20"/></svg>`,
};

const ICON_LABELS = {
  barbellBench: 'Press banca (barra)', inclineDumbbell: 'Press inclinado', pecDeck: 'Aperturas en máquina',
  reversePecDeck: 'Posterior en máquina', cableHigh: 'Polea alta', cableLow: 'Polea baja',
  latPulldown: 'Jalón al pecho', seatedRow: 'Remo sentado', barbellRow: 'Remo / peso muerto (barra)',
  preacherCurl: 'Curl predicador', squatRack: 'Sentadilla', legPress: 'Prensa',
  legExtension: 'Extensión de cuádriceps', legCurl: 'Curl femoral', shoulderPress: 'Press de hombros',
  abBench: 'Abdominal en máquina', dumbbells: 'Mancuernas', floorMat: 'Suelo / esterilla',
  lunge: 'Zancadas', pullover: 'Pullover',
};
