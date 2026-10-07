// =====================================================================
// Adaptador de datos: Supabase  (api-supabase.js)
// Traduce las acciones de la app (list, saveWeight, getRoutine…) a consultas de Supabase
// y devuelve el mismo formato que devolvía Apps Script. Incluye el login con Google ->
// Supabase.
// Depende de: config, auth (getProfile).
// =====================================================================

let _sb = null;

function sbClient(){
  if (!_sb) {
    if (!window.supabase) throw new Error('No se pudo cargar Supabase');
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ironlog-auth' }
    });
  }
  return _sb;
}

async function sbLogin(credential){
  window._loginDetail = '';
  const sb = sbClient();
  const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: credential });
  if (error) { window._loginDetail = error.message; return null; }
  const r = await sb.from('allowed_users').select('profile').maybeSingle();
  if (r.error) { window._loginDetail = r.error.message; return null; }
  if (!r.data) {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    window._loginDetail = 'cuenta sin acceso';
    return null;
  }
  return { sessionToken: 'sb', profile: r.data.profile };
}

function sbEpley(peso, reps){
  const p = Number(peso), r = Number(reps);
  if (!p || !r) return null;
  return Math.round(p * (1 + r / 30) * 10) / 10;
}

function sbUnwrap(res){
  if (res.error) {
    const e = res.error;
    const msg = String(e.message || '');
    if (res.status === 401 || /JWT|PGRST30/i.test(String(e.code || '') + ' ' + msg)) {
      const u = new Error('unauthorized'); u.sbUnauthorized = true; throw u;
    }
    throw e;
  }
  return res.data;
}

function sbToSheetRow(r){
  return {
    'Fecha': r.fecha, 'Perfil': r.profile, 'Día': r.dia, 'Grupo': r.grupo, 'Ejercicio': r.ejercicio,
    'Peso (kg)': r.peso, 'Reps': r.reps, 'Series': r.series, 'Nota': r.nota || '', 'ID': r.id,
    '1RM (kg)': r.rm == null ? '' : r.rm, 'Variante': r.variante || '', 'Calentamiento': !!r.calentamiento
  };
}

// Traduce las acciones de la app a consultas de Supabase y devuelve el mismo formato que Apps Script
async function sbRequest(p){
  const sb = sbClient();
  if (p.action === 'logout') { await sb.auth.signOut({ scope: 'local' }).catch(() => {}); return { ok: true }; }
  const t0 = Date.now();
  const { data: sd, error: sErr } = await sb.auth.getSession();
  const session = sd && sd.session;
  const tSess = Date.now() - t0;
  if (!session) {
    // Sin red no es lo mismo que sesión rechazada: se lanza error para que se reintente más tarde
    if (sErr && /fetch|network|retry/i.test(String(sErr.name) + ' ' + String(sErr.message))) throw sErr;
    return { error: 'unauthorized' };
  }
  const profile = getProfile();
  if (!profile) return { error: 'unauthorized' };
  try {
    switch (p.action) {
      case 'list': {
        let all = [], from = 0;
        const step = 1000;
        for (;;) {
          const rows = sbUnwrap(await sb.from('sets').select('*').order('fecha').order('id').range(from, from + step - 1));
          all = all.concat(rows);
          if (rows.length < step) break;
          from += step;
        }
        // Volumen de la semana del compañero (un único número; sus series no se descargan)
        try {
          const wk = localDateStr(getWeekStart());
          const pv = await sb.rpc('partner_week_volume', { week_start: wk });
          window._partnerVol = (!pv.error && pv.data != null) ? { week: wk, vol: Number(pv.data) } : null;
        } catch (e) { window._partnerVol = null; }
        return all.map(sbToSheetRow);
      }
      case 'saveWeight':
        sbUnwrap(await sb.from('weights').upsert({ profile: profile, fecha: p.fecha, peso: Number(p.peso) }, { onConflict: 'profile,fecha' }));
        return { ok: true };
      case 'listWeights': {
        const rows = sbUnwrap(await sb.from('weights').select('fecha,peso').eq('profile', profile).order('fecha'));
        return rows.map(r => ({ fecha: r.fecha, peso: r.peso }));
      }
      case 'saveHeight':
        sbUnwrap(await sb.from('allowed_users').update({ altura: Number(p.altura) }).eq('profile', profile));
        return { ok: true };
      case 'getHeight': {
        const [u, rt] = await Promise.all([
          sb.from('allowed_users').select('altura').eq('profile', profile).maybeSingle(),
          sb.from('routines').select('version').eq('profile', profile).maybeSingle()
        ]);
        const ud = sbUnwrap(u), rd = sbUnwrap(rt);
        return { altura: ud ? ud.altura : null, v: 3, rv: rd ? rd.version : 0 };
      }
      case 'getRoutine': {
        const d = sbUnwrap(await sb.from('routines').select('version,data').eq('profile', profile).maybeSingle());
        return { ok: true, version: d ? d.version : 0, routine: d ? d.data : null };
      }
      case 'saveRoutine': {
        const v = sbUnwrap(await sb.rpc('save_routine', { base_version: Number(p.baseVersion) || 0, new_data: p.routine }));
        if (v === -1) {
          const d = sbUnwrap(await sb.from('routines').select('version').eq('profile', profile).maybeSingle());
          return { ok: false, error: 'conflict', version: d ? d.version : 0 };
        }
        return { ok: true, version: v };
      }
      case 'update': {
        sbUnwrap(await sb.from('sets').update({
          peso: Number(p.peso), reps: Number(p.reps), series: Number(p.series), rm: sbEpley(p.peso, p.reps)
        }).eq('id', String(p.id)));
        return { ok: true };
      }
      case 'delete':
        sbUnwrap(await sb.from('sets').delete().eq('id', String(p.id)));
        return { ok: true };
      case 'advice': {
        const r = await sb.functions.invoke('hyper-handler', { body: { stats: p.stats || {} } });
        if (r.error) {
          const st = r.error.context && r.error.context.status;
          if (st === 401) return { error: 'unauthorized' };
          return { error: 'advice_unavailable' };
        }
        return { advice: r.data && r.data.advice };
      }
      default: {
        if (p.action) return { error: 'unknown_action' };
        const entries = Array.isArray(p) ? p : (p.entries || [p]);
        const rows = entries.map(e => ({
          id: String(e.id), profile: profile, fecha: e.fecha, dia: e.dia || null, grupo: e.grupo || null,
          ejercicio: e.ejercicio, peso: Number(e.peso), reps: Number(e.reps), series: Number(e.series),
          nota: e.nota || null, rm: sbEpley(e.peso, e.reps), variante: e.variante || null,
          calentamiento: !!e.calentamiento
        }));
        const tDb0 = Date.now();
        if (rows.length) sbUnwrap(await sb.from('sets').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
        window._sbLast = { sess: tSess, db: Date.now() - tDb0 };
        return { ok: true, count: rows.length, skipped: 0, ms: Date.now() - t0 };
      }
    }
  } catch (e) {
    if (e && e.sbUnauthorized) return { error: 'unauthorized' };
    throw e;
  }
}

async function sbRespond(payload){
  const out = await sbRequest(payload);
  return { ok: true, json: async () => out };
}
