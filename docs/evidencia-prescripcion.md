# Evidencia detrás de la prescripción serie a serie

Qué respalda la literatura cada parámetro que usa `js/prescription.js`, y qué es criterio práctico sin ensayos directos.

> **Cómo leer esto.** Se contrastó con un informe de investigación asistida por IA (literatura 2015–2026). **Las citas y cifras no están verificadas de forma independiente**: antes de fiarte de una, abre su DOI o su enlace de PubMed. Las que más pesan (Refalo 2023, Halperin 2022, Singer 2024, Plotkin 2022, Coleman 2024) coinciden con lo que se conoce de esa literatura; las de 2025–2026 (Remmert 2025, Pelland 2026, Pancar 2026) no se han podido confirmar. El informe es explícito en lo que no encontró, y eso es lo más útil de él.

## Decisiones y su respaldo

| Decisión en la app | Veredicto del informe | Qué hace la app |
|---|---|---|
| Dejar 1–3 repeticiones en reserva (RIR) en lugar de ir al fallo | **Parcialmente.** Meta-análisis de 2023: fallo de serie frente a no fallo, ES 0,19 (IC 95 %: 0,00 a 0,37); con fallo muscular momentáneo estricto, ES 0,12 (−0,13 a 0,37). Meta-regresión de 2024: pendiente pequeña a favor de acabar más cerca del fallo en hipertrofia (nula en fuerza). Estudios agudos: el fallo causa más caída de velocidad y recuperación más lenta | Pesados con RIR 2 / 1 / 1 (nunca al fallo) |
| Fallo en todas las series con 55–75 series semanales | **Parcialmente.** El fallo repetido alarga la recuperación (más de 24–48 h) y empeora la viabilidad; esa dosis exacta no se ha ensayado, así que atribuir un bajón concreto al fallo es una extrapolación coherente, no un hallazgo | La app no diagnostica sobrealcance |
| Fallo **solo en la última serie** | **Evidencia insuficiente.** El ensayo más cercano (2025, 8 semanas, hombres entrenados) comparó 4–6 RIR, 1–3 RIR, 0–3 RIR y 0 RIR: 0–3 y 0 RIR tuvieron peor viabilidad y algo menos de fuerza; hipertrofia inconclusa | **Quitado de los pesados.** Solo los accesorios (poca fatiga sistémica) pueden acabar la última serie en fallo técnico: criterio práctico |
| Descanso 2:30–3:30 (pesados) y 1:30–2:00 (accesorios) | **Parcialmente.** Meta-análisis bayesiano de 2024: más de 60 s frente a 60 s o menos, pequeña ventaja probable (SMD 0,16 muslo, 0,11 brazo); entre 61–119 s, 120–179 s y 180 s o más no hay diferencia clara. Sin datos de fuerza ni por tipo de ejercicio | Accesorios dentro del rango respaldado. Pesados: se mantiene 2:30–3:30 por criterio práctico (conservar repeticiones entre series), no porque 3 minutos sean mejores para hipertrofia |
| Rangos de repeticiones (6–10 pesados, 10–16 accesorios) | **Parcialmente.** Hipertrofia similar con cargas bajas y altas cerca del fallo; la fuerza máxima favorece cargas altas. El rango por tipo de ejercicio es una extrapolación | Se mantienen; el reparto por ejercicio es criterio práctico |
| El RIR se estima con error | **Respaldada.** Subestimación media de unas 0,95 repeticiones (IC 95 %: 0,17 a 1,73); mejor cerca del fallo; error por repetición de 0,06 con 12 o menos frente a 0,47 por encima de 12; efecto de la experiencia inconsistente | Aviso en ejercicios de más de 12 repeticiones. Un «RIR 2» real ronda las 3 en reserva |
| Doble progresión | **Evidencia insuficiente** frente a otros métodos. En entrenados (8 semanas), progresar por carga o por repeticiones dio resultados similares | Sin cambios (combina ambas) |
| Volumen semanal | **Respaldada** la relación dosis-respuesta con rendimientos decrecientes. La interacción con el RIR está poco cuantificada; una síntesis narrativa sugiere 12–20 series por grupo con 1–3 RIR | La app no cambia tu volumen |
| Fallo técnico y lesión en peso muerto rumano, remo con barra, sentadilla y zancadas | **Evidencia insuficiente** (no hay datos prospectivos de lesión) | Peso muerto rumano 2 / 2 / 1; avisos de barra libre y espalda: criterio de prudencia, no un dato |
| Core (rangos, tiempos y descanso) | **Evidencia insuficiente** | Criterio práctico |
| Descarga tras un periodo de fatiga | **Parcialmente.** Descargas típicas de 5–7 días. En entrenados, parar del todo una semana no mejoró la hipertrofia y redujo la fuerza máxima; reducir volumen manteniendo la carga preservó las adaptaciones en no entrenados (n = 19). Ningún ensayo indujo antes un sobrealcance | **Semana de descarga** (`js/deload.js`): 7 días con 2 series por ejercicio en vez de 3, la carga de siempre y un RIR más (el RIR extra es criterio práctico; lo respaldado es bajar el volumen manteniendo la carga y no parar del todo). **Cuándo hacerla no tiene criterio validado**: la app solo la propone, con el motivo, y decides tú |

## Cuándo proponer una descarga (lo que NO está respaldado)
Ningún estudio del informe valida un criterio para decidir cuándo descargar (ni planificada ni reactiva), y ninguno indujo antes un sobrealcance. Las tres señales que usa la app son **heurísticas razonables, no reglas validadas**, y los umbrales son una elección (están como constantes al principio de `js/deload.js`):
- **Rendimiento a la baja:** la fuerza estimada de las últimas 2 semanas, por ejercicio, está al menos un 3 % por debajo de la mediana de las 6 anteriores (media de los ejercicios con datos; hacen falta 3). El ruido de un día suele rondar el 1,5 %.
- **Plan incumplido:** menos del 60 % de las series de los últimos 14 días llegaron al objetivo de repeticiones del plan (hacen falta 9 series).
- **Semanas seguidas:** 8 o más semanas entrenando 2 días o más sin una descarga (aviso suave).
Se enseña siempre el motivo y la advertencia de que no hay criterio validado; «Ahora no» la aplaza 7 días; nunca se activa sola.

## Limitaciones del conjunto
- Los ensayos con entrenados duran 8–9 semanas: poco para diferencias sutiles.
- La definición de «fallo» varía entre estudios, y varios estiman el RIR a posteriori.
- Casi ningún estudio separa multiarticulares de aislamiento.
- Parte de lo concluyente en descargas viene de población no entrenada.

## Fuentes citadas por el informe (sin verificar por mí)
- Refalo et al., 2023, *Sports Med*. DOI 10.1007/s40279-022-01784-y (proximidad al fallo, meta-análisis).
- Robinson, Pelland, Zourdos et al., 2024, *Sports Med*. DOI 10.1007/s40279-024-02069-2 (meta-regresiones RIR estimado).
- Halperin et al., 2022, *Sports Med* (precisión al predecir repeticiones hasta el fallo).
- Singer et al., 2024, *Front Sports Act Living*. DOI 10.3389/fspor.2024.1429789 (descanso entre series e hipertrofia).
- Plotkin et al., 2022, *PeerJ*. DOI 10.7717/peerj.14142 (progresar por carga o por repeticiones).
- Schoenfeld, Ogborn & Krieger, 2017, *J Sports Sci* (volumen semanal) y Schoenfeld et al., 2017, *J Strength Cond Res* (cargas bajas y altas).
- Coleman et al., 2024 (descarga de una semana en entrenados).
- Remmert et al., 2025; Pelland et al., 2026; Pancar et al., 2026 (no confirmadas).
