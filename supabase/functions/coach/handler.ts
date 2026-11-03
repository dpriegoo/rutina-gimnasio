// =====================================================================
// Función de servidor "coach"  (supabase/functions/coach/handler.ts)
// Intermediario entre la app y Gemini. Guarda la clave de Gemini (la app nunca la ve), comprueba que quien
// llama es un usuario permitido, aplica un límite diario y limita lo que se puede enviar a Gemini
// (solo texto y herramientas de la app: nada de archivos ni de herramientas con coste, como la búsqueda).
// Es un módulo puro: la autenticación, el límite y la llamada a Gemini se inyectan (index.ts las conecta a
// Supabase y a la red), así que se puede probar sin Deno ni red (tests/coach-edge.test.js).
// =====================================================================

export interface Deps {
  geminiKey: string;
  model: string;
  maxPerDay: number;
  authenticate(jwt: string): Promise<{ id: string } | null>;
  isAllowed(jwt: string): Promise<boolean>;
  useQuota(jwt: string, max: number): Promise<number>;   // llamadas que quedan hoy; -1 si se ha superado
  fetch: typeof fetch;
  timeoutMs?: number;
  // Ajuste del razonamiento de Gemini (opcional, p. ej. {"thinkingBudget":0} o {"thinkingLevel":"low"}; depende del modelo).
  // Razonar menos suele ser lo que más acelera la respuesta. Si Gemini lo rechaza (400 que menciona "think"), se reintenta sin él.
  thinkingConfig?: Record<string, unknown> | null;
  // Modelo de repuesto (opcional): si el principal sigue fallando por saturación tras los reintentos, se prueba con este.
  fallbackModel?: string;
  sleep?: (ms: number) => Promise<void>;     // para poder probar los reintentos sin esperar
}

// Los reintentos solo se hacen ante fallos PASAJEROS de Gemini (saturación y errores del servidor), no ante errores de petición ni de cuota.
const TRANSIENT = [500, 502, 503, 504];
const RETRY_DELAYS_MS = [350, 900];        // hasta 2 reintentos con espera creciente

export const LIMITS = {
  maxBodyChars: 600_000, maxContents: 80, maxParts: 16, maxTextChars: 40_000, maxSystemChars: 20_000,
  maxDeclarations: 24, maxToolsChars: 60_000, maxOutputTokens: 4096, defaultOutputTokens: 2048,
};

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
function fail(status: number, code: string, message: string): Response { return reply(status, { code, message }); }

// Nunca se devuelve la clave, ni siquiera si Gemini la repitiera en un mensaje de error
function scrub(text: string, key: string): string {
  let t = String(text || '');
  if (key) t = t.split(key).join('***');
  return t.replace(/AIza[0-9A-Za-z_\-]{20,}/g, '***').slice(0, 400);
}

// El payload de un JWT (sin comprobar la firma). Sirve para saber quién es y cuándo caduca SIN llamar al servicio de
// autenticación (un viaje de red menos en cada llamada). No es una comprobación de seguridad por sí sola: la firma ya la
// valida la pasarela de Supabase (verify_jwt) y, además, la consulta a allowed_users y el límite diario se hacen con ese
// mismo JWT contra la base de datos, que lo rechaza si es falso.
export function decodeJwt(jwt: string): { sub?: string; exp?: number } | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const json = decodeURIComponent(Array.from(bin, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const o = JSON.parse(json);
    return o && typeof o === 'object' ? o : null;
  } catch { return null; }
}

// Memoriza un resultado AFIRMATIVO durante ttlMs por clave (el JWT completo). Los resultados negativos no se guardan,
// así un token falso nunca queda "aprobado" y una cuenta recién dada de alta se reconoce en la siguiente llamada.
export function cached<T>(fn: (k: string) => Promise<T>, ttlMs: number, max = 50, now: () => number = () => Date.now()): (k: string) => Promise<T> {
  const m = new Map<string, { v: T; t: number }>();
  return async (k: string): Promise<T> => {
    const e = m.get(k);
    if (e && now() - e.t < ttlMs) return e.v;
    const v = await fn(k);
    if (v) { if (m.size >= max) m.delete(m.keys().next().value as string); m.set(k, { v, t: now() }); }
    return v;
  };
}

const PART_KEYS = ['text', 'thought', 'thoughtSignature', 'functionCall', 'functionResponse'];

// Valida y limpia el cuerpo. Devuelve el cuerpo seguro o un texto con el motivo.
export function validateBody(b: any): { ok: true; value: any } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'cuerpo inválido' };
  if (b.ping === true) return { ok: true, value: { ping: true } };
  if (typeof b.system !== 'string' || !b.system.trim() || b.system.length > LIMITS.maxSystemChars) return { ok: false, error: 'system inválido' };
  if (!Array.isArray(b.contents) || b.contents.length < 1 || b.contents.length > LIMITS.maxContents) return { ok: false, error: 'contents inválido' };
  for (const c of b.contents) {
    if (!c || (c.role !== 'user' && c.role !== 'model')) return { ok: false, error: 'rol no permitido' };
    if (!Array.isArray(c.parts) || c.parts.length < 1 || c.parts.length > LIMITS.maxParts) return { ok: false, error: 'parts inválido' };
    for (const p of c.parts) {
      if (!p || typeof p !== 'object') return { ok: false, error: 'part inválido' };
      for (const k of Object.keys(p)) if (!PART_KEYS.includes(k)) return { ok: false, error: 'tipo de contenido no permitido: ' + k };
      if (p.text !== undefined && (typeof p.text !== 'string' || p.text.length > LIMITS.maxTextChars)) return { ok: false, error: 'texto inválido' };
      if (p.functionCall !== undefined && (typeof p.functionCall?.name !== 'string')) return { ok: false, error: 'functionCall inválido' };
      if (p.functionResponse !== undefined && (typeof p.functionResponse?.name !== 'string' || typeof p.functionResponse?.response !== 'object')) return { ok: false, error: 'functionResponse inválido' };
    }
  }
  let tools: any[] | undefined;
  if (b.tools !== undefined) {
    if (!Array.isArray(b.tools) || b.tools.length > 1) return { ok: false, error: 'tools inválido' };
    for (const t of b.tools) {
      const extra = Object.keys(t || {}).filter(k => k !== 'functionDeclarations');
      if (extra.length) return { ok: false, error: 'herramienta no permitida: ' + extra.join(',') };
      if (!Array.isArray(t.functionDeclarations) || t.functionDeclarations.length > LIMITS.maxDeclarations) return { ok: false, error: 'functionDeclarations inválido' };
    }
    if (JSON.stringify(b.tools).length > LIMITS.maxToolsChars) return { ok: false, error: 'tools demasiado grande' };
    tools = b.tools;
  }
  const g = b.generationConfig || {};
  const t = Number(g.temperature), m = Number(g.maxOutputTokens);
  const generationConfig = {
    temperature: isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5,
    maxOutputTokens: isFinite(m) ? Math.min(LIMITS.maxOutputTokens, Math.max(64, Math.floor(m))) : LIMITS.defaultOutputTokens,
  };
  return { ok: true, value: { system: b.system, contents: b.contents, tools, generationConfig, stream: b.stream === true } };
}

export async function handleCoach(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(204, null);
  if (req.method !== 'POST') return fail(405, 'bad_request', 'Solo POST');

  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return fail(401, 'unauthorized', 'Falta la sesión');
  const jwt = m[1];
  if (!(await deps.authenticate(jwt))) return fail(401, 'unauthorized', 'Sesión no válida');

  if (!deps.geminiKey) return fail(503, 'unavailable', 'Falta configurar GEMINI_API_KEY en la función');

  // Primero lo barato (el cuerpo): una petición mal formada no gasta consultas a la base de datos
  const raw = await req.text();
  if (raw.length > LIMITS.maxBodyChars) return fail(413, 'too_large', 'Petición demasiado grande');
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return fail(400, 'bad_request', 'JSON inválido'); }
  const v = validateBody(parsed);
  if (!v.ok) return fail(400, 'bad_request', v.error);
  const body = v.value;

  // Cuenta permitida y límite diario EN PARALELO (antes eran dos esperas seguidas). El aviso de "calentar"
  // (ping) solo comprueba la cuenta y no gasta cuota ni llama a Gemini: sirve para despertar la función.
  let allowed: boolean, left = 0;
  try {
    if (body.ping) { allowed = await deps.isAllowed(jwt); }
    else { [allowed, left] = await Promise.all([deps.isAllowed(jwt), deps.useQuota(jwt, deps.maxPerDay)]); }
  } catch (e) { return fail(503, 'unavailable', 'No se pudo comprobar la cuenta o el límite diario (¿falta ejecutar supabase/coach.sql?)'); }
  if (!allowed) return fail(403, 'forbidden', 'Cuenta sin acceso');
  if (body.ping) return reply(200, { ok: true });
  if (left < 0) return fail(429, 'limit', 'Límite diario alcanzado');

  const generationConfig: Record<string, unknown> = { ...body.generationConfig };
  if (deps.thinkingConfig) generationConfig.thinkingConfig = deps.thinkingConfig;
  const payload: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: body.system }] },
    contents: body.contents,
    generationConfig,
  };
  if (body.tools) { payload.tools = body.tools; payload.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }; }

  const stream = body.stream === true;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? (stream ? 90_000 : 55_000));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // La clave va en una cabecera (no en la URL), para que no quede en registros de peticiones
  const send = (model: string) => deps.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`,
    { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': deps.geminiKey }, body: JSON.stringify(payload) });
  // Un intento completo con un modelo: el ajuste de razonamiento se quita si el modelo no lo admite, y la saturación pasajera se reintenta
  const attempt = async (model: string): Promise<Response> => {
    let r = await send(model);
    if (r.status === 400 && generationConfig.thinkingConfig) {
      const t = await r.clone().text().catch(() => '');
      if (/think/i.test(t)) { delete generationConfig.thinkingConfig; r = await send(model); }   // este modelo no admite ese ajuste: sin él
    }
    for (let i = 0; i < RETRY_DELAYS_MS.length && TRANSIENT.includes(r.status); i++) { await sleep(RETRY_DELAYS_MS[i]); r = await send(model); }
    return r;
  };
  let res: Response, usedModel = deps.model;
  try {
    res = await attempt(deps.model);
    if (TRANSIENT.includes(res.status) && deps.fallbackModel && deps.fallbackModel !== deps.model) {
      usedModel = deps.fallbackModel; res = await attempt(deps.fallbackModel);                     // el principal sigue saturado: modelo de repuesto
    }
  } catch (e) {
    clearTimeout(timer);
    return fail(503, 'unavailable', ctl.signal.aborted ? 'Gemini tardó demasiado' : 'No se pudo contactar con Gemini');
  }

  if (res.ok && stream && res.body) {
    // Se reenvía el flujo de Gemini tal cual: el navegador va pintando el texto según llega
    const piped = res.body.pipeThrough(new TransformStream({ flush() { clearTimeout(timer); } }));
    return new Response(piped, { status: 200, headers: { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no', 'x-coach-model': usedModel } });
  }
  clearTimeout(timer);

  let data: any = null;
  try { data = await res.json(); } catch { /* respuesta no JSON */ }
  if (Array.isArray(data)) data = data[0];

  if (!res.ok) {
    const detail = scrub(data?.error?.message || ('HTTP ' + res.status), deps.geminiKey);
    // 429 de Gemini NO es nuestro límite diario: se devuelve como "no disponible" para no confundir.
    // La saturación pasajera (503, "high demand") tiene su propio código para poder avisar de que basta con reintentar.
    const overloaded = res.status === 503 || /high demand|overloaded/i.test(detail);
    return fail(res.status === 429 || res.status >= 500 ? 503 : 502, overloaded ? 'overloaded' : 'unavailable', 'Gemini respondió con un error: ' + detail);
  }
  const cand = data?.candidates?.[0];
  if (data?.promptFeedback?.blockReason || (!cand?.content && cand?.finishReason && cand.finishReason !== 'STOP')) {
    return fail(422, 'blocked', 'Gemini no pudo responder (' + scrub(data?.promptFeedback?.blockReason || cand?.finishReason, deps.geminiKey) + ')');
  }
  return reply(200, { content: cand?.content ?? null, finishReason: cand?.finishReason ?? null, usage: data?.usageMetadata ?? null, remaining: left, model: usedModel });
}
