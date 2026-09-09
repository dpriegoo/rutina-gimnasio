# 🏋️ IronLog

Aplicación web personal para seguir una rutina de fuerza en gimnasio (máquinas Technogym), registrar el progreso serie a serie y visualizarlo en gráficas — todo en un único archivo HTML, sin backend propio ni frameworks.

**🔗 Demo:** _https://dpriegoo.github.io/rutina-gimnasio/_

## Funcionalidades

- **Rutina de 5 días** con ficha por ejercicio: máquina a usar (y alternativas si está ocupada), cómo ejecutarlo, y series/repeticiones objetivo.
- **Registro de series** por ejercicio, con borrador local antes de confirmar el día y enviarlo.
- **Selector de perfil** (estilo Netflix) para que varias personas usen la misma app y hoja de datos sin mezclarse.
- **Cronómetro de descanso** integrado (3 min), con vibración y aviso sonoro.
- **Panel de métricas**: mapa de calor de constancia, progresión de peso y 1RM estimado (fórmula de Epley) por ejercicio, volumen semanal total, e historial editable.
- **Resumen semanal**: días entrenados, volumen vs. semana anterior, mejoras recientes por ejercicio, y comparativa entre perfiles.
- Pensada para funcionar como **PWA** añadida a la pantalla de inicio (iOS/Android), 100% responsive.

## Cómo funciona

- **Frontend:** HTML + CSS + JavaScript vanilla (sin build, sin dependencias salvo [Chart.js](https://www.chartjs.org/) vía CDN).
- **Backend:** una hoja de [Google Sheets](https://sheets.google.com) como base de datos, con un [Google Apps Script](https://developers.google.com/apps-script) publicado como Web App que expone `doGet`/`doPost` para leer y escribir registros.
- **Hosting:** [GitHub Pages](https://pages.github.com/), gratis.

No hay servidor propio ni base de datos tradicional — todo el "backend" es la combinación Google Sheets + Apps Script, elegida para que sea gratis y no requiera mantenimiento.

## Motivación

Proyecto personal para no depender de apps de terceros para algo tan simple como saber qué máquina tocaba usar y cuánto peso llevaba la última vez — y de paso, para practicar construyendo una herramienta real de principio a fin.

## Licencia

Uso personal — libre de usar como referencia o base para tu propio proyecto.
