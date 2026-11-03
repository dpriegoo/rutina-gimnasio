// Punto de entrada de la función "coach" (Deno / Supabase Edge Functions). La lógica está en handler.ts.
// Variables (supabase secrets set …):  GEMINI_API_KEY (obligatoria) · GEMINI_MODEL (por defecto gemini-3.6-flash) · COACH_MAX_PER_DAY (por defecto 300)
//   GEMINI_THINKING (opcional, JSON: razonamiento de Gemini, p. ej. {"thinkingBudget":0} o {"thinkingLevel":"low"}) · COACH_STRICT_AUTH=1 (comprueba el JWT con el servicio de autenticación en cada llamada: algo más lento)
// SUPABASE_URL y SUPABASE_ANON_KEY las pone Supabase solo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCoach, decodeJwt, cached } from './handler.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
// Cliente que actúa COMO el usuario (con su JWT): las políticas de acceso de Supabase se siguen aplicando
const as = (jwt: string) => createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } });

const strict = Deno.env.get('COACH_STRICT_AUTH') === '1';
let thinking: Record<string, unknown> | null = null;
try { const t = Deno.env.get('GEMINI_THINKING'); if (t) thinking = JSON.parse(t); } catch { /* JSON inválido: se ignora */ }

// La cuenta permitida se recuerda 5 minutos por sesión (solo si es afirmativa): ahorra una consulta a la base de datos en cada vuelta
const allowedCached = cached(async (jwt: string) => { const { data, error } = await as(jwt).from('allowed_users').select('profile').maybeSingle(); return !error && !!data; }, 5 * 60_000);

Deno.serve((req: Request) => handleCoach(req, {
  geminiKey: Deno.env.get('GEMINI_API_KEY') ?? '',
  model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash',
  maxPerDay: Number(Deno.env.get('COACH_MAX_PER_DAY') ?? '300'),
  thinkingConfig: thinking,
  // Identidad leída del propio JWT (sin viaje de red). La firma la valida la pasarela de Supabase y, aun así, allowed_users y el
  // límite diario se consultan con ese JWT contra la base de datos, que rechaza uno falso. Con COACH_STRICT_AUTH=1 se comprueba también en Auth.
  authenticate: async (jwt: string) => {
    const p = decodeJwt(jwt);
    if (!p || !p.sub || (p.exp && p.exp * 1000 < Date.now())) return null;
    if (strict) { const { data, error } = await as(jwt).auth.getUser(jwt); return error || !data.user ? null : { id: data.user.id }; }
    return { id: p.sub };
  },
  isAllowed: allowedCached,
  useQuota: async (jwt: string, max: number) => { const { data, error } = await as(jwt).rpc('coach_use', { max_calls: max }); if (error) throw error; return data as number; },
  fetch,
}));
