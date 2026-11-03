# Entrenador IA: despliegue (Supabase)

La app llama a la función **`coach`**, que guarda la clave de Gemini y habla con él. Hay que desplegarla una vez.
(El consejo semanal sigue usando su función `hyper-handler`; esta no se toca.)

1. **Límite diario** — en Supabase > SQL Editor, ejecuta `supabase/coach.sql`.
2. **Secretos** (con la CLI de Supabase, en la carpeta del proyecto):
   ```
   supabase secrets set GEMINI_API_KEY=tu_clave
   supabase secrets set GEMINI_MODEL=gemini-3.6-flash      # opcional: es el valor por defecto
   supabase secrets set COACH_MAX_PER_DAY=300              # opcional: llamadas a Gemini por usuario y día
   supabase secrets set GEMINI_THINKING='{"thinkingBudget":0}'   # opcional, para ir más rápido: ver "Velocidad"
   ```
3. **Desplegar**: `supabase functions deploy coach`
4. Abre la app con sesión iniciada: aparece un botón flotante abajo a la derecha. Pregúntale algo.

Si algo falla, la propia app lo dice en el chat y en la consola del navegador (`[coach]`) queda el detalle:
- *«falta desplegar la función»* → paso 3. · *«No se pudo comprobar el límite»* → paso 1. · *«Falta configurar GEMINI_API_KEY»* → paso 2.
- *«Gemini respondió con un error: … model not found»* → el nombre de `GEMINI_MODEL` no es válido para tu clave.

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
