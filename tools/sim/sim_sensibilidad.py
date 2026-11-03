"""Sensibilidad: ¿cuánto peso conviene dar a las repeticiones frente al peso en la métrica de 1RM medio?
Métrica familia:  carga * reps^p   (p = 0 -> solo peso; p grande -> las reps pesan mucho)
Peso efectivo de las reps: Lombardi p = 0,10 (fijo); Epley p = (r/30)/(1+r/30) ~ 0,21 a 8 reps, 0,29 a 12, 0,33 a 15."""
import numpy as np, sim_progresion as sp

PS = [0.0, 0.05, 0.10, 0.15, 0.20, 0.30]
def fam(p):  return lambda S: np.mean([w * r ** p for w, r in S])

def auc_for(p, N, **kw):
    up, fl = [], []
    for _ in range(N):
        up.append(sp.stat([fam(p)(S) for S in sp.simulate(0.06, **kw)]))
        fl.append(sp.stat([fam(p)(S) for S in sp.simulate(0.0, **kw)]))
    return sp.auc(np.array(up), np.array(fl))

if __name__ == "__main__":
    N = 700
    cases = [
        ("reps 8-10, ruido de reps 0,4",   dict(rep_range=(8, 10),  rep_noise=0.4)),
        ("reps 8-10, ruido de reps 0,8",   dict(rep_range=(8, 10),  rep_noise=0.8)),
        ("reps 8-10, ruido de reps 1,5",   dict(rep_range=(8, 10),  rep_noise=1.5)),
        ("reps 14-16, ruido de reps 0,8",  dict(rep_range=(14, 16), rep_noise=0.8)),
        ("prioriza reps (tope+3), ruido 0,8", dict(rep_range=(8, 10), rep_noise=0.8, up_rule='hi+3')),
        ("prioriza peso (mínimo), ruido 0,8", dict(rep_range=(8, 10), rep_noise=0.8, up_rule='lo')),
    ]
    print("AUC según cuánto pesan las reps (p).  p=0: solo peso · p=0,10: tipo Lombardi · Epley: p~0,2-0,3\n")
    print(" " * 38 + "".join(f"  p={p:<5}" for p in PS))
    for label, kw in cases:
        row = [auc_for(p, N, **kw) for p in PS]
        best = int(np.argmax(row))
        print(f"{label:<38}" + "".join(f"  {v:5.2f}{'*' if i == best else ' '} " for i, v in enumerate(row)))
