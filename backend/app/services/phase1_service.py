"""Phase 1 service: validates the run, calls faraday_floquet, normalises results.

No physics is implemented here. Every number comes from the solver's public
functions (analyze, threshold, critical_infinite, container.modes/pattern).
The only arithmetic done here is:
  * a = (2 pi f)^2 d for displacement input (the solver CLI's own convention,
    faraday_floquet.main), and
  * unit conversions for display fields (1/m -> 1/mm, m -> mm, 2 pi / k).
Nothing is rounded; the frontend rounds for display only.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone

import numpy as np

from ..schemas import (
    AllowedMode, CriticalRequest, CriticalResponse, Curve, CurvePoint, Mode, Pattern,
    Plots, Results, TongueMinimum,
)
from ..solver_bridge import SOLVER_PROVENANCE, ff

# Bounded runtime: allowed modes below 4 k_c (the solver's analyze() search
# range). ~2,500 modes is a few seconds; larger containers relative to the
# wavelength should use the infinite-layer model, which is their limit.
MAX_MODES = 2500
TONGUE_SAMPLES = 240        # points per tongue curve over plot_tongues' k range
PATTERN_LINE_N = 241        # same resolution as faraday_floquet.plot_mode
PATTERN_FIELD_N = 81


class SolverLimitError(Exception):
    def __init__(self, code: str, message: str, field: str | None = None):
        super().__init__(message)
        self.code, self.message, self.field = code, message, field


def _finite(x) -> float | None:
    return float(x) if x is not None and np.isfinite(x) else None


def _container(req: CriticalRequest):
    g = req.geometry
    return {
        "infinite": lambda: ff.Infinite(),
        "channel": lambda: ff.Channel(g.L),
        "box": lambda: ff.Box(g.Lx, g.Ly),
        "cylinder": lambda: ff.UprightCylinder(g.R),
    }[g.shape]()


def _response(type_str: str) -> str:
    return "subharmonic" if type_str.startswith("sub") else "harmonic"


def _mode(r: dict) -> Mode:
    k = float(r["k"])
    return Mode(
        label=r["mode"], wavenumber_per_m=k, wavenumber_per_mm=k / 1e3,
        wavelength_mm=2 * math.pi / k * 1e3,
        threshold_subharmonic_m_s2=_finite(r["a_SH"]), threshold_harmonic_m_s2=_finite(r["a_H"]),
        critical_acceleration_m_s2=_finite(r["a_c"]), response=_response(r["type"]),
        unstable=bool(r["unstable"]), growth_rate_per_s=_finite(r["s"]),
    )


def _response_frequency(order: int) -> str:
    if order % 2 == 0:
        return "f" if order == 2 else f"{order // 2}f"
    return "f/2" if order == 1 else f"{order}f/2"


def _curve(ks: np.ndarray, f: float, fl, alpha: float) -> Curve:
    a = np.array([ff.threshold(k, f, fl, alpha) for k in ks])
    pts = [CurvePoint(wavenumber_per_mm=k / 1e3, wavelength_mm=2 * math.pi / k * 1e3, a_m_s2=_finite(v))
           for k, v in zip(ks, a)]
    # interior local minima of the lower envelope = bottoms of successive tongues
    idx = [i for i in range(1, len(a) - 1)
           if np.isfinite(a[i]) and a[i] < a[i - 1] and a[i] <= a[i + 1]]
    first_order, step = (1, 2) if alpha == 0.5 else (2, 2)
    minima = [TongueMinimum(order=first_order + j * step,
                            response_frequency=_response_frequency(first_order + j * step),
                            wavenumber_per_mm=ks[i] / 1e3, a_m_s2=float(a[i]))
              for j, i in enumerate(idx)]
    return Curve(response="subharmonic" if alpha == 0.5 else "harmonic", points=pts, minima=minima)


def _pattern(req: CriticalRequest, cont, crit: Mode) -> Pattern:
    """Grid choices follow faraday_floquet.plot_mode (top view)."""
    k, label, g = crit.wavenumber_per_m, crit.label, req.geometry
    if g.shape in ("infinite", "channel"):
        Lx = g.L if g.shape == "channel" else 2 * math.pi / k
        xs = np.linspace(0, Lx, PATTERN_LINE_N)
        v = np.asarray(cont.pattern(k, label, xs, np.zeros_like(xs)), float)
        m = np.nanmax(np.abs(v)) or 1.0
        return Pattern(kind="line", x_mm=(xs * 1e3).tolist(), values=(v / m).tolist())
    if g.shape == "cylinder":
        xs = ys = np.linspace(-g.R, g.R, PATTERN_FIELD_N)
    else:
        xs, ys = np.linspace(0, g.Lx, PATTERN_FIELD_N), np.linspace(0, g.Ly, PATTERN_FIELD_N)
    X, Y = np.meshgrid(xs, ys)
    P = np.asarray(cont.pattern(k, label, X, Y), float)
    m = np.nanmax(np.abs(P)) or 1.0
    rows = [[None if not np.isfinite(v) else float(v / m) for v in row] for row in P]
    return Pattern(kind="field", x_mm=(xs * 1e3).tolist(), y_mm=(ys * 1e3).tolist(), values=rows)


GROWTH_RTOL = 1e-6   # a verified growth rate must reproduce the applied a to this relative accuracy
NONLINEAR_FACTOR = 5.0   # above this multiple of a_c, linear theory is not predictive (note shown)
UNIT_CHECK_G = 1000.0    # above this many g, the input is almost certainly a units slip (note shown)


def _verify_growth_rates(res: dict, a: float, f: float, fl) -> list[str]:
    """Self-check every growth rate analyze() returned: by definition s solves
    threshold(k, f, fl, alpha, s) = a. If substituting s back does not give the
    applied a, the root-finder landed on the wrong branch (seen far above onset),
    so the value is withheld (set to NaN, shown as "not available") instead of
    being displayed wrong. Mutates the rows in place; returns rejected labels."""
    rejected: list[str] = []
    seen: set[int] = set()
    for r in [*res["modes"], *res["unstable"], res["first"]]:
        if id(r) in seen or not np.isfinite(r["s"]):
            continue
        seen.add(id(r))
        alpha = 0.5 if r["type"].startswith("sub") else 0.0
        back = ff.threshold(r["k"], f, fl, alpha, r["s"])
        if not (np.isfinite(back) and abs(back - a) <= GROWTH_RTOL * max(abs(a), 1e-12)):
            r["s"] = float("nan")
            rejected.append(r["mode"])
    return rejected


def _fingerprint(req: CriticalRequest) -> str:
    canon = json.dumps(req.model_dump(exclude={"include_plot_data"}), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()


def _search_window() -> tuple[float, float]:
    """The k range critical_infinite() scans, read from the solver's own defaults."""
    import inspect
    p = inspect.signature(ff.critical_infinite).parameters
    return float(p["kmin"].default), float(p["kmax"].default)


def _check_search_range(f: float, fl) -> None:
    """Validity guard (does not compute any reported result).

    critical_infinite() scans a fixed k window. If the first subharmonic tongue
    lies outside it, the scan returns a higher tongue and the answer is wrong
    without any error. The first tongue sits near the wavenumber whose free
    surface-wave frequency is half the drive, w0(k) = pi f, with
    w0^2 = (g k + sigma k^3 / rho) tanh(k h) (undamped dispersion relation).
    If that k is outside the window, refuse rather than show a wrong number.
    """
    kmin, kmax = _search_window()
    w_half = math.pi * f
    w0 = lambda k: math.sqrt((fl.g * k + fl.sigma / fl.rho * k ** 3) * math.tanh(k * fl.h))
    lo, hi = 1e-6, 1e9                              # w0 is monotonic in k: bisect in log space
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        lo, hi = (mid, hi) if w0(mid) < w_half else (lo, mid)
    k1 = lo
    if not (kmin <= k1 <= kmax):
        raise SolverLimitError(
            "OUT_OF_RANGE",
            f"Outside the model's wavenumber range: the expected onset wavelength is about "
            f"{2 * math.pi / k1:.3g} m, but the solver searches wavelengths from "
            f"{2 * math.pi / kmax * 1e3:.3g} mm to {2 * math.pi / kmin * 1e3:.3g} mm. "
            "A result here would be unreliable, so none is shown.",
            "frequency_hz")


def run_critical(req: CriticalRequest) -> CriticalResponse:
    fl = ff.Fluid(req.fluid.kinematic_viscosity_m2_s, req.fluid.density_kg_m3,
                  req.fluid.surface_tension_n_m, req.depth_m)
    f = req.frequency_hz
    a = req.forcing.value if req.forcing.kind == "acceleration" \
        else (2 * math.pi * f) ** 2 * req.forcing.value          # faraday_floquet.main convention
    cont = _container(req)
    finite = req.geometry.shape != "infinite"

    _check_search_range(f, fl)
    kc_inf, ac_inf = ff.critical_infinite(f, fl)
    if finite:
        n = len(cont.modes(4.0 * kc_inf))                         # analyze()'s default search range
        if n > MAX_MODES:
            raise SolverLimitError(
                "CONTAINER_TOO_LARGE",
                f"The container admits {n:,} modes below 4 k_c (limit {MAX_MODES:,}). "
                "At this size it behaves as an infinite layer; select that geometry instead.",
                "geometry")

    warnings: list[str] = []
    no_modes = finite and n == 0
    res = None if no_modes else ff.analyze(a, f, fl, cont)
    if res:
        rejected = _verify_growth_rates(res, a, f, fl)
        if rejected:
            warnings.append(
                f"Growth rate withheld for {', '.join(rejected)}: the root found does not reproduce the applied "
                "acceleration (self-check failed), which can happen far above onset.")
    crit = _mode(res["first"]) if res else None
    if crit is None or crit.critical_acceleration_m_s2 is None:
        status, a_c = "no_critical_mode_found", None
        warnings.append("No unstable mode was found in the searched wavenumber range.")
    else:
        a_c = crit.critical_acceleration_m_s2
        status = "unstable" if crit.unstable else "stable"

    unstable = [r for r in (res["unstable"] if res else []) if np.isfinite(r["s"])]
    fastest = _mode(max(unstable, key=lambda r: r["s"])) if unstable else None

    if crit and crit.growth_rate_per_s is None and a_c is not None:
        warnings.append("Growth rate is computed only for a > 0.5 a_c.")
    # range-of-validity guards: correct arithmetic, physically meaningless input
    g = SOLVER_PROVENANCE["gravity_m_s2"]
    if a > NONLINEAR_FACTOR * (a_c or float("inf")):
        warnings.append(
            f"The applied acceleration is {a / a_c:,.0f} times the onset threshold. Linear theory describes onset and early "
            "growth only; at this forcing the motion is strongly nonlinear, so growth rates are not predictive.")
    if a > UNIT_CHECK_G * g:
        warnings.append(
            f"The applied acceleration is {a / g:,.0f} g, far beyond laboratory shakers (typically up to about 100 g). "
            "Check the units of the forcing input" + (" (displacement is in metres)." if req.forcing.kind == "displacement" else "."))
    if finite:
        warnings.append("Side-wall and contact-line damping are not modelled; thresholds for small containers are lower bounds.")
    if req.forcing.kind == "displacement":
        warnings.append("Acceleration derived from the displacement input: a = (2πf)² d.")

    plots = None
    if req.include_plot_data:
        ks = np.linspace(0.15 * kc_inf, 3 * kc_inf, TONGUE_SAMPLES)   # faraday_floquet.plot_tongues range
        allowed: list[AllowedMode] = []
        if finite:
            for label, k in cont.modes(3 * kc_inf):
                aSH, aH = ff.threshold(k, f, fl, 0.5), ff.threshold(k, f, fl, 0.0)
                ac_m = min(aSH, aH)
                if np.isfinite(ac_m):
                    allowed.append(AllowedMode(label=label, wavenumber_per_mm=k / 1e3, critical_acceleration_m_s2=float(ac_m),
                                               response="subharmonic" if aSH <= aH else "harmonic", unstable=bool(a > ac_m)))
        plots = Plots(
            tongues=[_curve(ks, f, fl, 0.5), _curve(ks, f, fl, 0.0)],
            plot_range={"wavenumber_min_per_mm": ks[0] / 1e3, "wavenumber_max_per_mm": ks[-1] / 1e3,
                        "a_max_m_s2": 6 * ac_inf},
            allowed_modes=allowed,
            pattern=_pattern(req, cont, crit) if crit else None,
        )

    return CriticalResponse(
        model={"phase": "phase1", "method": "linear_viscous_floquet", "geometry": req.geometry.shape,
               "container": cont.name},
        inputs={**req.model_dump(exclude={"include_plot_data"}), "applied_acceleration_m_s2": a},
        results=Results(
            status=status, applied_acceleration_m_s2=a, critical_acceleration_m_s2=a_c,
            ratio_applied_to_critical=(a / a_c) if a_c else None,
            critical_mode=crit, fastest_unstable_mode=fastest,
            lowest_modes=[_mode(r) for r in res["modes"]] if res else [],
            unbounded_reference={"wavenumber_per_m": float(kc_inf), "wavenumber_per_mm": float(kc_inf) / 1e3,
                                 "wavelength_mm": 2 * math.pi / float(kc_inf) * 1e3,
                                 "critical_acceleration_m_s2": float(ac_inf)},
        ),
        plots=plots,
        assumptions=[
            "Linear theory: predicts when waves start and how fast they first grow, not their final height (saturated amplitude) or which of two equally easy patterns appears (degenerate modes).",
            "Ideal side walls: no friction at the walls (free slip), a 90° contact angle and no meniscus.",
            "Viscosity, friction at the bottom (the no-slip boundary layer), surface tension and finite depth are included exactly.",
            f"g = {SOLVER_PROVENANCE['gravity_m_s2']} m/s²; the periodic forcing is represented by {SOLVER_PROVENANCE['fourier_truncation_N']} Fourier harmonics on each side (Floquet method), enough for converged results.",
        ],
        warnings=warnings,
        provenance={**SOLVER_PROVENANCE, "computed": True,
                    "computed_at": datetime.now(timezone.utc).isoformat(),
                    "input_fingerprint": _fingerprint(req)},
    )
