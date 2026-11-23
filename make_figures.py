"""Reproduce the four Faraday-wave presentation figures.

Theory: Kumar (1996), Proc. R. Soc. Lond. A 452, 1113 - finite-depth Floquet
matrix method (eqs. 3.17, 3.22-3.26), subharmonic tongue (alpha = 1/2).
Simulation points: fitted from COMSOL Accumulated Probe Table CSV exports.

Usage:  python make_figures.py
Edit the CONFIG block if file names, fluid parameters or depth change.
Requires: numpy, pandas, scipy, matplotlib.  Runtime: ~1-2 min (theory curves).
"""
import os
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.signal import find_peaks
from scipy.optimize import brentq, minimize_scalar

# ============================== CONFIG ==============================
CSV_60HZ = "acc_probe_table.csv"           # afac sweep at 60 Hz, lambda_c
CSV_LAM = "lam_sweep_probe_table.csv"      # lambda sweep at 60 Hz
CSV_FREQ = "freq_sweep_probe_table.csv"    # frequency sweep at each lambda_c
OUT_DIR = "figures"

G = 9.81          # m/s^2 (COMSOL's g_const is 9.80665; difference ~0.03% in a_c)
NU = 1.0e-4       # m^2/s kinematic viscosity
SIGMA = 0.065     # N/m surface tension
RHO = 1220.0      # kg/m^3 density (assumed; not stated in the paper)
H = 2.9e-3        # m liquid depth
F_MAIN = 60.0     # Hz, frequency of the 60 Hz studies

T_MIN, A_MIN, A_MAX = 0.05, 1e-6, 0.2      # fit window: s, mm, mm
N_FOURIER = 12                              # Floquet truncation (converged at 8)
# ====================================================================

FLUID = (NU, SIGMA, RHO, H)
os.makedirs(OUT_DIR, exist_ok=True)
plt.style.use("seaborn-v0_8-whitegrid")
plt.rcParams.update({"font.size": 12, "axes.titlesize": 13, "axes.titleweight": "bold"})
C_TH, C_SIM = "#555555", "#d62728"


# ---------------------------- theory ----------------------------
def A_n(n, k, w, alpha, s=0.0):
    """Kumar eq. 3.17 (eq. 3.20 for the harmonic n = 0 term)."""
    nu, sig, rho, h = FLUID
    mu = s + 1j * (alpha + n) * w
    if alpha == 0 and n == 0:
        return 2 / k * (G * k + sig / rho * k**3)
    q = np.sqrt(k**2 + mu / nu)
    if q.real < 0:
        q = -q
    C = q * (q**4 + 2 * q**2 * k**2 + 5 * k**4)
    D = k * (q**4 + 6 * q**2 * k**2 + k**4)
    ch, sh, ck, sk = np.cosh(q * h), np.sinh(q * h), np.cosh(k * h), np.sinh(k * h)
    num = 4 * q * k**2 * (q**2 + k**2) - C * ch * ck + D * sh * sk
    den = q * ch * sk - k * sh * ck
    return 2 / k * (G * k + sig / rho * k**3 - nu**2 * num / den)


def a_theory(k, f, s=0.0, alpha=0.5):
    """Lowest forcing a (m/s^2) giving growth rate s at wavenumber k (1/m)."""
    w = 2 * np.pi * f
    ns = np.arange(-N_FOURIER, N_FOURIER + (0 if alpha == 0.5 else 1))
    Ad = np.array([A_n(n, k, w, alpha, s) for n in ns])
    B = np.eye(len(ns), k=1) + np.eye(len(ns), k=-1)
    ev = np.linalg.eigvals(B / Ad[:, None])          # eigenvalues of A^-1 B = 1/a
    r = [1 / e.real for e in ev if abs(e.imag) < 1e-6 * abs(e) and e.real > 0]
    return min(r) if r else np.nan


def critical(f):
    """(k_c in 1/m, a_c in m/s^2) = minimum of the first subharmonic tongue."""
    kg = np.linspace(100, 2500, 80)
    v = [a_theory(k, f) for k in kg]
    i = int(np.nanargmin(v))
    r = minimize_scalar(lambda k: a_theory(k, f),
                        bounds=(kg[max(i - 1, 0)], kg[min(i + 1, len(kg) - 1)]),
                        method="bounded")
    return r.x, r.fun


def s_theory(k, f, a):
    """Theoretical growth rate s (1/s) at forcing a: root of a_theory(k,f,s) = a."""
    ss = np.linspace(-40, 40, 81)
    v = np.array([a_theory(k, f, s) - a for s in ss])
    j = np.where(np.sign(v[:-1]) != np.sign(v[1:]))[0][0]
    return brentq(lambda s: a_theory(k, f, s) - a, ss[j], ss[j + 1])


# ---------------------------- simulation data ----------------------------
def read_table(path):
    """COMSOL Accumulated Probe Table CSV -> DataFrame with params + t, p1, p2."""
    lines = open(path, encoding="utf-8", errors="ignore").read().splitlines()
    header = [l for l in lines if l.startswith("%")][-1].lstrip("%").strip()
    params = [c.strip().strip('"').split(" (")[0]
              for c in header.split("Time")[0].split(",") if c.strip().strip('"')]
    d = pd.read_csv(path, comment="%", header=None)
    d.columns = params + ["t", "p1", "p2"]
    return d, params


def fit_run(g):
    """Growth rate s (1/s) from the peak envelope of probe 1 inside the fit window."""
    t, y = g.t.values, g.p1.values
    pk, _ = find_peaks(np.abs(y))
    tp, ap = t[pk], np.abs(y[pk])
    sel = (tp > T_MIN) & (ap > A_MIN) & (ap < A_MAX)
    s, _ = np.polyfit(tp[sel], np.log(ap[sel]), 1)
    return s, tp, ap, sel


def thresholds(d, params):
    """One simulated a_c per group of runs (grouped by every parameter except afac)."""
    keys = [p for p in params if p != "afac"]
    rows = []
    for key, gg in (d.groupby(keys) if keys else [((), d)]):
        key = key if isinstance(key, tuple) else (key,)
        fa = sorted(gg.afac.unique())
        s = np.array([fit_run(gg[gg.afac == a])[0] for a in fa])
        fa = np.array(fa)
        i, j = np.where(s < 0)[0].max(), np.where(s > 0)[0].min()
        a0 = fa[i] - s[i] * (fa[j] - fa[i]) / (s[j] - s[i])     # s = 0
        row = dict(zip(keys, key))
        row.update(afac0=a0, s=dict(zip(fa, s)))
        rows.append(row)
    return pd.DataFrame(rows)


def clean(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)


# ---------------------------- figures ----------------------------
w_main = 2 * np.pi * F_MAIN
kc, ac = critical(F_MAIN)
print(f"60 Hz theory: k_c = {kc/1e3:.4f} 1/mm, lambda_c = {2*np.pi/kc*1e3:.3f} mm, a_c = {ac:.2f} m/s^2")

# Fig 1: probe trace at the highest forcing + peak envelopes
d60, p60 = read_table(CSV_60HZ)
afacs = sorted(d60.afac.unique())
cols = plt.cm.coolwarm(np.linspace(0, 1, len(afacs)))
fig, axs = plt.subplots(1, 2, figsize=(13, 5))
gtop = d60[d60.afac == afacs[-1]]
axs[0].plot(gtop.t, gtop.p1, color="#1f77b4", lw=1, label="Probe 1 (x = 0)")
axs[0].plot(gtop.t, gtop.p2, color="#2ca02c", lw=1, label="Probe 2 (x = L)")
axs[0].set(xlabel="t (s)", ylabel="surface elevation η (mm)",
           title=f"a = {afacs[-1]} a_c, {F_MAIN:.0f} Hz: surface grows at {F_MAIN/2:.0f} Hz")
axs[0].legend(loc="upper left"); clean(axs[0])
for a, c in zip(afacs, cols):
    s, tp, ap, sel = fit_run(d60[d60.afac == a])
    st = s_theory(kc, F_MAIN, a * ac)
    axs[1].semilogy(tp, ap, "o", ms=3.5, color=c,
                    label=f"{a:.1f} a_c: fit {s:+.1f}, theory {st:+.1f} 1/s")
    tt = np.linspace(T_MIN, tp[sel].max(), 50)
    c0 = np.polyfit(tp[sel], np.log(ap[sel]), 1)
    axs[1].semilogy(tt, np.exp(np.polyval(c0, tt)), "-", color=c, lw=1)
axs[1].axvline(T_MIN, color="k", ls=":", lw=1)
axs[1].text(T_MIN + 0.005, 0.35, f"fit starts (t > {T_MIN} s)", fontsize=10)
axs[1].set(xlabel="t (s)", ylabel="peak |η| (mm, log scale)",
           title="Peak envelopes are straight lines → exponential")
axs[1].legend(fontsize=9, loc="lower left"); clean(axs[1])
plt.tight_layout(); plt.savefig(f"{OUT_DIR}/fig1_probe_envelopes_60Hz.png", dpi=150); plt.close()

# Fig 2: growth rate vs forcing at 60 Hz
th60 = thresholds(d60, p60).iloc[0]
ss = np.linspace(-22, 20, 43)
fig, ax = plt.subplots(figsize=(8, 5.5))
ax.plot([a_theory(kc, F_MAIN, s) / ac for s in ss], ss, color=C_TH, lw=2,
        label="Kumar theory (Floquet, s ≠ 0)")
ax.plot(list(th60.s.keys()), list(th60.s.values()), "o", color=C_SIM, ms=9, label="COMSOL fits")
ax.axhline(0, color="k", lw=0.8)
ax.plot([th60.afac0], [0], "*", color=C_SIM, ms=16,
        label=f"COMSOL threshold: {th60.afac0*ac:.1f} m/s² (theory {ac:.1f})")
ax.set(xlabel="forcing a / a_c,theory", ylabel="growth rate s (1/s)",
       title=f"{F_MAIN:.0f} Hz: simulated growth rates follow theory; s = 0 gives a_c")
ax.legend(loc="upper left"); clean(ax)
plt.tight_layout(); plt.savefig(f"{OUT_DIR}/fig2_growth_rate_vs_forcing_60Hz.png", dpi=150); plt.close()

# Fig 3: tongue a(k) at 60 Hz
dl, pl = read_table(CSV_LAM)
thl = thresholds(dl, pl)                       # columns: lam (mm), aref, afac0
ks = np.linspace(0.50, 1.10, 61)               # 1/mm
at = [a_theory(k * 1e3, F_MAIN) for k in ks]
fig, ax = plt.subplots(figsize=(8, 5.5))
ax.fill_between(ks, at, 400, color="#fde0dd", label="unstable (waves grow)")
ax.plot(ks, at, color=C_TH, lw=2, label="Kumar theory: marginal curve a(k)")
ax.plot(2 * np.pi / thl.lam, thl.afac0 * thl.aref, "o", color=C_SIM, ms=9,
        label=f"COMSOL (s = 0), λ = {thl.lam.min():g}–{thl.lam.max():g} mm")
ax.set_ylim(80, 160)
ax.set(xlabel="wavenumber k = 2π/λ (1/mm)", ylabel="forcing amplitude a (m/s²)",
       title=f"{F_MAIN:.0f} Hz: lower edge of the first subharmonic tongue")
ax.annotate(f"minimum: k_c = {kc/1e3:.3f} /mm\n(λ_c = {2*np.pi/kc*1e3:.2f} mm), a_c = {ac:.1f}",
            xy=(kc / 1e3, ac), xytext=(kc / 1e3 + 0.06, ac - 7), fontsize=10,
            arrowprops=dict(arrowstyle="->"))
ax.legend(loc="upper center"); clean(ax)
plt.tight_layout(); plt.savefig(f"{OUT_DIR}/fig3_tongue_60Hz.png", dpi=150); plt.close()

# Fig 4: threshold and critical wavelength vs frequency
df, pf = read_table(CSV_FREQ)
thf = thresholds(df, pf)                       # columns: lam, aref, f0, tend, afac0
thf = pd.concat([thf, pd.DataFrame([{"f0": F_MAIN, "lam": 2 * np.pi / kc * 1e3,
                                     "aref": ac, "afac0": th60.afac0}])]).sort_values("f0")
fs = np.arange(15, 111, 5)
crit = [critical(f) for f in fs]
fig, axs = plt.subplots(1, 2, figsize=(13, 5))
axs[0].plot(fs, [c[1] for c in crit], color=C_TH, lw=2, label="Kumar theory")
axs[0].plot(thf.f0, thf.afac0 * thf.aref, "o", color=C_SIM, ms=9, label="COMSOL (s = 0)")
axs[0].set(xlabel="drive frequency f (Hz)", ylabel="onset threshold a_c (m/s²)",
           title="Threshold vs frequency (Fig. 2 inset)")
axs[0].legend(); clean(axs[0])
axs[1].plot(fs, [2 * np.pi / c[0] * 1e3 for c in crit], color=C_TH, lw=2,
            label="Kumar theory (input to COMSOL runs)")
axs[1].plot(thf.f0, thf.lam, "s", mfc="none", color=C_TH, ms=8, label="λ_c used in each run")
axs[1].plot([F_MAIN], [2 * np.pi / kc * 1e3], "o", color=C_SIM, ms=9,
            label=f"{F_MAIN:.0f} Hz: minimum confirmed by λ sweep")
axs[1].set(xlabel="drive frequency f (Hz)", ylabel="critical wavelength λ_c (mm)",
           title="Critical wavelength vs frequency (Fig. 2 main)")
axs[1].legend(); clean(axs[1])
plt.tight_layout(); plt.savefig(f"{OUT_DIR}/fig4_threshold_and_wavelength_vs_frequency.png", dpi=150); plt.close()

# Summary table printed to the terminal
print("\nSimulated thresholds:")
print(f"  60 Hz afac sweep: a_c = {th60.afac0*ac:.2f} m/s^2")
for _, r in thl.iterrows():
    print(f"  lam = {r.lam:g} mm: a_c = {r.afac0*r.aref:.2f} m/s^2 (aref {r.aref})")
for _, r in thf.iterrows():
    print(f"  f = {r.f0:g} Hz: a_c = {r.afac0*r.aref:.2f} m/s^2 (aref {r.aref:.2f})")
print(f"\nFigures saved to ./{OUT_DIR}/")
