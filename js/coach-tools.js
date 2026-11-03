// =====================================================================
// Herramientas del entrenador IA  (coach-tools.js)
// Lo que Gemini puede CONSULTAR de los datos del usuario. Cada herramienta se ejecuta en el navegador con
// las mismas funciones que ya calculan todo lo demás (fuerza estimada, máquinas, carga muscular, estado de
// la semana…), así que sus números coinciden siempre con los de la app y Gemini no tiene que calcular nada:
// solo interpretar. Gemini no escribe SQL ni accede a la base de datos: pide una herramienta por su nombre
// y con parámetros validados, y recibe un JSON pequeño. Los datos son los del propio usuario (ya descargados
// con las políticas de acceso de Supabase), nunca los de otro perfil.
// Depende de: utils, routine, planning, muscles, progress-chart, day-view, day-picker, body.
// =====================================================================

const COACH_WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function coachR(v, d){ return v == null || !isFinite(v) ? null : Math.round(v * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d); }
function coachShortDay(name){ return String(name || '').split('·')[0].trim(); }
function coachNorm(s){ return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function coachInt(v, def, min, max){ const n = parseInt(v, 10); return isFinite(n) ? Math.max(min, Math.min(max, n)) : def; }
function coachDow(dateStr){ return COACH_WEEKDAYS[parseLocalDate(dateStr).getDay()]; }

function coachRowsInRange(start, end){
  return myRows().filter(r => { if (isWarmupRow(r)) return false; const f = parseLocalDate(r['Fecha']); return f >= start && f < end; });
}
function coachWeekRange(offset){
  const s = getWeekStartOffset(-Math.abs(offset)), e = new Date(s); e.setDate(e.getDate() + 7);
  return { start: s, end: e, desde: localDateStr(s) };
}

// Todos los nombres de ejercicio conocidos (rutina activa + historial) y su día habitual
function coachExerciseNames(){
  const out = {};
  DAYS.forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => { out[ex.name] = true; })));
  myRows().forEach(r => { if (r['Ejercicio']) out[r['Ejercicio']] = true; });
  return Object.keys(out);
}
function coachFindRoutineExercise(name){
  let found = null;
  DAYS.forEach(d => d.groups.forEach(g => g.exercises.forEach(ex => { if (!found && ex.name === name) found = { ex: ex, dia: d, grupo: g.label }; })));
  return found;
}

// El modelo escribe el nombre "a su manera": se resuelve de forma tolerante y, si no está claro, se devuelven candidatos.
function coachResolveExercise(query){
  const names = coachExerciseNames(), q = coachNorm(query);
  if (!q) return { error: 'Falta el nombre del ejercicio. Usa list_exercises para ver los disponibles.' };
  const exact = names.find(n => coachNorm(n) === q);
  if (exact) return { name: exact };
  const inc = names.filter(n => coachNorm(n).indexOf(q) >= 0 || q.indexOf(coachNorm(n)) >= 0);
  if (inc.length === 1) return { name: inc[0] };
  const tokens = q.split(' ').filter(t => t.length > 2);
  const scored = names.map(n => { const nn = coachNorm(n); return { n: n, s: tokens.filter(t => nn.indexOf(t) >= 0).length }; })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  if (scored.length && (scored.length === 1 || scored[0].s > scored[1].s)) return { name: scored[0].n };
  const cands = (inc.length ? inc : scored.map(x => x.n)).slice(0, 6);
  return { error: cands.length ? 'Nombre ambiguo o desconocido. Candidatos: ' + cands.join(' | ') : 'No hay ningún ejercicio con ese nombre. Usa list_exercises.' };
}

// ------------------------------------------------------------------ herramientas
const COACH_TOOLS = [

  { name: 'get_context',
    description: 'Situación actual del usuario: fecha de hoy, qué días de la rutina ha entrenado esta semana, cuáles faltan (con su grupo muscular, ejercicios hechos y días desde la última vez), qué día/ejercicio tiene abierto en la app y cuál sugiere la app. Llámala SIEMPRE al empezar una conversación y antes de planificar.',
    parameters: { type: 'OBJECT', properties: {} },
    run: function(){
      const now = new Date(), today = localDateStr(now), ws = getWeekStart();
      const weekRows = coachRowsInRange(ws, new Date(ws.getTime() + 7 * 864e5));
      const byDate = {};
      weekRows.forEach(r => {
        const f = String(r['Fecha']).slice(0, 10);
        const o = byDate[f] || (byDate[f] = { fecha: f, dia_semana: coachDow(f), dias_de_rutina: [], series: 0 });
        const dn = coachShortDay(r['Día']); if (dn && o.dias_de_rutina.indexOf(dn) < 0) o.dias_de_rutina.push(dn);
        o.series += Number(r['Series']) || 0;
      });
      const sug = suggestedDayIdx();
      const all = myRows().filter(r => !isWarmupRow(r));
      const rutina = DAYS.map((d, i) => {
        const names = dayExerciseNames(d), counts = names.map(n => weeklySeriesCount(d.name, n));
        const done = counts.filter(c => c >= 3).length, any = counts.filter(c => c > 0).length;
        const last = all.filter(r => r['Día'] === d.name).map(r => String(r['Fecha']).slice(0, 10)).sort().pop() || null;
        const grupos = []; d.groups.forEach(g => { if (grupos.indexOf(g.label) < 0) grupos.push(g.label); });
        return {
          dia: coachShortDay(d.name), nombre: d.name, grupos: grupos,
          estado: done === names.length && names.length ? 'completo' : (any ? 'empezado' : 'pendiente'),
          ejercicios_completos: done, ejercicios_empezados: any, ejercicios_total: names.length,
          ultima_vez: last, dias_desde_la_ultima_vez: last ? Math.round((parseLocalDate(today) - parseLocalDate(last)) / 864e5) : null,
          sugerido_por_la_app: i === sug,
        };
      });
      let abierto = null, visible = null;
      try { if (dayScreenOpen) { abierto = DAYS[currentDay].name; const c = exerciseCards()[currentExIdx]; visible = c ? c.getAttribute('data-exercise') : null; } } catch (e) {}
      const trained = Object.keys(byDate).sort().map(k => byDate[k]);
      return {
        usuario: getProfile(), hoy: today, dia_semana_hoy: COACH_WEEKDAYS[now.getDay()],
        semana_desde: localDateStr(ws), dias_hasta_el_domingo: (7 - ((now.getDay() + 6) % 7) - 1),
        dias_entrenados_esta_semana: trained.length, detalle_dias_entrenados: trained,
        semana_de_descanso_activa: (typeof isRestWeek === 'function') ? !!isRestWeek(getProfile()) : false,
        dia_abierto_en_la_app: abierto, ejercicio_visible_en_la_app: visible,
        rutina: rutina,
      };
    } },

  { name: 'get_routine',
    description: 'La rutina del usuario: sus días, grupos musculares y ejercicios (con series y rango de repeticiones objetivo, si es por tiempo, máquina habitual y alternativas).',
    parameters: { type: 'OBJECT', properties: {} },
    run: function(){
      return { dias: DAYS.map(d => ({
        dia: coachShortDay(d.name), nombre: d.name,
        grupos: d.groups.map(g => ({ grupo: g.label, ejercicios: g.exercises.map(ex => ({
          nombre: ex.name, series_y_reps: ex.sets, tipo: isTimedExercise(ex.name) ? 'tiempo (segundos)' : 'peso y repeticiones',
          maquina_habitual: ex.primary || null, alternativas: ex.alts || [],
        })) })),
      })) };
    } },

  { name: 'list_exercises',
    description: 'Lista de ejercicios del usuario con los días en que los hace, cuántas sesiones tiene registradas y la fecha de la última. Úsala para resolver nombres.',
    parameters: { type: 'OBJECT', properties: {} },
    run: function(){
      return { ejercicios: coachExerciseNames().map(n => {
        const s = exerciseSessions(n), r = coachFindRoutineExercise(n);
        return { ejercicio: n, dias: exerciseDayLabels(n), en_la_rutina_actual: !!r, sesiones: s.length, ultima_sesion: s.length ? s[s.length - 1].fecha : null };
      }).sort((a, b) => b.sesiones - a.sesiones) };
    } },

  { name: 'get_week_status',
    description: 'Qué se hizo en una semana concreta: por cada día de la rutina, series registradas de cada ejercicio (objetivo: 3), mejor serie y volumen; días entrenados y volumen total. semanas_atras=0 es la semana actual, 1 la pasada…',
    parameters: { type: 'OBJECT', properties: { semanas_atras: { type: 'INTEGER', description: '0 = esta semana, 1 = la pasada… (máximo 12)' } } },
    run: function(a){
      const wr = coachWeekRange(coachInt(a.semanas_atras, 0, 0, 12));
      const rows = coachRowsInRange(wr.start, wr.end);
      const fechas = {};
      rows.forEach(r => { fechas[String(r['Fecha']).slice(0, 10)] = true; });
      let totalVol = 0, totalSeries = 0;
      const dias = DAYS.map(d => {
        const dr = rows.filter(r => r['Día'] === d.name);
        const ex = {};
        dr.forEach(r => {
          const o = ex[r['Ejercicio']] || (ex[r['Ejercicio']] = { ejercicio: r['Ejercicio'], series: 0, mejor_serie: null, _rm: 0 });
          o.series += Number(r['Series']) || 0;
          const rm = (Number(r['Peso (kg)']) || 0) * (1 + (Number(r['Reps']) || 0) / 30);
          if (rm > o._rm) { o._rm = rm; o.mejor_serie = isTimedExercise(r['Ejercicio']) ? (r['Reps'] + ' s') : (fmtNum(r['Peso (kg)'], 2) + ' kg × ' + r['Reps']); }
        });
        const vol = dr.reduce((s, r) => s + rowVolume(r), 0), ser = dr.reduce((s, r) => s + (Number(r['Series']) || 0), 0);
        totalVol += vol; totalSeries += ser;
        const fechasDia = []; dr.forEach(r => { const f = String(r['Fecha']).slice(0, 10); if (fechasDia.indexOf(f) < 0) fechasDia.push(f); });
        return { dia: coachShortDay(d.name), fechas: fechasDia.sort(), volumen_kg: Math.round(vol), series: ser,
          ejercicios: Object.keys(ex).map(k => { const o = ex[k]; delete o._rm; return o; }) };
      });
      return { semana_desde: wr.desde, dias_entrenados: Object.keys(fechas).length, series_totales: totalSeries, volumen_total_kg: Math.round(totalVol), dias: dias };
    } },

  { name: 'get_exercise_progress',
    description: 'Progresión de UN ejercicio con la misma métrica que la app: "fuerza estimada" por sesión (media de las series de trabajo, peso × reps^0,10), ajustada entre máquinas, con cambio reciente, tendencia (solo con 8+ sesiones), mejor sesión y últimas sesiones. Úsala para "¿voy bien en X?", "¿estoy estancado?" o decidir carga.',
    parameters: { type: 'OBJECT', properties: {
      ejercicio: { type: 'STRING', description: 'Nombre del ejercicio (o parte). Si es ambiguo se devuelven candidatos.' },
      ultimas_sesiones: { type: 'INTEGER', description: 'Cuántas sesiones devolver (por defecto 12, máximo 30).' },
      maquina: { type: 'STRING', description: 'Opcional: ver solo una máquina/variante (o "habitual"). Sin esto se usa la serie combinada y ajustada.' } }, required: ['ejercicio'] },
    run: function(a){
      const res = coachResolveExercise(a.ejercicio);
      if (res.error) return { error: res.error };
      const name = res.name, timed = isTimedExercise(name), all = exerciseSessions(name);
      const info = coachFindRoutineExercise(name);
      const base = { ejercicio: name, tipo: timed ? 'tiempo (segundos)' : 'peso y repeticiones', rango_objetivo: info ? info.ex.sets : null, dias_en_que_se_hace: exerciseDayLabels(name) };
      if (!all.length) return Object.assign(base, { sesiones_totales: 0, aviso: 'Sin historial registrado de este ejercicio.' });
      let mode = 'auto';
      if (a.maquina) {
        const q = coachNorm(a.maquina), m = pgBuildSeries(all, 'auto').machines.find(x => coachNorm(x.name) === q || (!x.name && /habitual/.test(q)));
        if (m) mode = 'm:' + m.name; else return { error: 'Esa máquina no aparece en el historial. Máquinas: ' + pgBuildSeries(all, 'auto').machines.map(x => x.name || 'habitual').join(' | ') };
      }
      const ser = pgBuildSeries(all, mode), values = ser.sessions.map(s => s.value);
      const n = coachInt(a.ultimas_sesiones, 12, 1, 30), ch = pgChange(values), tr = pgTrendInfo(values);
      return Object.assign(base, {
        metrica: timed ? 'mejor serie en segundos' : 'fuerza_estimada (kg) = media de las series de trabajo de la sesión con peso × reps^0,10; no es el 1RM',
        sesiones_totales: all.length, sesiones_en_la_serie: ser.sessions.length,
        maquinas: ser.machines.map(m => ({ nombre: m.name || 'habitual', sesiones: m.n })),
        maquina_de_referencia: ser.ref || 'habitual',
        sesiones_ajustadas_de_otra_maquina: mode === 'auto' ? ser.adjusted : 0, sesiones_que_no_entran: ser.excluded,
        actual: coachR(values[values.length - 1]), mejor_sesion: coachR(Math.max.apply(null, values)),
        cambio_reciente: ch ? { pct: coachR(ch.pct), comparacion: pgChangeLabel(ch.w) } : null,
        tendencia: tr ? { sesiones: tr.n, cambio_total_pct: coachR(tr.pct), estancado: tr.stagnant } : 'faltan datos: hacen falta 8 sesiones para afirmar tendencia o estancamiento',
        serie: ser.sessions.slice(-n).map(s => ({
          fecha: s.fecha, maquina: s.variante || 'habitual', fuerza: coachR(s.value),
          mejor_serie: timed ? (s.reps + ' s') : (fmtNum(s.peso, 2) + ' kg × ' + s.reps), series: s.nSets, dia: coachShortDay(s.dia),
          ajustada_x: s.adj ? coachR(s.adj, 2) : undefined })),
      });
    } },

  { name: 'get_exercise_sets',
    description: 'Series sueltas (peso, repeticiones, máquina, notas, calentamiento) de un ejercicio, de más reciente a más antigua. Úsala para ver el detalle de cómo fue una sesión.',
    parameters: { type: 'OBJECT', properties: {
      ejercicio: { type: 'STRING', description: 'Nombre del ejercicio.' },
      limite: { type: 'INTEGER', description: 'Máximo de series (por defecto 30, máximo 60).' },
      desde: { type: 'STRING', description: 'Opcional: fecha mínima AAAA-MM-DD.' } }, required: ['ejercicio'] },
    run: function(a){
      const res = coachResolveExercise(a.ejercicio);
      if (res.error) return { error: res.error };
      const lim = coachInt(a.limite, 30, 1, 60), since = /^\d{4}-\d{2}-\d{2}$/.test(a.desde || '') ? a.desde : '';
      const rows = myRows().filter(r => r['Ejercicio'] === res.name && (!since || String(r['Fecha']).slice(0, 10) >= since))
        .sort((x, y) => String(y['Fecha']).localeCompare(String(x['Fecha']))).slice(0, lim);
      return { ejercicio: res.name, series: rows.map(r => ({
        fecha: String(r['Fecha']).slice(0, 10), dia: coachShortDay(r['Día']), peso_kg: Number(r['Peso (kg)']) || 0, reps: Number(r['Reps']) || 0,
        series: Number(r['Series']) || 1, maquina: r['Variante'] || 'habitual', calentamiento: isWarmupRow(r) || undefined, nota: r['Nota'] || undefined })) };
    } },

  { name: 'get_muscle_load',
    description: 'Carga por zona muscular en las últimas semanas (series y volumen por semana, media de las semanas previas y semana actual) y qué días de la rutina trabajan cada zona. Úsala para equilibrio muscular y para decidir qué día hacer.',
    parameters: { type: 'OBJECT', properties: { semanas: { type: 'INTEGER', description: 'Semanas a mirar, incluida la actual (por defecto 4, máximo 12).' } } },
    run: function(a){
      const nw = coachInt(a.semanas, 4, 1, 12), zones = Object.keys(MUSCLE_ZONES), out = {};
      zones.forEach(z => { out[z] = []; });
      for (let k = nw - 1; k >= 0; k--) {
        const wr = coachWeekRange(k), acc = {};
        zones.forEach(z => { acc[z] = { semana_desde: wr.desde, series: 0, volumen_kg: 0 }; });
        coachRowsInRange(wr.start, wr.end).forEach(r => {
          const g = preciseGroupForRow(r); if (!g) return;
          const z = zones.find(x => MUSCLE_ZONES[x].groups.indexOf(g) >= 0); if (!z) return;
          acc[z].series += Number(r['Series']) || 0; acc[z].volumen_kg += rowVolume(r);
        });
        zones.forEach(z => { acc[z].volumen_kg = Math.round(acc[z].volumen_kg); out[z].push(acc[z]); });
      }
      return { semanas_incluida_la_actual: nw, zonas: zones.map(z => {
        const weeks = out[z], prev = weeks.slice(0, -1), cur = weeks[weeks.length - 1];
        const days = []; MUSCLE_ZONES[z].groups.forEach(g => daysCoveringGroup(g).forEach(d => { if (days.indexOf(d) < 0) days.push(d); }));
        return { zona: MUSCLE_ZONES[z].label, dias_de_la_rutina_que_la_trabajan: days, semana_actual: cur,
          media_series_semanas_previas: prev.length ? coachR(prev.reduce((s, w) => s + w.series, 0) / prev.length) : null, semanas: weeks };
      }) };
    } },

  { name: 'get_weekly_summary',
    description: 'Resumen por semana de las últimas N semanas: días entrenados, series, volumen y ejercicios distintos. Úsala para constancia y evolución general.',
    parameters: { type: 'OBJECT', properties: { semanas: { type: 'INTEGER', description: 'Semanas (por defecto 8, máximo 26), de más antigua a más reciente; la última es la actual y puede estar incompleta.' } } },
    run: function(a){
      const n = coachInt(a.semanas, 8, 1, 26), weeks = [];
      for (let k = n - 1; k >= 0; k--) {
        const wr = coachWeekRange(k), rows = coachRowsInRange(wr.start, wr.end), f = {}, ex = {};
        rows.forEach(r => { f[String(r['Fecha']).slice(0, 10)] = true; ex[r['Ejercicio']] = true; });
        weeks.push({ semana_desde: wr.desde, dias_entrenados: Object.keys(f).length, series: rows.reduce((s, r) => s + (Number(r['Series']) || 0), 0),
          volumen_kg: Math.round(rows.reduce((s, r) => s + rowVolume(r), 0)), ejercicios_distintos: Object.keys(ex).length, es_la_semana_actual: k === 0 });
      }
      const done = weeks.slice(0, -1);
      return { semanas: weeks, dias_por_semana_media_semanas_completas: done.length ? coachR(done.reduce((s, w) => s + w.dias_entrenados, 0) / done.length) : null };
    } },

  { name: 'get_body_weight',
    description: 'Peso corporal registrado (últimos N días), peso actual, hace una semana y altura. Solo si la pregunta lo requiere.',
    parameters: { type: 'OBJECT', properties: { dias: { type: 'INTEGER', description: 'Días hacia atrás (por defecto 60, máximo 365).' } } },
    run: function(a){
      const w = (window._weightHistory || []).slice().sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)));
      if (!w.length) return { aviso: 'No hay peso corporal registrado.' };
      const since = localDateStr(new Date(Date.now() - coachInt(a.dias, 60, 1, 365) * 864e5)), t = getWeightTrend();
      return { peso_actual_kg: t.pesoActual, peso_hace_una_semana_kg: t.pesoHaceSemana, altura_cm: window._height || null,
        registros: w.filter(x => String(x.fecha) >= since).map(x => ({ fecha: String(x.fecha).slice(0, 10), peso_kg: x.peso })), dias_desde_el_ultimo_peso: daysSinceLastWeight() };
    } },

  { name: 'get_app_signals',
    description: 'Las señales que ya calcula la app: zona más rezagada y más cargada la semana pasada, grupos que faltaron y aún no se han cubierto esta semana, ejercicios pendientes de días empezados y si hay un ajuste semanal activo.',
    parameters: { type: 'OBJECT', properties: {} },
    run: function(){
      const p = getProfile(), safe = f => { try { return f(); } catch (e) { return null; } }, zl = z => (z && MUSCLE_ZONES[z]) ? MUSCLE_ZONES[z].label : null;
      const ov = safe(() => getWeekOverride(p));
      return {
        zona_mas_rezagada_semana_pasada: safe(() => zl(findMostNeglectedZone(p))),
        zona_mas_cargada_semana_pasada: safe(() => zl(findMostOverloadedZone(p))),
        grupos_que_faltaron_la_semana_pasada_y_siguen_sin_cubrir: safe(() => stillMissingPriorityGroups(p)) || [],
        ejercicios_pendientes_de_dias_empezados: (safe(() => pendingFromPartialDays()) || []).map(d => ({ dia: d.dayLabel, faltan: d.missing.map(m => ({ ejercicio: m.name, dia_recomendado: m.recommendedDay ? m.recommendedDay.dayLabel : null })) })),
        ajuste_semanal_activo: ov ? { dia: coachShortDay(ov.dayName), de: ov.fromGroupLabel, a: ov.toGroupLabel } : null,
        semana_de_descanso: safe(() => !!isRestWeek(p)) || false,
      };
    } },
];

function coachToolDeclarations(){
  return COACH_TOOLS.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

// Ejecuta una herramienta con argumentos del modelo (no se fía de ellos). Nunca lanza: devuelve { error } si algo falla.
function coachRunTool(name, args){
  const t = COACH_TOOLS.find(x => x.name === name);
  if (!t) return { error: 'Herramienta desconocida: ' + name };
  try { return t.run(args && typeof args === 'object' ? args : {}); }
  catch (e) { return { error: 'La herramienta ha fallado: ' + String((e && e.message) || e).slice(0, 160) }; }
}
