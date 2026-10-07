// =====================================================================
// Rutina por defecto  (routine-default.js)
// Datos de la rutina inicial (5 días). Cada perfil parte de esta y luego la edita desde
// la pestaña Editar.
// Sin dependencias.
// =====================================================================

const DEFAULT_DAYS = [
  {
    name: "Día 1 · Pectoral, deltoides y tríceps",
    groups: [
      { label: "Pectoral", exercises: [
        { name:"Press banca plano", sets:"3 · 6-8", icon:"barbellBench", primary:"Barra libre en banco plano (zona de peso libre)", alts:["Chest Press (Technogym)","Mancuernas en banco plano"], howTo:"Ajusta las manos algo más anchas que los hombros. Baja la barra controlada hasta rozar el pecho y empuja hacia arriba sin bloquear los codos del todo." },
        { name:"Press superior con mancuernas", sets:"3 · 8-10", icon:"inclineDumbbell", primary:"Banco inclinado (30–45°) + mancuernas", alts:["Chest Press en el punto más alto del ajuste","Press inclinado en Multipower (Smith)"], howTo:"Mancuernas a la altura de los hombros, codos a 90°. Empuja hacia arriba juntando las mancuernas casi sin chocarlas, y baja controlando." },
        { name:"Aperturas en máquina", sets:"3 · 10-12", icon:"pecDeck", primary:"Pectoral / Pec Fly (Technogym)", alts:["Crossover Cables (cruce de poleas)","Aperturas con mancuernas en banco plano"], howTo:"Codos ligeramente flexionados apoyados en las almohadillas. Junta los brazos hacia el centro del pecho en un arco amplio, sin usar impulso." },
      ]},
      { label: "Deltoides", exercises: [
        { name:"Elevaciones laterales sentado", sets:"3 · 12-14", icon:"dumbbells", primary:"Mancuernas + banco con respaldo", alts:["Delts Machine (Technogym)","Pulley bajo, un brazo a la vez"], howTo:"Brazos casi rectos con leve flexión de codo. Sube lateralmente hasta la altura de los hombros liderando con los codos, no con las manos." },
        { name:"Posterior en máquina", sets:"3 · 14-16", icon:"reversePecDeck", primary:"Reverse Fly / Dual Pectoral-Reverse Fly (Technogym)", alts:["Pulley alto con cuerda (face pull)","Aperturas invertidas con mancuernas en banco inclinado"], howTo:"Pecho apoyado en el respaldo, agarra las asas y abre los brazos hacia atrás llevando los omóplatos hacia el centro." },
      ]},
      { label: "Tríceps", exercises: [
        { name:"Extensión de tríceps en polea", sets:"3 · 8-10", icon:"cableHigh", primary:"Pulley alto con barra recta (Technogym)", alts:["Arm Extension (máquina de tríceps sentado)","Easy Chin/Dip (fondos asistidos)"], howTo:"De pie, codos pegados al cuerpo y fijos. Empuja la barra hacia abajo hasta extender el brazo del todo, y sube controlando sin abrir los codos." },
        { name:"Ext. tríceps con cuerda overhead", sets:"3 · 10-12", icon:"cableHigh", primary:"Pulley con cuerda, de espaldas a la torre", alts:["Extensión a una mano con mancuerna","Arm Extension (máquina de tríceps)"], howTo:"Sujeta la cuerda por detrás de la cabeza con los codos altos y fijos junto a las orejas. Extiende los brazos hacia arriba/adelante y vuelve controlando." },
      ]},
    ]
  },
  {
    name: "Día 2 · Dorsales, bíceps y core",
    groups: [
      { label: "Dorsales", exercises: [
        { name:"Jalón al pecho agarre neutro", sets:"3 · 6-8", icon:"latPulldown", primary:"Lat Machine, agarre neutro (Technogym)", alts:["Vertical Traction","Lat Machine con agarre supino"], howTo:"Siéntate con los muslos fijos bajo el apoyo. Tira de la barra hacia la parte alta del pecho sacando pecho, sin balancear el torso hacia atrás." },
        { name:"Remo en máquina", sets:"3 · 8-10", icon:"seatedRow", primary:"Low Row (Technogym)", alts:["Pulley bajo con barra o triángulo","Remo con mancuerna a una mano apoyado en banco"], howTo:"Pecho apoyado en el respaldo. Tira de las asas hacia el abdomen juntando los omóplatos, sin encoger los hombros." },
        { name:"Remo en polea baja agarre V", sets:"3 · 10-12", icon:"cableLow", primary:"Pulley bajo, agarre en V (Technogym)", alts:["Low Row","Remo con barra libre"], howTo:"Espalda recta, rodillas semi-flexionadas. Tira del agarre hacia el abdomen manteniendo los codos pegados al cuerpo." },
      ]},
      { label: "Bíceps", exercises: [
        { name:"Curl de bíceps con barra", sets:"3 · 8-10", icon:"dumbbells", primary:"Barra recta o Z (zona de peso libre)", alts:["Curl con mancuernas","Pulley bajo con barra recta"], howTo:"Codos fijos junto al cuerpo. Sube la barra flexionando solo el antebrazo, sin balancear la espalda para ayudarte." },
        { name:"Curl martillo con cuerda", sets:"3 · 10-12", icon:"cableLow", primary:"Pulley bajo con cuerda (Technogym)", alts:["Curl martillo con mancuernas","Curl en polea con agarre invertido"], howTo:"Agarre neutro (pulgares hacia arriba). Flexiona el codo manteniendo la muñeca fija, sin mover el hombro." },
      ]},
      { label: "Core", exercises: [
        { name:"Elevación de piernas tumbado", sets:"3 · 10-12", icon:"floorMat", primary:"Tumbado en banco o suelo (zona de esterillas)", alts:["Barra de dominadas con soporte lumbar (elevación colgado)","Rueda abdominal"], howTo:"Tumbado boca arriba, lumbares pegadas al suelo. Eleva las piernas rectas o semi-flexionadas hasta 90° y baja controlando sin arquear la espalda." },
        { name:"Planchas abdominales", timed:true, sets:"3 · 30 seg", icon:"floorMat", primary:"Suelo, zona de esterillas", alts:["Plancha con disco sobre la espalda","Mountain climbers"], howTo:"Apoyo en antebrazos y puntas de los pies, cuerpo en línea recta de cabeza a talones, abdomen contraído sin hundir la cadera." },
      ]},
    ]
  },
  {
    name: "Día 3 · Piernas y hombros",
    groups: [
      { label: "Piernas", exercises: [
        { name:"Sentadillas", sets:"3 · 6-8", icon:"squatRack", primary:"Barra libre en rack de sentadillas", alts:["Multipower (Smith) de Technogym","Leg Press"], howTo:"Barra sobre los trapecios, pies a la anchura de hombros. Baja llevando la cadera hacia atrás y abajo hasta unos 90°, y sube empujando con los talones." },
        { name:"Peso muerto rumano", sets:"3 · 8-10", icon:"barbellRow", primary:"Barra libre (zona de peso libre)", alts:["Peso muerto rumano con mancuernas","Leg Curl (femoral de pie o tumbado)"], howTo:"Barra pegada a las piernas, rodillas semi-flexionadas fijas. Baja empujando la cadera hacia atrás hasta notar el estiramiento en el femoral, y sube apretando glúteo." },
        { name:"Ext. de cuádriceps", sets:"3 · 10-12", icon:"legExtension", primary:"Leg Extension (Technogym)", alts:["Zancadas con mancuernas","Leg Press con pies altos y adelantados"], howTo:"Espalda apoyada en el respaldo, tobillos bajo el rodillo. Extiende las piernas hasta casi bloquear la rodilla y baja controlando." },
        { name:"Femoral sentado o tumbado", sets:"3 · 12-14", icon:"legCurl", primary:"Leg Curl (Technogym)", alts:["Peso muerto rumano con mancuernas","Pulley bajo con tobillera"], howTo:"Rodillo apoyado tras los tobillos. Flexiona la rodilla llevando el talón hacia el glúteo, y vuelve controlando sin soltar de golpe." },
      ]},
      { label: "Hombros", exercises: [
        { name:"Press de hombros en máquina", sets:"3 · 8-10", icon:"shoulderPress", primary:"Shoulder Press (Technogym)", alts:["Press militar con mancuernas","Press militar con barra"], howTo:"Agarra las asas a la altura de los hombros. Empuja hacia arriba sin bloquear los codos del todo, y baja controlando." },
        { name:"Elevaciones laterales sentado", sets:"3 · 12-14", icon:"dumbbells", primary:"Mancuernas + banco con respaldo", alts:["Delts Machine (Technogym)","Pulley bajo, un brazo a la vez"], howTo:"Brazos casi rectos con leve flexión de codo. Sube lateralmente hasta la altura de los hombros liderando con los codos." },
        { name:"Posterior en máquina", sets:"3 · 14-16", icon:"reversePecDeck", primary:"Reverse Fly / Dual Pectoral-Reverse Fly (Technogym)", alts:["Pulley alto con cuerda (face pull)","Aperturas invertidas con mancuernas"], howTo:"Pecho apoyado en el respaldo. Abre los brazos hacia atrás llevando los omóplatos hacia el centro." },
      ]},
    ]
  },
  {
    name: "Día 4 · Pectoral y dorsales",
    groups: [
      { label: "Pectoral", exercises: [
        { name:"Press banca plano", sets:"3 · 6-8", icon:"barbellBench", primary:"Barra libre en banco plano", alts:["Chest Press (Technogym)","Mancuernas en banco plano"], howTo:"Manos algo más anchas que los hombros. Baja la barra controlada hasta rozar el pecho y empuja hacia arriba." },
        { name:"Press superior mancuernas", sets:"3 · 10-12", icon:"inclineDumbbell", primary:"Banco inclinado + mancuernas", alts:["Chest Press en ajuste alto","Press inclinado en Multipower"], howTo:"Mancuernas a la altura de los hombros, codos a 90°. Empuja hacia arriba juntando las mancuernas y baja controlando." },
        { name:"Aperturas en máquina", sets:"3 · 10-12", icon:"pecDeck", primary:"Pectoral / Pec Fly (Technogym)", alts:["Crossover Cables","Aperturas con mancuernas en banco plano"], howTo:"Codos apoyados en las almohadillas con leve flexión. Junta los brazos en un arco amplio sin impulso." },
      ]},
      { label: "Dorsales", exercises: [
        { name:"Remo con barra o máquina", sets:"3 · 8-10", icon:"barbellRow", primary:"Barra libre, remo inclinado", alts:["Low Row (Technogym)","Pulley bajo con barra"], howTo:"Torso inclinado unos 45°, espalda recta. Tira de la barra hacia el abdomen apretando los omóplatos, sin usar impulso de piernas." },
        { name:"Jalón al pecho agarre supino", sets:"3 · 8-10", icon:"latPulldown", primary:"Lat Machine, agarre supino (Technogym)", alts:["Lat Machine agarre neutro","Vertical Traction"], howTo:"Agarre estrecho con palmas hacia ti. Tira hacia la parte alta del pecho llevando los codos hacia abajo y atrás." },
        { name:"Pullover serrato polea alta", sets:"3 · 14-16", icon:"pullover", primary:"Pulley alto con barra recta (Technogym)", alts:["Pullover con mancuerna en banco plano","Pulley alto con cuerda"], howTo:"De pie o de rodillas, brazos casi rectos. Baja la barra en arco desde arriba hasta los muslos sin flexionar los codos, sintiendo el dorsal." },
      ]},
    ]
  },
  {
    name: "Día 5 · Piernas, brazos y core",
    groups: [
      { label: "Piernas", exercises: [
        { name:"Prensa", sets:"3 · 6-8", icon:"legPress", primary:"Leg Press (Technogym)", alts:["Multipower (Smith) para sentadilla","Sentadilla libre"], howTo:"Pies a la anchura de hombros en la plataforma. Baja hasta unos 90° de rodilla y empuja sin bloquear la rodilla del todo." },
        { name:"Zancadas con mancuernas", sets:"3 · 8-10", icon:"lunge", primary:"Mancuernas, zona de peso libre", alts:["Sentadilla búlgara","Leg Press a una pierna"], howTo:"Un paso largo hacia adelante, baja la rodilla trasera casi al suelo manteniendo el torso recto. Empuja con el talón delantero para volver." },
        { name:"Femoral sentado o tumbado", sets:"3 · 10-12", icon:"legCurl", primary:"Leg Curl (Technogym)", alts:["Peso muerto rumano con mancuernas","Pulley bajo con tobillera"], howTo:"Rodillo apoyado tras los tobillos. Flexiona la rodilla llevando el talón hacia el glúteo y vuelve controlando." },
      ]},
      { label: "Brazos", exercises: [
        { name:"Curl predicador bíceps", sets:"3 · 12-14", icon:"preacherCurl", primary:"Scott Bench + barra Z (Technogym)", alts:["Curl predicador en máquina","Pulley bajo con barra"], howTo:"Brazos apoyados en el banco inclinado, axilas pegadas al soporte. Sube la barra flexionando el codo sin despegar el tríceps del apoyo." },
        { name:"Extensión de tríceps en polea", sets:"3 · 8-10", icon:"cableHigh", primary:"Pulley alto con barra recta (Technogym)", alts:["Arm Extension (máquina de tríceps)","Easy Chin/Dip (fondos asistidos)"], howTo:"Codos pegados al cuerpo y fijos. Empuja la barra hacia abajo hasta extender el brazo, y sube controlando." },
      ]},
      { label: "Core", exercises: [
        { name:"Crunch abdominal", sets:"3 · 14-16", icon:"abBench", primary:"Abdominal Crunch (Technogym)", alts:["Total Abdominal (Technogym)","Rueda abdominal"], howTo:"Espalda apoyada, agarra las asas. Contrae el abdomen llevando el pecho hacia la pelvis, sin tirar del cuello con los brazos." },
        { name:"Planchas abdominales", timed:true, sets:"3 · 30 seg", icon:"floorMat", primary:"Suelo, zona de esterillas", alts:["Plancha con disco sobre la espalda","Mountain climbers"], howTo:"Apoyo en antebrazos y puntas de los pies, cuerpo en línea recta, abdomen contraído sin hundir la cadera." },
      ]},
    ]
  },
];
