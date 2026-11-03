# IronLog

App de seguimiento de entrenamiento (PWA estática en GitHub Pages) con Supabase como backend.
No hay build ni framework: el navegador carga los archivos tal cual.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Solo la estructura (HTML) y la lista de scripts. No tiene lógica. |
| `styles.css` | Todo el CSS. |
| `version.json` | Versión vigente de la app (lo escribe `tools/stamp.js`). |
| `js/config.js` | Constantes, elección de backend (`?backend=supabase\|sheets`). |
| `js/utils.js` | Fechas/semana, escape de HTML, avisos, utilidades de filas. |
| `js/icons.js` | Pictogramas de ejercicios. |
| `js/routine-default.js` | Rutina inicial de 5 días (datos). |
| `js/api-supabase.js` | **Adaptador de datos**: traduce acciones de la app a consultas Supabase. |
| `js/api.js` | `postToSheet()`: único punto de entrada de datos (Supabase o Apps Script). |
| `js/auth.js` | Login con Google, logout, sesión rechazada. |
| `js/routine.js` | Modelo de la rutina editable + sincronización con el servidor. |
| `js/outbox.js` | Series pendientes y cola de envío con reintentos. |
| `js/body-svg.js` | Dibujo del cuerpo (frente/espalda) con zonas musculares finas. |
| `js/muscles.js` | Zonas musculares y diagrama de carga. |
| `js/planning.js` | Reequilibrio semanal, semana de descanso, recomendaciones. |
| `js/body.js` | Peso corporal y altura. |
| `js/history.js` | Métricas > Historial (editar/borrar series). |
| `js/metrics.js` | Métricas: mapa de calor, gráficas, índice de fuerza. |
| `js/summary.js` | Resumen semanal, comparación con el compañero, consejo de Gemini. |
| `js/progress-chart.js` | Gráficas de progresión por ejercicio: fuerza estimada, tendencia, volumen y avisos de estancamiento. |
| `js/coach-tools.js` | Entrenador IA: las herramientas que Gemini puede llamar sobre los datos del usuario (semana, rutina, progresión, carga muscular…). |
| `js/coach.js` | Entrenador IA: bucle con Gemini (pregunta → herramientas → respuesta), prompt de sistema y errores. |
| `js/coach-ui.js` | Entrenador IA: botón flotante, hoja de chat y menú guiado. |
| `supabase/` | Función de servidor `coach` (guarda la clave de Gemini), su SQL de límite diario y cómo desplegarla (ver `supabase/README.md`). |
| `js/day-view.js` | Tarjetas de ejercicio (carrusel horizontal), ejercicios prestados y resaltados. |
| `js/motion.js` | Bloqueo de zoom y animación de entrada a la app (barra con discos). Se omite con "reducir movimiento". |
| `js/day-picker.js` | Pantalla inicial "¿Qué día entrenas?", tira de progreso del día y desplazamiento del carrusel. |
| `js/editor.js` | Pestaña Editar. |
| `js/progress.js` | Descarga de progreso y refrescos automáticos. |
| `js/navigation.js` | Cambio de vista (Rutina / Métricas / Editar). |
| `js/main.js` | Arranque + comprobación de versión. **Siempre el último.** |
| `tools/stamp.js` | Sella las URLs con un hash para esquivar la caché. |
| `tests/` | Pruebas (Node, sin navegador). |
| `tools/sim/` | Simulaciones (Python) con las que se eligió la métrica de progresión y la regla de estancamiento. |

## Cómo funciona (claves para no perderse)

- **Los scripts no son módulos ES**: son scripts normales que comparten un único ámbito global,
  exactamente igual que cuando todo estaba en un solo `index.html`. Por eso las funciones
  llamadas desde el HTML (`onclick="saveExerciseEditor()"`) siguen funcionando.
- **El orden de carga importa** y está en `index.html` (de arriba abajo = de menos a más dependiente).
  Un archivo puede usar funciones de cualquier otro dentro de sus funciones, pero lo que se ejecuta
  *al cargar* (constantes, `addEventListener`…) solo puede usar archivos anteriores.
- **Capa de datos**: la app solo habla con `postToSheet({action: ...})`. Hoy lo atiende
  `api-supabase.js`. Cambiar de backend = tocar solo ese adaptador.
- **Sesión**: la gestiona `supabase-js` (se guarda en `localStorage`, se renueva sola). La clave
  `sessionToken` de `localStorage` es solo un marcador de "hay sesión".

## Cambiar algo y subirlo

1. Edita el archivo que toque (el mapa de arriba dice cuál).
2. `npm install` (solo la primera vez) y `npm test`.
3. `npm run stamp` — recalcula las versiones (`?v=…`) y `version.json`.
4. Sube **todo lo que haya cambiado** al repositorio (siempre `index.html` y `version.json`).

Si no ejecutas el paso 3, la caché del navegador (unos 10 min en GitHub Pages) puede servir
archivos viejos mezclados con nuevos. Aun así, al arrancar la app compara `version.json` con la
versión con la que se cargó y, si no coinciden, se recarga una vez sola.

## Pruebas

- `tests/adapter.test.js`: el adaptador de Supabase contra una API simulada.
- `tests/smoke.test.js`: arranca la página real en jsdom (con y sin sesión), elige día, recorre el carrusel, abre la hoja de progresión y navega entre vistas.
- `tests/style.test.js`: contraste, tamaño mínimo de texto, escalas de tipografía/radios/colores, campos a 16 px, zoom bloqueado y que las animaciones respeten "reducir movimiento".
- `tests/coach.test.js`, `tests/coach-edge.test.js`: entrenador IA (ver su sección).
- `tests/machines.test.js`: "Últ", "Supera" y marca personal por máquina (sin 🏆 falsos ni récords bloqueados por otra máquina).
- `tests/coherence.test.js`: formato de números y misma métrica en hoja de ejercicio, Resumen e índice de fuerza.
- `tests/a11y.test.js`: etiquetas, roles, estados, teclado, foco y reducir movimiento en "Siente".
- `tests/progress-chart.test.js`: la historia de un ejercicio junta todos los días, excluye calentamiento y otros perfiles; mini gráfica y hoja sin valores inválidos.


## Elegir día y gráficas (day-picker.js, progress-chart.js)
- Al abrir la app sale `#dayPicker` (una ficha por día, con el grupo muscular y una tira de estado por ejercicio; "Toca hoy" marca el día sugerido). `openDay(i)` muestra `#dayScreen`; `showDayPicker()` vuelve.
- Dentro del día, `#main` es un carrusel (`scroll-snap`): cada ejercicio es una `.card`. La tira `#exStrip` tiene un segmento por tarjeta con el mismo código de color (verde 3 series, ámbar empezado).
- `renderTabs()` sigue siendo el "refrescar estado semanal" que llama todo el código: ahora repinta las fichas y la tira.
- Las gráficas leen `window._progressCache` filtrando por **nombre de ejercicio** (no por día), así un ejercicio que se hace en varios días suma todas sus sesiones. El calentamiento no cuenta.
- **Métrica = "fuerza estimada"**: por sesión, la media (ponderada por nº de series) de `peso × reps^0,10` de las series de trabajo; en ejercicios por tiempo, la mejor serie en segundos. No coincide a propósito con el 1RM de Epley de Métricas/marcas personales (ver la nota al pie de la hoja).
- **Máquinas (variantes):** una sesión en la máquina secundaria mueve otro peso y, mezclada con las demás, hundía la fiabilidad de las gráficas (`tools/sim/sim_variantes.py`: 61-73 % de falsas alarmas con sesiones intercaladas, 100 % si las últimas eran en la secundaria). Ahora `exerciseSessions` separa por (fecha, máquina) y `exerciseSeries()` usa una máquina de **referencia** (la más usada en las últimas 8 sesiones) y **ajusta** las demás a su escala con el cociente típico frente a las sesiones de referencia vecinas, solo si hay al menos 2 entre sesiones de referencia (si no, esas sesiones no entran y la tarjeta lo dice). La hoja de cada ejercicio tiene selector "Combinada / máquina". Además, "Últ", "Supera" y la marca personal 🏆 se calculan **por máquina** (la elegida en el desplegable de la tarjeta). Tarjeta, hoja, Resumen, Comparativa e Índice de fuerza usan `exerciseSeries()`.
- **La misma métrica en toda la app:** hoja de cada ejercicio, "Progresión del ejercicio" e "Índice de fuerza" de Métricas, "Mejoras de la semana" del Resumen (solo cuentan subidas de 1,5 % o más) y la Comparativa del día. Solo siguen usando la mejor serie con Epley las marcas personales (🏆) y el "Supera", porque son récords de una serie.
- **Cambio** (chip de la tarjeta): media de las últimas 3 sesiones frente a las 3 anteriores. **Tendencia / estancamiento** (hoja): regresión sobre las últimas 8 sesiones; con menos no se afirma nada.
- Por qué así: `tools/sim/` tiene las simulaciones que lo justifican (`python3 tools/sim/sim_progresion.py`; necesita numpy y scipy). Resumen: mezclar peso y reps detecta mucho mejor la progresión que el peso máximo (ignora reps) o el volumen total (sube con solo añadir una serie); promediar series es más estable que la mejor serie; y la regla antigua de estancamiento (3 sesiones con rango < 1,5 %) no distinguía nada. Los supuestos (ruido, ritmo de mejora, forma de entrenar) son de la simulación, no de datos reales.
- Los colores de cada día son `--d1…--d5` en `styles.css`.
- **Movimiento** (solo `transform`/`opacity`, todo dentro de `@media (prefers-reduced-motion:no-preference)` o protegido por `motionOK()`): entrada a la app (`motion.js`), cascada de fichas, expansión de la ficha al elegir día (`openDayAnimated`), entrada de las tarjetas, gráfica que se dibuja al quedar a la vista y pulso verde al completar un ejercicio. Las pantallas se refrescan en sitio (la tira y las fichas no se reconstruyen) para que una actualización de datos no repita animaciones. `openDay(i)` es la apertura inmediata (la usan los tests).
- **Legibilidad y uso con una mano:** botones con texto blanco usan `--blue-btn` (contraste 4,85:1; el `--blue` puro solo da 3,9:1), texto azul usa `--blue-text`, ningún texto por debajo de 11 px, campos a 16 px (si no, iOS hace zoom al enfocar), controles principales a 44 px (`--tap`), y dentro de un día la cabecera se compacta (`body.in-day`). `tests/style.test.js` vigila todo esto.
- **Zoom bloqueado a propósito** (viewport `maximum-scale=1, user-scalable=no`, `touch-action`, y `gesturestart`/multitoque en `motion.js`). Es una decisión de diseño; si algún día se quiere permitir, hay que quitarlo en esos tres sitios.

## Dónde sentir el esfuerzo (feel-*.js)
- `js/feel-data.js`: una ficha por tipo de ejercicio (músculo principal/apoyo, parte a notar, indicaciones, aviso, animación). Para añadir un ejercicio nuevo basta con una entrada más en `FEEL_PROFILES`.
- `js/feel-anim.js`: motor de animación (muñeco con huesos en SVG) y los 23 patrones de movimiento.
- `js/feel.js`: línea "SIENTE", silueta y panel desplegable de la tarjeta.
- Un ejercicio se enlaza con su ficha por la clave `feel` (se elige en Editar → "Músculo y animación"), si no por su nombre y, si no, por su icono.
- `tests/feel.test.js` comprueba que todos los ejercicios tienen ficha y que las animaciones se pintan sin errores.

## Convenciones de interfaz (para no perder la coherencia)
- **Números**: siempre con `fmtNum()`/`fmtKg()` de `utils.js` (coma decimal y punto de millar, también en los de 4 cifras; `toLocaleString` no lo hace). En gráficas, `callback: v => fmtNum(v, 0)` en los ejes.
- **Colores**: variables de `styles.css` (`--blue-btn` para fondos con texto blanco, `--blue-text` para texto azul, `--red`, `--heat1…4`, `--d1…--d5` por día). En Chart.js y SVG, `chartTheme()` / `themeColor()` leen esas variables; no pongas hexadecimales sueltos.
- **Escalas**: texto 11-12-13-14-15-16-18-20-22-24-28-36 px (nada por debajo de 11; campos a 16), radios 4-8-12-16-20 y pastilla (99). `tests/style.test.js` pone un tope.
- **Color de cada día** (`dayColorVar(i)`): selector, día, hoja, Editar y Comparativa; en el Resumen, los días pendientes.
- **Accesibilidad**: todo `<button>` lleva `type`; los de solo icono, `aria-label`; las pantallas superpuestas son `role="dialog"` con `aria-labelledby`, se cierran con Escape y devuelven el foco (`focusOpen`/`focusClose`); el estado nunca va solo en el color (los segmentos y fichas lo dicen en su `aria-label`). Con "reducir movimiento" las animaciones de "Siente" se quedan en una pose fija. El zoom sigue bloqueado a propósito.

## Entrenador IA (coach-*.js + supabase/functions/coach)
Un botón flotante abre un chat con Gemini que responde **con los datos del propio usuario**. Al abrirlo pregunta qué se quiere preguntar (planificar la semana, un ejercicio de hoy, progresión de un ejercicio, revisión general o pregunta libre).
- **Cómo consulta datos:** Gemini no escribe SQL ni toca la base de datos. Pide una **herramienta** por su nombre y con parámetros (`COACH_TOOLS` en `coach-tools.js`), la app la ejecuta en el navegador con las mismas funciones que calculan todo lo demás (fuerza estimada, máquinas, carga muscular, estado de la semana) y le devuelve un JSON pequeño. Por eso los números del chat coinciden siempre con los de la app y Gemini solo interpreta. Los datos son los del usuario ya descargados con las políticas de acceso de Supabase (nunca los de otro perfil).
- **Bucle** (`coachAsk` en `coach.js`): conversación → función `coach` → Gemini responde con texto o con llamadas a herramientas (en paralelo si quiere) → se ejecutan y se devuelven → hasta que contesta con texto (máximo 8 vueltas). La respuesta del modelo se guarda **tal cual** (incluye las firmas de razonamiento, que Gemini exige al devolver llamadas a herramientas).
- **Añadir una herramienta:** una entrada nueva en `COACH_TOOLS` (`name`, `description`, `parameters`, `run`); `run` devuelve un objeto pequeño y no debe lanzar. Si cambia qué consultar según la intención, se dice en el prompt (`coachSystemPrompt`).
- **Privacidad:** a Gemini solo llega lo que devuelven las herramientas que pidió para esa pregunta, no toda la base de datos. Cada respuesta tiene "Datos consultados" desplegable. El chat se guarda solo como texto, por perfil, 24 h, y se borra al cerrar sesión. Ojo: esos datos salen hacia la API de Google; conviene revisar las condiciones de tu plan.
- **Velocidad:** la app adelanta en local los datos que cada opción del menú necesita (`coachPrefetchPlan`) y los manda en el primer mensaje, así que una pregunta guiada cuesta **1 llamada a Gemini** (antes 3); la respuesta llega en streaming (`coachCallStream`) y se pinta según se escribe; al abrir el chat se "calienta" la función (`coachWarm`). En el servidor: JWT leído sin llamar a Auth, cuenta permitida en caché 5 min y consultas en paralelo; el razonamiento de Gemini es ajustable con `GEMINI_THINKING` (ver `supabase/README.md`). `COACH_STREAM = false` desactiva el streaming. Los datos adelantados van solo en el último mensaje del usuario (no se acumulan) y salen en "Datos consultados" como *(adelantado)*.
- **Seguridad:** la clave de Gemini solo existe en la función de servidor; esta comprueba la sesión y `allowed_users`, aplica un límite diario, solo acepta texto y las herramientas de la app, y manda la clave en una cabecera. Lo que escribe Gemini se pinta siempre escapado (nunca como HTML).
- **Pruebas:** `tests/coach.test.js` (herramientas con tu escenario, bucle con Gemini simulado, errores, interfaz) y `tests/coach-edge.test.js` (la función de servidor, con Node 22+).
