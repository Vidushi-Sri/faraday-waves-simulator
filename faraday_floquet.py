"""faraday_floquet.py - Linear Faraday instability for flat-bottom containers.

Theory: K. Kumar (1996), Proc. R. Soc. Lond. A 452, 1113-1126 ("Kumar").
Exact linear viscous Floquet theory for a liquid layer of depth h on a vertically
vibrated rigid plate, G(t) = g - a cos(wt). Each horizontal mode with wavenumber k
is solved separately; a container only changes WHICH k are allowed:

  infinite layer        any k                     pattern cos(k x)
  channel (2D, width L) k = m*pi/L, m = 1,2,...   cos(m pi x / L)
  rectangular box       k = pi*sqrt((m/Lx)^2 + (n/Ly)^2)
                                                  cos(m pi x/Lx) cos(n pi y/Ly)
  upright cylinder      k = j'_{m,s}/R            J_m(k r) cos(m theta)

ASSUMPTION: side walls are ideal (free-slip, 90 deg contact angle, no meniscus).
The bottom no-slip boundary layer, bulk viscosity, surface tension and finite depth
are treated exactly. Side-wall boundary-layer and contact-line damping are NOT
included, so thresholds in small containers are lower bounds.

Linear theory predicts onset: threshold, unstable mode (= pattern at onset),
response type (subharmonic f/2 or harmonic f), growth rate and velocity field.
It does not predict saturated amplitudes or selection between degenerate patterns.

Command-line example (Kumar Fig. 2 fluid, 60 Hz, 4.01 mm channel = COMSOL model):
  python faraday_floquet.py --f 60 --accel 100 --nu 1e-4 --rho 1220 --sigma 0.065 \
      --h 2.9e-3 --shape channel --L 4.01e-3 --plots
Requires: numpy, scipy, matplotlib
"""
from dataclasses import dataclass
import argparse
import numpy as np
from scipy.optimize import brentq, minimize_scalar
from scipy.special import jv, jvp, jnp_zeros

N_FOURIER = 12          # Floquet truncation (converged at 8 for the validated cases)


@dataclass
class Fluid:
    nu: float           # kinematic viscosity, m^2/s
    rho: float          # density, kg/m^3
    sigma: float        # surface tension, N/m
    h: float            # depth, m
    g: float = 9.81     # m/s^2 (COMSOL's g_const is 9.80665)


# ----------------------------------------------------------------- Kumar core
def _q(k, mu, nu):
    q = np.sqrt(k**2 + mu / nu + 0j)                     # eq. 3.10, Re(q) > 0
    return -q if q.real < 0 else q



def _sech_stable(z):
    """
    Numerically stable sech(z) for complex z with Re(z) >= 0.
    Avoids overflow from directly evaluating cosh(z).
    """
    e = np.exp(-z)
    return 2 * e / (1 + e**2)


def _tanh_stable(z):
    """
    Numerically stable tanh(z) for complex z with Re(z) >= 0.
    """
    e = np.exp(-2 * z)
    return (1 - e) / (1 + e)


def A_n(n, k, w, alpha, s, fl):
    """Kumar eq. 3.17, evaluated using scaled hyperbolic functions."""

    if alpha == 0 and n == 0:
        return 2 / k * (
            fl.g * k + fl.sigma / fl.rho * k**3
        )

    q = _q(k, s + 1j * (alpha + n) * w, fl.nu)
    h = fl.h

    C = q * (q**4 + 2 * q**2 * k**2 + 5 * k**4)
    D = k * (q**4 + 6 * q**2 * k**2 + k**4)

    # Stable hyperbolic functions
    sech_qh = _sech_stable(q * h)
    sech_kh = _sech_stable(k * h)

    tanh_qh = _tanh_stable(q * h)
    tanh_kh = _tanh_stable(k * h)

    # Numerator and denominator divided by cosh(q*h)*cosh(k*h)
    num_scaled = (
        4 * q * k**2 * (q**2 + k**2) * sech_qh * sech_kh
        - C
        + D * tanh_qh * tanh_kh
    )

    den_scaled = q * tanh_kh - k * tanh_qh

    return 2 / k * (
        fl.g * k
        + fl.sigma / fl.rho * k**3
        - fl.nu**2 * num_scaled / den_scaled
    )


def _orders(alpha, N):
    return np.arange(-N, N + (0 if alpha == 0.5 else 1))


def threshold(k, f, fl, alpha=0.5, s=0.0, N=N_FOURIER, return_mode=False):
    """Lowest forcing a (m/s^2) giving growth rate s at wavenumber k (1/m).
    alpha = 0.5 subharmonic, 0 harmonic. Kumar eqs. 3.22-3.26: eig(A^-1 B) = 1/a."""
    w = 2 * np.pi * f
    ns = _orders(alpha, N)
    Ad = np.array([A_n(n, k, w, alpha, s, fl) for n in ns])
    B = np.eye(len(ns), k=1) + np.eye(len(ns), k=-1)
    ev, vec = np.linalg.eig(B / Ad[:, None])
    ok = [i for i, e in enumerate(ev) if abs(e.imag) < 1e-6 * abs(e) and e.real > 0]
    if not ok:
        return (np.inf, None, ns) if return_mode else np.inf
    i = max(ok, key=lambda j: ev[j].real)                 # largest 1/a -> smallest a
    a = 1 / ev[i].real
    return (a, vec[:, i], ns) if return_mode else a


def growth_rate(k, f, a, fl, alpha=0.5):
    """Floquet growth rate s (1/s) of mode k at forcing a: solve threshold(k,f,s) = a."""
    a0 = threshold(k, f, fl, alpha)
    if not np.isfinite(a0):
        return np.nan
    fun = lambda s: threshold(k, f, fl, alpha, s) - a
    lo, hi = -1.0, 1.0
    while fun(lo) > 0 and lo > -1e5:                      # a(s) increases with s
        lo *= 2
    while fun(hi) < 0 and hi < 1e5:
        hi *= 2
    try:
        return brentq(fun, lo, hi, xtol=1e-6)
    except ValueError:
        return np.nan


def critical_infinite(f, fl, alpha=0.5, kmin=20.0, kmax=2e4):
    """Minimum of the first tongue for an unbounded layer -> (k_c, a_c)."""
    kg = np.geomspace(kmin, kmax, 160)
    v = np.array([threshold(k, f, fl, alpha) for k in kg])
    i = int(np.nanargmin(v))
    r = minimize_scalar(lambda k: threshold(k, f, fl, alpha),
                        bounds=(kg[max(i - 1, 0)], kg[min(i + 1, len(kg) - 1)]),
                        method="bounded", options={"xatol": 1e-3})
    return r.x, r.fun


# ----------------------------------------------------------------- containers
class Infinite:
    name = "infinite layer"

    def modes(self, kmax):
        return []                                          # continuous: use critical_infinite

    def pattern(self, k, label, X, Y):
        return np.cos(k * X)


class Channel:
    """2D channel of width L (equivalent to the COMSOL half-wavelength box)."""
    def __init__(self, L):
        self.L, self.name = L, f"channel L = {L*1e3:g} mm"

    def modes(self, kmax):
        return [(f"m={m}", m * np.pi / self.L) for m in range(1, int(kmax * self.L / np.pi) + 1)]

    def pattern(self, k, label, X, Y):
        return np.cos(k * X)


class Box:
    def __init__(self, Lx, Ly):
        self.Lx, self.Ly = Lx, Ly
        self.name = f"box {Lx*1e3:g} x {Ly*1e3:g} mm"

    def modes(self, kmax):
        out = []
        for m in range(0, int(kmax * self.Lx / np.pi) + 1):
            for n in range(0, int(kmax * self.Ly / np.pi) + 1):
                k = np.pi * np.hypot(m / self.Lx, n / self.Ly)
                if 0 < k <= kmax:
                    out.append((f"(m,n)=({m},{n})", k))
        return out

    def pattern(self, k, label, X, Y):
        m, n = map(int, label.split("=")[1].strip("()").split(","))
        return np.cos(m * np.pi * X / self.Lx) * np.cos(n * np.pi * Y / self.Ly)


class UprightCylinder:
    def __init__(self, R):
        self.R, self.name = R, f"upright cylinder R = {R*1e3:g} mm"

    def modes(self, kmax, mmax=40):
        out = []
        for m in range(0, mmax + 1):
            zs = jnp_zeros(m, 60)
            if m == 0:
                zs = zs[zs > 0]
            for i, z in enumerate(zs):
                if z / self.R > kmax:
                    break
                out.append((f"(m,s)=({m},{i+1})", z / self.R))
        return out

    def pattern(self, k, label, X, Y):
        m = int(label.split("=")[1].strip("()").split(",")[0])
        r, th = np.hypot(X, Y), np.arctan2(Y, X)
        P = jv(m, k * r) * np.cos(m * th)
        return np.where(r <= self.R, P, np.nan)


# ----------------------------------------------------------------- analysis
def analyze(a, f, fl, container, n_report=10, kmax_factor=4.0):
    """Thresholds of every allowed mode; which go unstable at (a, f); growth rates."""
    kc, ac = critical_infinite(f, fl)
    if isinstance(container, Infinite):
        rows = [dict(mode="k_c", k=kc, a_SH=ac, a_H=critical_infinite(f, fl, 0.0)[1])]
    else:
        rows = []
        for label, k in container.modes(kmax_factor * kc):
            rows.append(dict(mode=label, k=k, a_SH=threshold(k, f, fl, 0.5),
                             a_H=threshold(k, f, fl, 0.0)))
    for r in rows:
        r["a_c"] = min(r["a_SH"], r["a_H"])
        r["type"] = "subharmonic (f/2)" if r["a_SH"] <= r["a_H"] else "harmonic (f)"
        alpha = 0.5 if r["a_SH"] <= r["a_H"] else 0.0
        r["unstable"] = a > r["a_c"]
        r["s"] = growth_rate(r["k"], f, a, fl, alpha) if r["unstable"] or a > 0.5 * r["a_c"] else np.nan
    rows.sort(key=lambda r: r["a_c"])
    return dict(kc_inf=kc, ac_inf=ac, modes=rows[:n_report], first=rows[0],
                unstable=[r for r in rows if r["unstable"]])


def velocity_field(k, f, a_c, fl, alpha=0.5, amp=1e-3, nz=41, nt=200):
    """Critical-mode vertical structure from Kumar eqs. 3.8, 3.11-3.13.
    P_n, R_n from eqs. 3.12-3.13; Q_n, S_n solved from the bottom no-slip
    conditions (eqs. 2.19-2.20). Returns z, t, zeta(t), W(z,t), dW/dz(z,t),
    scaled so that max |zeta| = amp. Full field: w = W*phi, u_H = (dW/dz/k^2) grad phi."""
    w = 2 * np.pi * f
    _, zeta, ns = threshold(k, f, fl, alpha, return_mode=True)
    z = np.linspace(-fl.h, 0, nz)
    t = np.linspace(0, 2 / f, nt)                          # two forcing periods
    Wn = np.zeros((len(ns), nz), complex)
    dWn = np.zeros_like(Wn)
    for j, n in enumerate(ns):
        mu_n = 1j * (alpha + n) * w                         # s = 0 at threshold
        q = _q(k, mu_n, fl.nu)
        P = fl.nu * (q**2 + k**2) * zeta[j]
        R = -2 * fl.nu * k**2 * zeta[j]
        zb = -fl.h                                          # w = dw/dz = 0 at z = -h
        M = np.array([[np.sinh(k * zb), np.sinh(q * zb)],
                      [k * np.cosh(k * zb), q * np.cosh(q * zb)]])
        rhs = -np.array([P * np.cosh(k * zb) + R * np.cosh(q * zb),
                         P * k * np.sinh(k * zb) + R * q * np.sinh(q * zb)])
        Q, S = np.linalg.solve(M, rhs)
        Wn[j] = P * np.cosh(k * z) + Q * np.sinh(k * z) + R * np.cosh(q * z) + S * np.sinh(q * z)
        dWn[j] = k * (P * np.sinh(k * z) + Q * np.cosh(k * z)) + q * (R * np.sinh(q * z) + S * np.cosh(q * z))
    ph = np.exp(1j * np.outer(alpha + ns, w * t))           # (n, t)
    zeta_t = np.real(zeta @ ph)
    W = np.real(Wn.T @ ph)                                  # (z, t)
    dW = np.real(dWn.T @ ph)
    sc = amp / np.max(np.abs(zeta_t))
    return z, t, zeta_t * sc, W * sc, dW * sc


# ----------------------------------------------------------------- plots
def plot_tongues(fl, f, container=None, kmax=None, fname="tongues.png"):
    import matplotlib.pyplot as plt
    kc, ac = critical_infinite(f, fl)
    kmax = kmax or 3 * kc
    ks = np.linspace(0.15 * kc, kmax, 300)
    fig, ax = plt.subplots(figsize=(8, 5.5))
    ax.plot(ks / 1e3, [threshold(k, f, fl, 0.5) for k in ks], "-", color="#1f4e79", label="subharmonic tongues")
    ax.plot(ks / 1e3, [threshold(k, f, fl, 0.0) for k in ks], "--", color="#c55a11", label="harmonic tongues")
    if container is not None and not isinstance(container, Infinite):
        md = container.modes(kmax)
        ax.plot([k / 1e3 for _, k in md], [min(threshold(k, f, fl, .5), threshold(k, f, fl, 0)) for _, k in md],
                "o", color="#d62728", ms=6, label=f"allowed modes: {container.name}")
    ax.set_ylim(0, 6 * ac)
    ax.set(xlabel="k (1/mm)", ylabel="a (m/s²)", title=f"Stability tongues, f = {f:g} Hz, h = {fl.h*1e3:g} mm")
    ax.legend(); ax.grid(alpha=.3)
    fig.tight_layout(); fig.savefig(fname, dpi=150); plt.close(fig)


def plot_mode(fl, f, container, mode, fname="critical_mode.png"):
    """Surface pattern (top view) + velocity in a vertical section + zeta(t)."""
    import matplotlib.pyplot as plt
    k, label = mode["k"], mode["mode"]
    alpha = 0.5 if mode["type"].startswith("sub") else 0.0
    z, t, zt, W, dW = velocity_field(k, f, mode["a_c"], fl, alpha)
    it = int(np.argmax(np.abs(W[-1])))                      # instant of max surface velocity
    fig = plt.figure(figsize=(14, 4.6))
    # top view
    ax1 = fig.add_subplot(1, 3, 1)
    if isinstance(container, UprightCylinder):
        R = container.R; xs = np.linspace(-R, R, 241); X, Y = np.meshgrid(xs, xs)
    elif isinstance(container, Box):
        X, Y = np.meshgrid(np.linspace(0, container.Lx, 241), np.linspace(0, container.Ly, 241))
    else:
        Lx = container.L if isinstance(container, Channel) else 2 * np.pi / k
        X, Y = np.meshgrid(np.linspace(0, Lx, 241), np.linspace(0, 0.3 * Lx, 61))
    Pat = container.pattern(k, label, X, Y)
    c = ax1.pcolormesh(X * 1e3, Y * 1e3, Pat, cmap="RdBu_r", shading="auto")
    ax1.set_aspect("equal"); ax1.set(xlabel="x (mm)", ylabel="y (mm)", title=f"Onset pattern {label}\n(surface elevation, arb.)")
    fig.colorbar(c, ax=ax1, shrink=.8)
    # vertical section along y = 0 (x-axis), velocity at instant it
    ax2 = fig.add_subplot(1, 3, 2)
    xlab = "x (mm)"
    if isinstance(container, UprightCylinder):
        xs = np.linspace(-container.R, container.R, 400)
        m = int(label.split("=")[1].strip("()").split(",")[0])
        phi = jv(m, k * np.abs(xs)) * np.sign(xs) ** m
        dphi = k * jvp(m, k * np.abs(xs)) * np.sign(xs) ** (m + 1)
    else:
        Lx = container.L if isinstance(container, Channel) else 2 * np.pi / k
        kx, xlab = k, "x (mm)"
        if isinstance(container, Box):                      # cut along the direction the mode varies in
            m, n = map(int, label.split("=")[1].strip("()").split(","))
            Lx, kx, xlab = (container.Lx, m * np.pi / container.Lx, "x (mm), at y = 0") if m > 0 \
                else (container.Ly, n * np.pi / container.Ly, "y (mm), at x = 0")
        xs = np.linspace(0, Lx, 400)
        phi = np.cos(kx * xs); dphi = -kx * np.sin(kx * xs)
    Xs, Zs = np.meshgrid(xs, z)
    Wz = W[:, it][:, None] * phi[None, :]
    Uz = (dW[:, it] / k**2)[:, None] * dphi[None, :]
    ax2.contourf(Xs * 1e3, Zs * 1e3, np.hypot(Uz, Wz) * 1e3, 20, cmap="viridis")
    sx, sz = slice(None, None, max(1, len(xs) // 24)), slice(None, None, 3)
    ax2.quiver(Xs[sz, sx] * 1e3, Zs[sz, sx] * 1e3, Uz[sz, sx], Wz[sz, sx], color="w", width=.004)
    ax2.set(xlabel=xlab, ylabel="z (mm)", title="Velocity in vertical section\n(colour |u| in mm/s, 1 mm wave)")
    # time series
    ax3 = fig.add_subplot(1, 3, 3)
    ax3.plot(t * f, zt * 1e3, color="#1f4e79", label="surface elevation ζ (antinode)")
    ax3.plot(t * f, np.cos(2 * np.pi * f * t) * np.max(np.abs(zt)) * 1e3 * .4, color="grey", lw=1, ls=":", label="drive cos(ωt) (scaled)")
    ax3.set(xlabel="t / T_drive", ylabel="ζ (mm)", title=f"{mode['type']} response at a_c = {mode['a_c']:.1f} m/s²")
    ax3.legend(fontsize=9, loc="lower left"); ax3.grid(alpha=.3)
    fig.tight_layout(); fig.savefig(fname, dpi=150); plt.close(fig)


# ----------------------------------------------------------------- CLI
def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--f", type=float, required=True, help="drive frequency (Hz)")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--accel", type=float, help="acceleration amplitude a (m/s^2)")
    g.add_argument("--disp", type=float, help="displacement amplitude (m); a = w^2 * disp")
    p.add_argument("--nu", type=float, required=True); p.add_argument("--rho", type=float, required=True)
    p.add_argument("--sigma", type=float, required=True); p.add_argument("--h", type=float, required=True)
    p.add_argument("--shape", choices=["infinite", "channel", "box", "cylinder"], default="infinite")
    p.add_argument("--L", type=float); p.add_argument("--Lx", type=float); p.add_argument("--Ly", type=float)
    p.add_argument("--R", type=float); p.add_argument("--plots", action="store_true")
    A = p.parse_args()
    fl = Fluid(A.nu, A.rho, A.sigma, A.h)
    a = A.accel if A.accel is not None else (2 * np.pi * A.f) ** 2 * A.disp
    cont = {"infinite": lambda: Infinite(), "channel": lambda: Channel(A.L),
            "box": lambda: Box(A.Lx, A.Ly), "cylinder": lambda: UprightCylinder(A.R)}[A.shape]()
    res = analyze(a, A.f, fl, cont)
    b = np.sqrt(2 * fl.nu / (2 * np.pi * A.f))
    print(f"\n{cont.name}; f = {A.f:g} Hz; a = {a:.3g} m/s^2 ({a/fl.g:.3g} g); h/b = {fl.h/b:.2f}")
    print(f"Unbounded-layer reference: k_c = {res['kc_inf']/1e3:.4f} 1/mm "
          f"(lambda_c = {2*np.pi/res['kc_inf']*1e3:.3f} mm), a_c = {res['ac_inf']:.2f} m/s^2")
    print(f"\n{'mode':>14} {'k (1/mm)':>9} {'a_c (m/s2)':>11} {'type':>18} {'unstable':>9} {'s (1/s)':>8}")
    for r in res["modes"]:
        print(f"{r['mode']:>14} {r['k']/1e3:9.4f} {r['a_c']:11.2f} {r['type']:>18} {str(r['unstable']):>9} {r['s']:8.2f}")
    fm = res["first"]
    print(f"\nFirst mode to go unstable: {fm['mode']} at a_c = {fm['a_c']:.2f} m/s^2, {fm['type']}.")
    print("At the given forcing: " + ("STABLE (flat surface)." if not res["unstable"] else
          f"UNSTABLE; fastest mode {max(res['unstable'], key=lambda r: r['s'])['mode']}"))
    if A.plots:
        plot_tongues(fl, A.f, cont); plot_mode(fl, A.f, cont, fm)
        print("Saved tongues.png and critical_mode.png")


if __name__ == "__main__":
    main()
