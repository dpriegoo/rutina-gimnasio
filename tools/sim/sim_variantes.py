"""¿Cómo tratar las sesiones hechas en una máquina secundaria (variante) que mueve más (o menos) peso que la principal?

Se simula como antes (3 series, doble progresión, fuerza verdadera conocida) pero algunas sesiones se hacen en la
máquina secundaria: ahí el peso que se mueve es k veces el de la principal (k = 1,25 más pesada; 0,8 más ligera).
Estrategias para construir la serie que se muestra y se usa para decidir "hay progreso":
  mezclar    : todo junto (lo que hace la app ahora)
  excluir    : solo la máquina principal
  calib_glob : se reescalan las secundarias con el cociente de medias principal/secundaria
  calib_par  : se reescalan con la mediana de cocientes frente a la interpolación de las sesiones principales vecinas
  hibrida    : como calib_par, pero solo si hay >= 2 sesiones secundarias entre principales (si no, se excluyen)
  separar    : el cambio se mide DENTRO de cada máquina (primeras 3 vs últimas 3 de cada una) y se promedia por nº de sesiones
Medida: AUC entre 'sube' (+6 %) y 'plano' (0,5 = azar, 1 = perfecto)."""
import numpy as np
import sim_progresion as sp

def sessions(growth, rep_range, share, k, mode, n_sess=10):
    S = sp.simulate(growth, rep_range, n_sess=n_sess)
    if mode == 'fin':                      # peor caso: las últimas 3 sesiones son en la secundaria (la principal estaba ocupada)
        isvar = [i >= n_sess - 3 for i in range(n_sess)]
    else:                                  # al azar, sin tocar las 2 primeras
        isvar = [(i >= 2 and sp.rng.random() < share) for i in range(n_sess)]
    out = []
    for i, sets in enumerate(S):
        f = k if isvar[i] else 1.0
        val = float(np.mean([w * f * r ** 0.10 for w, r in sets]))
        out.append((val, isvar[i]))
    return out

def change(v):
    n = len(v)
    if n < 2: return 0.0
    w = min(3, n // 2)
    return np.mean(v[-w:]) / np.mean(v[:w]) - 1

def strat(sess, name):
    vals = [v for v, _ in sess]; isv = [x for _, x in sess]
    prim = [v for v, x in sess if not x]; var = [v for v, x in sess if x]
    if name == 'mezclar': return change(vals)
    if name == 'excluir': return change(prim)
    if name in ('calib_glob', 'calib_par'):
        if not var or not prim: return change(vals)
        if name == 'calib_glob':
            f = np.mean(prim) / np.mean(var)
        else:
            ratios = []
            for i, (v, x) in enumerate(sess):
                if not x: continue
                b = [sess[j][0] for j in range(i - 1, -1, -1) if not sess[j][1]][:1]
                a = [sess[j][0] for j in range(i + 1, len(sess)) if not sess[j][1]][:1]
                if b and a: ratios.append(np.mean([b[0], a[0]]) / v)
            f = np.median(ratios) if ratios else np.mean(prim) / np.mean(var)
        return change([v * f if x else v for v, x in sess])
    if name == 'hibrida':
        ratios = []
        for i, (v, x) in enumerate(sess):
            if not x: continue
            b = [sess[j][0] for j in range(i - 1, -1, -1) if not sess[j][1]][:1]
            a = [sess[j][0] for j in range(i + 1, len(sess)) if not sess[j][1]][:1]
            if b and a: ratios.append(np.mean([b[0], a[0]]) / v)
        if len(ratios) < 2: return change(prim)            # sin base para ajustar: solo la principal
        f = np.median(ratios)
        return change([v * f if x else v for v, x in sess])
    if name == 'separar':
        ch, wt = [], []
        for grp in (prim, var):
            if len(grp) >= 2: ch.append(change(grp)); wt.append(len(grp))
        return float(np.average(ch, weights=wt)) if ch else 0.0

NAMES = ['mezclar', 'excluir', 'calib_par', 'hibrida', 'separar']
SCEN = [
    ("sin variantes (referencia)",              dict(share=0.0, k=1.25, mode='azar')),
    ("25 % de sesiones en la secundaria, +25 % peso", dict(share=0.25, k=1.25, mode='azar')),
    ("25 % en la secundaria, -20 % peso",       dict(share=0.25, k=0.80, mode='azar')),
    ("40 % en la secundaria, +25 % peso",       dict(share=0.40, k=1.25, mode='azar')),
    ("40 % en la secundaria, -20 % peso",       dict(share=0.40, k=0.80, mode='azar')),
    ("últimas 3 sesiones en la secundaria, +25 %", dict(share=0, k=1.25, mode='fin')),
    ("últimas 3 sesiones en la secundaria, -20 %", dict(share=0, k=0.80, mode='fin')),
]

if __name__ == "__main__":
    N = 1500
    print("AUC (0,5 azar · 1 perfecto)\n")
    print(f"{'escenario':<48}" + "".join(f"{n:>12}" for n in NAMES))
    tot = {n: [] for n in NAMES}
    falsa = {}   # % de casos SIN mejora real en que se anuncia un cambio de más de +-3 %
    pot = {}     # % de casos CON mejora real (+6 %) en que se detecta (> +3 %)
    for label, kw in SCEN:
        res = {n: ([], []) for n in NAMES}
        for _ in range(N):
            up = sessions(0.06, (8, 10), **kw); fl = sessions(0.0, (8, 10), **kw)
            for n in NAMES:
                res[n][0].append(strat(up, n)); res[n][1].append(strat(fl, n))
        falsa[label] = {n: float(np.mean(np.abs(np.array(res[n][1])) > 0.03)) for n in NAMES}
        pot[label] = {n: float(np.mean(np.array(res[n][0]) > 0.03)) for n in NAMES}
        row = {n: sp.auc(np.array(res[n][0]), np.array(res[n][1])) for n in NAMES}
        for n in NAMES: tot[n].append(row[n])
        print(f"{label:<48}" + "".join(f"{row[n]:>12.2f}" for n in NAMES))
    print(f"{'MEDIA':<48}" + "".join(f"{np.mean(tot[n]):>12.3f}" for n in NAMES))

    for titulo, d in (("% de falsas alarmas (caso plano en que se anuncia un cambio > 3 %, sea subida o bajada)", falsa),
                      ("% de detección (caso con +6 % real en que se anuncia una mejora > 3 %)", pot)):
        print("\n" + titulo + "\n")
        print(f"{'escenario':<48}" + "".join(f"{n:>12}" for n in NAMES))
        for label, _ in SCEN:
            print(f"{label:<48}" + "".join(f"{100*d[label][n]:>11.0f}%" for n in NAMES))
        print(f"{'MEDIA':<48}" + "".join(f"{100*np.mean([d[l][n] for l,_ in SCEN]):>11.0f}%" for n in NAMES))
