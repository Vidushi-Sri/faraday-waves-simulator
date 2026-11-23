"""Fit Faraday-wave growth rates from a COMSOL Accumulated Probe Table CSV.

Usage:  python fit_faraday.py table.csv [ac_ref]
  ac_ref: reference threshold in m/s^2, used only if the table has no 'aref'
          column (default 91.19, Kumar Fig. 2 case at 60 Hz).

Table layout: swept-parameter columns (e.g. lam, aref, afac), then time (s),
probe 1 (mm), probe 2 (mm). Runs are grouped by every parameter except afac;
within each group s is fitted per afac and s = 0 is interpolated -> a_c.
Fit window: t > T_MIN and A_MIN < peak |eta| < A_MAX (linear regime).
Frequency: median interval between interpolated zero crossings, fit window only.
Requires: numpy, pandas, scipy
"""
import sys
import numpy as np
import pandas as pd
from scipy.signal import find_peaks

T_MIN, A_MIN, A_MAX = 0.05, 1e-6, 0.2      # s, mm, mm

path = sys.argv[1]
ac_ref = float(sys.argv[2]) if len(sys.argv) > 2 else 91.19

lines = open(path, encoding="utf-8", errors="ignore").read().splitlines()
header = [l for l in lines if l.startswith("%")][-1].lstrip("%").strip()
params = [c.strip().strip('"').split(" (")[0]
          for c in header.split("Time")[0].split(",") if c.strip().strip('"')]
d = pd.read_csv(path, comment="%", header=None)
d.columns = params + ["t", "p1", "p2"]
if "afac" not in params:
    sys.exit(f"No 'afac' column found; parameter columns: {params}")
keys = [p for p in params if p != "afac"]


def fit(g):
    t, y = g.t.values, g.p1.values
    pk, _ = find_peaks(np.abs(y))
    tp, ap = t[pk], np.abs(y[pk])
    sel = (tp > T_MIN) & (ap > A_MIN) & (ap < A_MAX)
    if sel.sum() < 3:
        return np.nan, np.nan, np.nan
    s, _ = np.polyfit(tp[sel], np.log(ap[sel]), 1)
    r = np.corrcoef(tp[sel], np.log(ap[sel]))[0, 1]
    m = (t > T_MIN) & (t <= tp[sel].max())
    tt, yy = t[m], y[m]
    i = np.where(np.sign(yy[:-1]) != np.sign(yy[1:]))[0]
    tz = tt[i] - yy[i] * (tt[i + 1] - tt[i]) / (yy[i + 1] - yy[i])
    freq = 1 / (2 * np.median(np.diff(tz))) if len(tz) > 2 else np.nan
    return s, r, freq


for key, gg in (d.groupby(keys) if keys else [((), d)]):
    key = key if isinstance(key, tuple) else (key,)
    label = ", ".join(f"{k}={v}" for k, v in zip(keys, key))
    print(f"\n== {label or 'all runs'} ==")
    print(f"{'afac':>6} {'freq (Hz)':>10} {'s (1/s)':>9} {'R':>8}")
    afacs, rates = [], []
    for a, g in gg.groupby("afac"):
        s, r, fr = fit(g)
        print(f"{a:>6} {fr:>10.2f} {s:>9.2f} {r:>8.4f}")
        if np.isfinite(s):
            afacs.append(a)
            rates.append(s)
    afacs, rates = np.array(afacs), np.array(rates)
    aref = gg["aref"].iloc[0] if "aref" in gg else ac_ref
    if (rates < 0).any() and (rates > 0).any():
        i = np.where(rates < 0)[0].max()
        j = np.where(rates > 0)[0].min()
        a0 = afacs[i] - rates[i] * (afacs[j] - afacs[i]) / (rates[j] - rates[i])
        print(f"a_c = {a0:.4f} x aref = {a0 * aref:.2f} m/s^2  (aref {aref:.2f}, diff {100 * (a0 - 1):+.2f}%)")
    else:
        print("threshold not bracketed (no sign change in s)")
