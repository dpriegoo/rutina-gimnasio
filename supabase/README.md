# Entrenador IA: despliegue (Supabase)

La app llama a una función de Supabase llamada **`coach`**, que guarda la clave de Gemini y habla con él.
**Subir estos archivos a GitHub NO la despliega**: hay que crearla en tu proyecto de Supabase (una sola vez).
(El consejo semanal sigue usando su función `hyper-handler`; esta no se toca.)

## 1. Comprueba si ya existe (10 segundos)
Abre en el navegador `https://TU-PROYECTO.supabase.co/functions/v1/coach` (el mismo dominio que usa la app).
- Si ves algo como `{"code":"NOT_FOUND","message":"Requested function was not found"}` → **no está desplegada**, o no se llama exactamente `coach`. Sigue con el punto 2.
- Si ves un 401 / "Missing authorization header" → **existe**, es lo normal sin sesión. Si aun así el chat falla, mira "Problemas" más abajo.

## 2. Desplegar desde el panel de Supabase (sin CLI)
(Los nombres de los menús pueden variar un poco según la versión del panel.)
1. **Límite diario:** SQL Editor → pega y ejecuta `supabase/coach.sql`.
2. **Clave de Gemini:** Edge Functions → *Secrets* (o *Manage secrets*) → añade `GEMINI_API_KEY` con tu clave. Opcionales: `GEMINI_MODEL` (por defecto `gemini-3.6-flash`), `GEMINI_FALLBACK_MODEL` (modelo de repuesto, ver "Saturación de Gemini"), `COACH_MAX_PER_DAY` (por defecto 300) y `GEMINI_THINKING` (ver "Velocidad"). **La clave solo va aquí, nunca en el código ni en GitHub.**
3. **La función:** Edge Functions → *Deploy a new function* → *Via Editor* → ponle **exactamente** el nombre `coach` → borra el código de ejemplo y pega **todo** el contenido de `supabase/coach-single-file.ts` → *Deploy*. Deja activada la verificación de JWT.
4. Recarga la app con sesión iniciada y abre el chat. Repite el punto 1 para comprobarlo.

Si cambias `handler.ts` o `index.ts`, regenera el archivo único con `npm run bundle:coach` (un test avisa si se queda desactualizado) y vuelve a pegarlo.

## 2b. Con la CLI de Supabase (alternativa)
```
supabase secrets set GEMINI_API_KEY=tu_clave --project-ref TU-PROYECTO
supabase functions deploy coach --project-ref TU-PROYECTO
```
(y el punto 1 de arriba para el SQL).

## Problemas
La app muestra el motivo en el chat, y el detalle técnico queda en la consola del navegador (`[coach]`).
| Qué ves | Qué pasa | Qué hacer |
|---|---|---|
| «No se pudo conectar con la función «coach»…» y en la red un **404** en `/functions/v1/coach` | La función no existe en tu proyecto o tiene otro nombre | Punto 2. Si ya la tenías con otro nombre, cambia `COACH_FUNCTION` en `js/coach.js` |
| «falta desplegar la función» | El servidor contestó 404 | Igual que arriba |
| Error del servidor «Falta configurar GEMINI_API_KEY» | No existe el secreto | Punto 2.2 |
| «No se pudo comprobar la cuenta o el límite diario» | Falta ejecutar el SQL | Punto 2.1 |
| «Cuenta sin acceso» | Tu usuario no está en `allowed_users` | Es la misma tabla que usa el login |
| «Gemini está saturado en este momento» / error con «high demand» | Pico de demanda de Google | Reintenta; si pasa a menudo, usa un modelo más estable en `GEMINI_MODEL` o define `GEMINI_FALLBACK_MODEL` |
| «Gemini respondió con un error: … model not found» | El nombre de `GEMINI_MODEL` no es válido para tu clave | Corrígelo en los secretos |

## Saturación de Gemini («high demand»)
A veces Google responde que el modelo está saturado («This model is currently experiencing high demand…»). Suele ser un pico corto y es más frecuente en modelos nuevos o en vista previa. La función hace lo siguiente:
- **Reintenta sola** (hasta 2 veces, esperando 0,35 s y 0,9 s) ante saturación o errores del servidor de Gemini. No reintenta errores de petición ni de cuota. Los reintentos **no gastan** tu límite diario.
- **Modelo de repuesto (opcional):** si defines el secreto `GEMINI_FALLBACK_MODEL`, tras agotar los reintentos prueba con ese modelo. Elige uno que te aparezca disponible en Google AI Studio y que sea estable (los modelos que no están en vista previa suelen tener más capacidad). Esta función no puede comprobar qué modelos puedes usar.
- Si aun así falla, el chat dice que Gemini está saturado y basta con pulsar «Reintentar».
- Cambiar de modelo es solo cambiar el secreto `GEMINI_MODEL`: no hace falta tocar el código.

## Velocidad
Lo que más pesa en el tiempo de respuesta, y qué se ha hecho:
- **Razonamiento de Gemini** (lo que más suele tardar en estos modelos): por defecto lo decide el modelo. Con `GEMINI_THINKING` (JSON) se le pide razonar menos o nada. El nombre del ajuste depende del modelo (por ejemplo `{"thinkingBudget":0}` en los modelos 2.5 o `{"thinkingLevel":"low"}` en los 3.x): **comprueba cuál admite el tuyo** en la documentación de Gemini. Si lo rechaza, la función reintenta sola sin él, así que equivocarse no rompe nada. Probar con y sin él es la forma de ver cuánto ganas en tus preguntas.
- **Una sola llamada por pregunta guiada**: la app adelanta los datos que cada opción necesita y los manda en el primer mensaje.
- **Streaming**: el texto aparece según Gemini lo escribe. La función reenvía el flujo tal cual.
- **La función espera menos antes de llamar a Gemini**: lee la identidad del propio JWT (sin consultar el servicio de autenticación), recuerda 5 minutos que la cuenta está permitida y comprueba cuenta y límite diario a la vez. Con `COACH_STRICT_AUTH=1` vuelve a comprobar el JWT en Autenticación (algo más lento).
- Al abrir el chat, la app avisa a la función (`ping`) para que no pague el arranque en frío en tu primera pregunta.

## Qué hace (y qué no) la función
- Comprueba la sesión del usuario y que esté en `allowed_users` (la firma del JWT la valida la pasarela de Supabase y, además, esas consultas a la base de datos se hacen con ese mismo JWT, que la base rechaza si es falso); aplica el límite diario.
- Solo acepta **texto** y las **herramientas de la app** (nada de archivos ni de herramientas con coste como la búsqueda de Google), con tamaños acotados.
- Manda la clave a Gemini en una **cabecera** (no en la URL) y nunca la devuelve, ni en los mensajes de error.
- No accede a tus tablas: las consultas a tus datos las ejecuta la app en el navegador con las políticas de acceso de siempre.

## Pruebas
`npm test` incluye `tests/coach-edge.test.js`, que prueba la función con Gemini y Supabase simulados (Node 22+).
