"""¿Qué regla de 'estancado' separa mejor un ejercicio realmente plano de uno que sube?
Métrica por sesión: media de carga*reps^0,10 de las series (la propuesta). 10 sesiones, doble progresión."""
import numpy as np, sim_progresion as sp
f = lambda S: np.mean([w * r ** 0.10 for w, r in S])

def r_actual(v):  l = v[-3:];  return (max(l) - min(l)) / max(l) < 0.015
def mk(th):
    def r(v):
        if len(v) < 6: return False
        a, b = np.mean(v[-3:]), np.mean(v[-6:-3]);  return abs(a / b - 1) < th
    return r
RULES = {"actual: últ. 3 sesiones, rango < 1,5 %": r_actual,
         "3 vs 3 anteriores, cambio < 1 %": mk(0.01),
         "3 vs 3 anteriores, cambio < 1,5 %": mk(0.015),
         "3 vs 3 anteriores, cambio < 2 %": mk(0.02)}
if __name__ == "__main__":
    N = 2000
    print(f"{'regla':<42}{'avisa si PLANO':>16}{'avisa si +3 %':>15}{'avisa si +6 %':>15}")
    for name, rule in RULES.items():
        out = []
        for g in (0.0, 0.03, 0.06):
            hits = 0
            for _ in range(N):
                v = [f(S) for S in sp.simulate(g, (8, 10), n_sess=10)]
                hits += bool(rule(v))
            out.append(hits / N)
        print(f"{name:<42}" + "".join(f"{100*x:>15.0f}%" for x in out))
