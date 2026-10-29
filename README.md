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
| `js/progress-chart.js` | Gráficas de progresión por ejercicio: mini gráfica de la tarjeta y hoja de detalle (1RM, volumen, estancamiento). |
| `js/day-view.js` | Tarjetas de ejercicio (carrusel horizontal), ejercicios prestados y resaltados. |
| `js/day-picker.js` | Pantalla inicial "¿Qué día entrenas?", tira de progreso del día y desplazamiento del carrusel. |
| `js/editor.js` | Pestaña Editar. |
| `js/progress.js` | Descarga de progreso y refrescos automáticos. |
| `js/navigation.js` | Cambio de vista (Rutina / Métricas / Editar). |
| `js/main.js` | Arranque + comprobación de versión. **Siempre el último.** |
| `tools/stamp.js` | Sella las URLs con un hash para esquivar la caché. |
| `tests/` | Pruebas (Node, sin navegador). |

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
- `tests/progress-chart.test.js`: la historia de un ejercicio junta todos los días, excluye calentamiento y otros perfiles; mini gráfica y hoja sin valores inválidos.


## Elegir día y gráficas (day-picker.js, progress-chart.js)
- Al abrir la app sale `#dayPicker` (una ficha por día, con el grupo muscular y una tira de estado por ejercicio; "Toca hoy" marca el día sugerido). `openDay(i)` muestra `#dayScreen`; `showDayPicker()` vuelve.
- Dentro del día, `#main` es un carrusel (`scroll-snap`): cada ejercicio es una `.card`. La tira `#exStrip` tiene un segmento por tarjeta con el mismo código de color (verde 3 series, ámbar empezado).
- `renderTabs()` sigue siendo el "refrescar estado semanal" que llama todo el código: ahora repinta las fichas y la tira.
- Las gráficas leen `window._progressCache` filtrando por **nombre de ejercicio** (no por día), así un ejercicio que se hace en varios días suma todas sus sesiones. Valor = mejor 1RM (Epley) de cada fecha, o segundos en ejercicios por tiempo. El calentamiento no cuenta.
- Los colores de cada día son `--d1…--d5` en `styles.css`.

## Dónde sentir el esfuerzo (feel-*.js)
- `js/feel-data.js`: una ficha por tipo de ejercicio (músculo principal/apoyo, parte a notar, indicaciones, aviso, animación). Para añadir un ejercicio nuevo basta con una entrada más en `FEEL_PROFILES`.
- `js/feel-anim.js`: motor de animación (muñeco con huesos en SVG) y los 23 patrones de movimiento.
- `js/feel.js`: línea "SIENTE", silueta y panel desplegable de la tarjeta.
- Un ejercicio se enlaza con su ficha por la clave `feel` (se elige en Editar → "Músculo y animación"), si no por su nombre y, si no, por su icono.
- `tests/feel.test.js` comprueba que todos los ejercicios tienen ficha y que las animaciones se pintan sin errores.
