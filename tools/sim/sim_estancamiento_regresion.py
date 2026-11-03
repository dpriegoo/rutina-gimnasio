import numpy as np, sim_progresion as sp
f = lambda S: np.mean([w * r ** 0.10 for w, r in S])

def slope_pct(v):                       # cambio total estimado por regresión lineal, en % de la media
    x = np.arange(len(v)); b = np.polyfit(x, v, 1)[0]
    return b * (len(v) - 1) / np.mean(v) * 100
def mk_slope(n, th):
    return lambda v: len(v) >= n and slope_pct(v[-n:]) < th
def mk_blocks(k, th):
    def r(v):
        if len(v) < 2 * k: return False
        return np.mean(v[-k:]) / np.mean(v[-2 * k:-k]) - 1 < th
    return r
RULES = {
 "regresión últ. 8 sesiones, cambio < 1,5 %": mk_slope(8, 1.5),
 "regresión últ. 8 sesiones, cambio < 2,5 %": mk_slope(8, 2.5),
 "regresión últ. 6 sesiones, cambio < 1,5 %": mk_slope(6, 1.5),
 "4 vs 4 anteriores, mejora < 1,5 %":         mk_blocks(4, 0.015),
}
if __name__ == "__main__":
    N = 2000
    print(f"{'regla (10 sesiones simuladas)':<46}{'PLANO':>8}{'+3 %':>8}{'+6 %':>8}   (% de casos en que avisa 'estancado')")
    for name, rule in RULES.items():
        out = []
        for g in (0.0, 0.03, 0.06):
            hits = sum(bool(rule([f(S) for S in sp.simulate(g, (8, 10), n_sess=10)])) for _ in range(N))
            out.append(hits / N)
        print(f"{name:<46}" + "".join(f"{100*x:>7.0f}%" for x in out))
