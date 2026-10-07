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
| `js/muscles.js` | Zonas musculares y diagrama de carga. |
| `js/planning.js` | Reequilibrio semanal, semana de descanso, recomendaciones. |
| `js/body.js` | Peso corporal y altura. |
| `js/history.js` | Métricas > Historial (editar/borrar series). |
| `js/metrics.js` | Métricas: mapa de calor, gráficas, índice de fuerza. |
| `js/summary.js` | Resumen semanal, comparación con el compañero, consejo de Gemini. |
| `js/day-view.js` | Pestañas de día y tarjetas de ejercicio. |
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
- `tests/smoke.test.js`: arranca la página real en jsdom (con y sin sesión) y navega entre vistas.
