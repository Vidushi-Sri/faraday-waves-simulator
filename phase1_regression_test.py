"""
Phase 1 regression tests for faraday_floquet.py

Run from the project directory:
    python phase1_regression_test.py

This tests the threshold core and basic output integrity. It deliberately does
NOT certify the legacy growth_rate() function or the physical branch selection
of phase1_growth_rate_v2.py; those require separate COMSOL comparisons.
"""

import importlib.util
import sys
from pathlib import Path

import numpy as np

MODULE_PATH = Path("faraday_floquet.py")
if not MODULE_PATH.exists():
    raise FileNotFoundError(
        "Place this test beside faraday_floquet.py, then run it from that directory."
    )

spec = importlib.util.spec_from_file_location("faraday_floquet", MODULE_PATH)
ff = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = ff
spec.loader.exec_module(ff)

fl = ff.Fluid(
    nu=1.0e-4,
    rho=1220.0,
    sigma=0.065,
    h=2.9e-3,
    g=9.81,
)

# Threshold references: values previously obtained from the validated
# Kumar implementation / COMSOL sweep. These are comparison targets,
# not exact mathematical constants.
frequency_cases = [
    # f (Hz), wavelength (mm), reference threshold (m/s^2)
    (20.0, 17.540, 38.44),
    (40.0, 10.670, 58.83),
    (60.0,  8.020, 91.20),
    (80.0,  6.637, 136.53),
    (100.0, 5.751, 192.82),
]

wavelength_cases = [
    # wavelength (mm), reference threshold (m/s^2)
    (6.00, 135.3),
    (7.00, 99.0),
    (8.02, 91.2),
    (9.00, 95.1),
    (10.0, 104.7),
    (11.0, 117.4),
]

failures = []
checks = 0


def check(condition, description):
    global checks
    checks += 1
    if condition:
        print(f"PASS  {description}")
    else:
        failures.append(description)
        print(f"FAIL  {description}")


def close(actual, expected, *, atol=1e-6, rtol=1e-6):
    return bool(np.isfinite(actual) and np.isclose(actual, expected, atol=atol, rtol=rtol))


print("\nPHASE 1 REGRESSION TEST")
print("=" * 76)

# 1. Main 60 Hz benchmark at the COMSOL wavenumber.
k_benchmark = 784.0
ac_benchmark = ff.threshold(k_benchmark, 60.0, fl, alpha=0.5, N=20)
check(
    close(ac_benchmark, 91.19276474697803, atol=2e-6, rtol=0),
    f"60 Hz benchmark threshold: {ac_benchmark:.9f} m/s^2",
)

# 2. Frequency sweep.
print("\nFrequency sweep")
for f, lam_mm, ac_ref in frequency_cases:
    k = 2.0 * np.pi / (lam_mm * 1e-3)
    ac = ff.threshold(k, f, fl, alpha=0.5, N=20)
    # Reference values are printed to 0.01 m/s^2, so use a suitably
    # looser tolerance than the internal numerical regression.
    check(
        abs(ac - ac_ref) <= 0.015,
        f"f={f:g} Hz, lambda={lam_mm:g} mm: ac={ac:.8f}, ref={ac_ref:.2f}",
    )

# 3. Wavelength sweep at 60 Hz.
print("\nWavelength sweep")
for lam_mm, ac_ref in wavelength_cases:
    k = 2.0 * np.pi / (lam_mm * 1e-3)
    ac = ff.threshold(k, 60.0, fl, alpha=0.5, N=20)
    check(
        abs(ac - ac_ref) <= 0.06,
        f"lambda={lam_mm:g} mm: ac={ac:.8f}, ref={ac_ref:.2f}",
    )

# 4. Fourier truncation convergence for all wavelength cases.
print("\nFourier truncation convergence")
for lam_mm, _ in wavelength_cases:
    k = 2.0 * np.pi / (lam_mm * 1e-3)
    values = [
        float(ff.threshold(k, 60.0, fl, alpha=0.5, N=N))
        for N in (8, 12, 16, 20, 24)
    ]
    spread = max(values) - min(values)
    check(
        spread < 1e-7,
        f"lambda={lam_mm:g} mm: max-min across N=8..24 is {spread:.3e}",
    )

# 5. Harmonic branch: finite threshold and Fourier convergence.
print("\nHarmonic threshold sanity check")
harmonic_values = [
    float(ff.threshold(k_benchmark, 60.0, fl, alpha=0.0, N=N))
    for N in (8, 12, 16, 20, 24)
]
harmonic_spread = max(harmonic_values) - min(harmonic_values)
check(
    all(np.isfinite(harmonic_values)) and harmonic_spread < 1e-7,
    f"harmonic threshold converges; values={harmonic_values}",
)

# 6. Stable hyperbolic helper functions against NumPy at moderate arguments.
print("\nStable hyperbolic functions")
z_values = [0.2 + 0.1j, 1.0 + 2.0j, 4.0 + 0.5j]
for z in z_values:
    sech_err = abs(ff._sech_stable(z) - 1.0 / np.cosh(z))
    tanh_err = abs(ff._tanh_stable(z) - np.tanh(z))
    check(
        sech_err < 1e-12 and tanh_err < 1e-12,
        f"sech/tanh agreement at z={z}: errors {sech_err:.2e}, {tanh_err:.2e}",
    )

# 7. Velocity-field output integrity at the benchmark mode.
print("\nVelocity-field integrity")
z, t, zeta_t, W, dW = ff.velocity_field(
    k_benchmark, 60.0, ac_benchmark, fl,
    alpha=0.5, amp=1e-3, nz=21, nt=40,
)
shapes_ok = (
    z.shape == (21,)
    and t.shape == (40,)
    and zeta_t.shape == (40,)
    and W.shape == (21, 40)
    and dW.shape == (21, 40)
)
finite_ok = all(np.all(np.isfinite(x)) for x in (z, t, zeta_t, W, dW))
amp_ok = abs(np.max(np.abs(zeta_t)) - 1e-3) < 1e-12
check(shapes_ok, "velocity-field array dimensions")
check(finite_ok, "velocity-field arrays contain only finite values")
check(amp_ok, "surface elevation is normalized to requested 1 mm amplitude")

# 8. Container-mode sanity checks.
print("\nContainer-mode sanity checks")
channel = ff.Channel(4.01e-3)
channel_modes = channel.modes(3000.0)
check(
    len(channel_modes) > 0
    and all(np.isfinite(k) and k > 0 for _, k in channel_modes),
    "channel modes are finite and positive",
)
box = ff.Box(10e-3, 8e-3)
box_modes = box.modes(2000.0)
check(
    len(box_modes) > 0
    and all(np.isfinite(k) and k > 0 for _, k in box_modes),
    "rectangular-box modes are finite and positive",
)
cylinder = ff.UprightCylinder(0.2)
cylinder_modes = cylinder.modes(100.0)
check(
    len(cylinder_modes) > 0
    and all(np.isfinite(k) and k > 0 for _, k in cylinder_modes),
    "upright-cylinder modes are finite and positive",
)

print("\n" + "=" * 76)
print(f"RESULT: {checks - len(failures)}/{checks} checks passed")
if failures:
    print("Failures:")
    for item in failures:
        print(" -", item)
    raise SystemExit(1)

print("All current threshold/core regression checks passed.")
print(
    "NOTE: This does not validate legacy growth_rate() or prove physical "
    "Floquet branch selection."
)
