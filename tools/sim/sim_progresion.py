"""
Qué métrica refleja mejor que HAY (o no hay) progresión real en un ejercicio.

Idea: se simulan entrenamientos donde la fuerza verdadera (1RM latente) es conocida:
  - escenario "sube": la fuerza crece un G % a lo largo de 10 sesiones
  - escenario "plano": la fuerza no cambia (solo hay ruido del día)
y se mide, para cada métrica, cuánto separa un caso del otro (AUC: 0,5 = azar, 1 = perfecta).

El atleta entrena como lo hace IronLog: 3 series en un rango de reps, doble progresión
(cuando clava el tope de reps en todas las series, sube carga 2,5 kg).

Para no favorecer a ninguna fórmula, la "verdad" (cuántas reps da una carga) se genera con un
modelo elegido al azar por atleta: Lombardi (exponente 0,08-0,12), Epley o Brzycki. Ninguna métrica
conoce el modelo verdadero.
"""
import numpy as np
from scipy.stats import rankdata

rng = np.random.default_rng(42)

# ---------------- modelo del atleta ----------------
def reps_to_failure(T, L, model):
    kind, k = model
    x = T / L
    if kind == "lombardi":             # T = L * r^k
        return x ** (1.0 / k)
    if kind == "epley":                # T = L * (1 + r/30)
        return 30.0 * (x - 1.0)
    return 37.0 - 36.0 / x             # Brzycki: T = L * 36 / (37 - r)

def simulate(growth_total, rep_range, n_sess=10, set_var=False, load_step=2.5,
             day_noise=0.02, rep_noise=0.8, bias_extra_set=False, up_rule='hi'):
    lo, hi = rep_range
    kind = rng.choice(["lombardi", "epley", "brzycki"])
    model = (kind, rng.uniform(0.08, 0.12))
    T0 = rng.uniform(40, 140)
    # carga inicial: la que deja ~lo+1 reps con 2 en reserva (se busca por tanteo con el modelo real)
    L = load_step
    while reps_to_failure(T0, L + load_step, model) - 2 >= lo + 1:
        L += load_step
    sessions = []
    for s in range(n_sess):
        T = T0 * (1 + growth_total * s / (n_sess - 1))
        Tday = T * (1 + rng.normal(0, day_noise))             # forma del día
        n_sets = 3
        if set_var:                                             # a veces 2 o 4 series
            n_sets = rng.choice([2, 3, 3, 3, 4])
        elif bias_extra_set and s >= n_sess // 2:
            n_sets = 4                                          # confusor: misma fuerza, 1 serie extra
        sets = []
        for j in range(n_sets):
            rtf = reps_to_failure(Tday, L, model)
            r = rtf - 2 - 1.2 * j + rng.normal(0, rep_noise)    # 2 RIR y fatiga entre series
            sets.append((L, int(max(1, round(r)))))
        sessions.append(sets)
        # doble progresión
        thr = {'hi': hi, 'lo': lo, 'hi+3': hi + 3}[up_rule]   # cuándo sube la carga
        if all(r >= thr for _, r in sets):
            L += load_step
    return sessions

# ---------------- métricas candidatas ----------------
epley = lambda w, r: w * (1 + r / 30.0)
lomb = lambda w, r: w * r ** 0.10
brz = lambda w, r: w * 36.0 / (37.0 - min(r, 20))
cons = lambda w, r: (epley(w, r) + lomb(w, r) + brz(w, r)) / 3.0

METRICS = {
    "A. 1RM de la MEJOR serie (actual)":        lambda S: max(epley(w, r) for w, r in S),
    "B. 1RM MEDIO de las series (Epley)":       lambda S: np.mean([epley(w, r) for w, r in S]),
    "C. 1RM MEDIANO de las series":             lambda S: np.median([epley(w, r) for w, r in S]),
    "D. 1RM medio con reps topadas a 12":       lambda S: np.mean([epley(w, min(r, 12)) for w, r in S]),
    "E. 1RM medio (fórmula Lombardi)":          lambda S: np.mean([lomb(w, r) for w, r in S]),
    "J. 1RM medio, promedio de 3 fórmulas":     lambda S: np.mean([cons(w, r) for w, r in S]),
    "F. Volumen total (peso x reps x series)":  lambda S: sum(w * r for w, r in S),
    "G. Volumen medio por serie":               lambda S: np.mean([w * r for w, r in S]),
    "H. Peso máximo usado":                     lambda S: max(w for w, r in S),
    "I. Peso x reps de la serie más pesada":    lambda S: max(S, key=lambda x: (x[0], x[1]))[0] * max(S, key=lambda x: (x[0], x[1]))[1],
}

def stat(series):                       # cambio relativo: últimas 3 sesiones vs primeras 3
    a, b = np.mean(series[:3]), np.mean(series[-3:])
    return b / a - 1

def auc(pos, neg):                      # P(estadístico en "sube" > en "plano")
    allv = np.concatenate([pos, neg]); rk = rankdata(allv)
    n1, n0 = len(pos), len(neg)
    return (rk[:n1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)

def run(label, growth, rep_range, N=1500, **kw):
    res = {}
    for name, f in METRICS.items():
        res[name] = ([], [])
    for _ in range(N):
        up = simulate(growth, rep_range, **kw)
        flat = simulate(0.0, rep_range, **kw)
        for name, f in METRICS.items():
            res[name][0].append(stat([f(S) for S in up]))
            res[name][1].append(stat([f(S) for S in flat]))
    out = {n: auc(np.array(p), np.array(q)) for n, (p, q) in res.items()}
    # tasa de "falsa progresión": % de casos planos donde el estadístico supera la mitad del crecimiento real
    fp = {n: float(np.mean(np.array(q) > growth / 2)) for n, (p, q) in res.items()}
    return out, fp

SCENARIOS = [
    ("1. Estándar: 3 series, 8-10 reps, +6 %",              dict(growth=0.06, rep_range=(8, 10))),
    ("2. Fuerza (6-8 reps), +6 %",                           dict(growth=0.06, rep_range=(6, 8))),
    ("3. Reps altas (14-16), +6 %",                          dict(growth=0.06, rep_range=(14, 16))),
    ("4. Mejora pequeña (+3 %), 8-10 reps",                  dict(growth=0.03, rep_range=(8, 10))),
    ("5. Nº de series variable (2 a 4 por sesión)",          dict(growth=0.06, rep_range=(8, 10), set_var=True)),
    ("6. Confusor: sin mejora pero añade una 4ª serie",      dict(growth=0.06, rep_range=(8, 10), bias_extra_set=True)),
    ("7. Prioriza PESO: sube carga al clavar el mínimo",     dict(growth=0.06, rep_range=(8, 10), up_rule='lo')),
    ("8. Prioriza REPS: sube carga solo con tope+3 reps",    dict(growth=0.06, rep_range=(8, 10), up_rule='hi+3')),
    ("9. Mucho ruido de forma diaria (4 %)",                 dict(growth=0.06, rep_range=(8, 10), day_noise=0.04)),
]

if __name__ == "__main__":
    names = list(METRICS)
    table, fps = {}, {}
    for label, kw in SCENARIOS:
        a, f = run(label, **kw)
        table[label] = a; fps[label] = f
    w = max(len(n) for n in names)
    print("AUC = capacidad de distinguir 'hay progreso' de 'no hay' (0,50 azar · 1,00 perfecta)\n")
    print(" " * 4 + "".ljust(w) + "".join(f" {i+1:>5}" for i in range(len(SCENARIOS))) + "   MEDIA")
    ranking = []
    for n in names:
        vals = [table[l][n] for l, _ in SCENARIOS]
        ranking.append((np.mean(vals), n, vals))
    for m, n, vals in sorted(ranking, reverse=True):
        print("    " + n.ljust(w) + "".join(f" {v:5.2f}" for v in vals) + f"   {m:5.3f}")
    print("\nEscenarios:")
    for i, (l, _) in enumerate(SCENARIOS):
        print(f"  {l}")
    print("\n% de 'falsa progresión' (caso SIN mejora real que la métrica marca como mejora)")
    fr = []
    for n in names:
        vals = [fps[l][n] for l, _ in SCENARIOS]
        fr.append((np.mean(vals), n, vals))
    for m, n, vals in sorted(fr):
        print("    " + n.ljust(w) + "".join(f" {100*v:4.0f}%" for v in vals) + f"  {100*m:4.0f}%")


def window_analysis(N=1500):
    """¿Cuántas sesiones conviene promediar para decidir si hay progreso? (métrica J, escenario estándar)"""
    f = METRICS["J. 1RM medio, promedio de 3 fórmulas"]
    res = {w: ([], []) for w in (1, 2, 3, 4)}
    for _ in range(N):
        up = [f(S) for S in simulate(0.06, (8, 10))]
        flat = [f(S) for S in simulate(0.0, (8, 10))]
        for w in res:
            res[w][0].append(np.mean(up[-w:]) / np.mean(up[:w]) - 1)
            res[w][1].append(np.mean(flat[-w:]) / np.mean(flat[:w]) - 1)
    print("\nVentana de suavizado (sesiones promediadas al inicio y al final) -> AUC, escenario estándar")
    for w, (p, q) in res.items():
        print(f"    {w} sesión(es): {auc(np.array(p), np.array(q)):.2f}")


if __name__ == "__main__":
    window_analysis()
