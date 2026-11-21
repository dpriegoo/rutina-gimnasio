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
| `js/coach-ui.js` | Entrenador IA: hoja de chat y menú guiado; se abre desde la pestaña «Entrenador» de la barra inferior. |
| `supabase/` | Función de servidor `coach` (guarda la clave de Gemini), su SQL de límite diario y cómo desplegarla (ver `supabase/README.md`). |
| `js/ui-icons.js` | Iconos SVG propios (sin emojis) y logotipo: `uiIcon('nombre')`, `uiLogo(ancho)`, `hydrateIcons()`. |
| `js/prescription.js` | Prescripción serie a serie: categoría de fatiga, rango, descanso y RIR por ejercicio (tabla editable) y plan de hoy con doble progresión. |
| `js/deload.js` | Semana de descarga: estado, efectos y propuesta de cuándo hacerla a partir de tus datos (con el motivo). |
| `js/training.js` | Modo entreno: plan por series con un toque, cambio de máquina, descanso, barra de sesión y cierre de sesión. |
| `js/export.js` | Exportar datos: tarjeta al final de Métricas que exporta los registros de un rango de fechas (md para Claude, csv o json). |
| `js/day-view.js` | Tarjetas de ejercicio (carrusel horizontal), ejercicios prestados y resaltados. |
| `js/motion.js` | Bloqueo de zoom y animación de entrada a la app (barra con discos). Se omite con "reducir movimiento". |
| `js/day-picker.js` | Pantalla inicial "¿Qué día entrenas?", tira de progreso del día y desplazamiento del carrusel. |
| `js/editor.js` | Pestaña Editar. |
| `js/progress.js` | Descarga de progreso y refrescos automáticos. |
| `js/navigation.js` | Cambio de vista (Rutina / Métricas / Editar) desde la barra inferior. |
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
- `tests/prescription.test.js`: especificación por ejercicio y plan de hoy (doble progresión, máquinas, calentamientos, tiempo).
- `tests/deload.test.js`: semana de descarga (estado, plan, umbral de completo, avisos, exportación y propuesta con datos que la disparan y datos que no).
- `tests/training.test.js`: modo entreno, descanso, sesión, navegación, comparaciones justas, Métricas por secciones y editor.
- `tests/export.test.js`: exportación (rango, formatos, ida y vuelta, tarjeta, datos frescos).
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
- **Botones con icono:** deben estar en la lista de `display:inline-flex; align-items:center; justify-content:center` del final de `styles.css` (si no, el icono se queda más alto que el texto). Un botón nuevo con icono se añade a esa lista.
- **Selectores numéricos (`.stp`):** la unidad va en la etiqueta («Peso (kg)»), nunca dentro del valor, y el valor tiene `min-width:0`: con decimales (112,5) o tres cifras (120 s) el `+` no puede salirse. Probado a 320, 375, 390, 402 y 430 px.
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

## Exportar datos (export.js)
Tarjeta **Exportar datos** al final de la pestaña Métricas: se elige un rango de fechas (atajos 30 días / 90 días / este año / todo) y se exportan los registros de **todos los ejercicios** de ese rango, **solo del perfil con sesión**, con los dos extremos incluidos. Pensado para pasárselo a Claude y preguntarle sobre la rutina.
- **Formatos:** `md` (por defecto: lleva dentro la explicación de las columnas, la rutina actual, un resumen semanal y las series en un bloque CSV, así Claude lo entiende sin más contexto), `csv` (solo las series, con BOM para Excel y protección contra fórmulas en las notas) y `json` (una serie por línea). Números con **punto decimal** y fechas `AAAA-MM-DD` (legibles por máquinas), a diferencia de la pantalla.
- **Opciones:** incluir calentamientos (marcados con `calentamiento = 1`) e incluir peso corporal. La vista previa muestra registros, series de trabajo, sesiones y tamaño.
- **Salida:** *Descargar*, *Compartir* (menú del sistema, solo si el navegador lo permite) y *Copiar* (para pegar en el chat).
- **Origen de los datos:** la caché local, que se vuelve a leer de la base de datos al abrir Métricas si tiene más de 1 minuto (`exportFetchFresh`) y cada 2 minutos. El archivo dice de cuándo son (`window._lastSyncAt`) y si hay registros pendientes de sincronizar.
- **Pruebas:** `tests/export.test.js` incluye un viaje de ida y vuelta (notas con comas, comillas y saltos de línea salen intactas).

## Rediseño de uso (v2)
- **Navegación:** barra inferior (Rutina · Métricas · Entrenador · Editar) al alcance del pulgar; el entrenador es una pestaña, ya no hay botón flotante que tape controles. Dentro de un día la barra inferior se sustituye por la **barra de sesión** (tiempo, ejercicios completos y «Siguiente»). Cabecera con marca (logotipo + «IronLog») y avatar; pantalla de acceso con marca.
- **Tarjeta de ejercicio:** arriba, lo que se usa en cada serie (máquina con «Cambiar» y el **plan de hoy**); la gráfica, la técnica y el registro manual van en un detalle plegable. «Cambiar» elige la máquina con la que se registra (el plan y las marcas salen del historial de esa máquina).
- **Plan serie a serie** (`prescription.js`, `training.js`): cada serie con repeticiones objetivo y RIR (S1/S2/S3), un toque en **Hecha** (guarda por el flujo de siempre: pendiente → aceptar → cola; hay «Deshacer última»), pasos de ±carga y ±repeticiones, y temporizador de descanso según la categoría. En pantallas bajas el plan va primero y su explicación se pliega tras el botón «i».
- **Prescripción:** `categoria_fatiga` (pesado · accesorio · core), `descanso_seg` [mín, máx], `esquema_rir` [S1, S2, S3] y `rango_reps` por ejercicio. Los valores por defecto salen de la tabla `RX_TABLE` y de las categorías `RX_CATS`; el editor solo guarda lo que se aparta de ellos (así, si se ajusta la tabla, los ejercicios sin tocar la siguen). **Qué respalda la literatura cada valor y qué es criterio práctico: `docs/evidencia-prescripcion.md`.** Por defecto: pesados RIR 2 / 1 / 1 (nunca al fallo: dejar 1–3 repeticiones en reserva está respaldado; llevar al fallo solo la última serie, no), accesorios 1 / 1 / 0 (la última puede llegar al fallo técnico), core 1 / 1 / 0. RIR 0 = fallo técnico (última repetición con técnica limpia). El RIR se estima con error (de media ~1 repetición, y mucho más por encima de 12), de ahí el aviso en rangos altos. Peso muerto rumano 2 / 2 / 1 y los avisos de barra libre y espalda son criterio de prudencia, no un dato.
- **Doble progresión** (`rxPlan`): lee tu historial de ese ejercicio **y esa máquina**, ignora la sesión de hoy y los calentamientos (también una primera serie mucho más ligera, que suele ser un calentamiento anotado como trabajo). Tope del rango en las 3 series → sube carga y vuelve al mínimo; con plan previo mide lo conseguido contra lo previsto; sin plan previo supone que las series anteriores estaban cerca del fallo y reparte restando el RIR de cada serie (si la serie 1 no llegaría al mínimo, baja la carga).
- **Semana de descarga** (`deload.js`): 7 días con **2 series por ejercicio** (el umbral de «completo» pasa de 3 a 2), la **carga de siempre** y **un RIR más**; el plan no sube carga ni se guarda mientras tanto, las sesiones de una descarga no cuentan para el plan de después, no hay avisos de prioridad ni comparaciones de volumen, y la exportación marca esas semanas. Se activa desde la tarjeta del selector de día. La app **propone** cuándo hacerla con señales de tus datos (rendimiento a la baja, plan incumplido, semanas seguidas), siempre con el motivo; **no hay criterio validado sobre cuándo descargar** (ver `docs/evidencia-prescripcion.md`) y los umbrales son constantes editables de `deload.js`.
- **Cierre de sesión:** al completar el último ejercicio de un día tras registrar algo, resumen con duración, series, volumen (comparado solo si la semana pasada completaste ese día), marcas nuevas, series dentro del plan y siguiente día pendiente. Una vez por día y semana.
- **Comparaciones justas:** el resumen semanal compara con la semana pasada **hasta el mismo día**; la comparativa de un día a medias, con **los mismos ejercicios** de la semana pasada. En curso solo se destaca la subida (nunca alarma roja); con el día completo, la comparación de siempre.
- **Métricas por secciones:** Resumen · Cuerpo · Ejercicios · Datos (se recuerda la última). Las gráficas con menos de 4 puntos (3 semanas en el índice de fuerza) muestran «Aún pocos datos» en vez de una curva inventada; el historial se abre ya con lo último que hiciste; la altura se pone una vez y luego solo se muestra.
- **Editar:** tocar la fila edita; las flechas solo aparecen en el modo «Ordenar ejercicios»; el editor incluye categoría, descanso y RIR por serie, y enseña el rango efectivo.
