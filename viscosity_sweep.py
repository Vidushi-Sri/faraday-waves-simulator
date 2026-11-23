
"""
viscosity_sweep.py

Study the effect of kinematic viscosity on the
critical Faraday instability threshold and wavelength.

Uses the existing validated Floquet solver.
"""

import numpy as np
import matplotlib.pyplot as plt
import csv

from faraday_floquet import Fluid, critical_infinite


# ---------------------------------------------------------
# 1. Fixed physical parameters
# ---------------------------------------------------------

f = 60.0                 # Driving frequency (Hz)
rho = 1220.0             # Liquid density (kg/m^3)
sigma = 0.065            # Surface tension (N/m)
h = 5e-3                 # Liquid depth (m) = 5 mm

# Kinematic viscosity values (m^2/s)
viscosities = [
    0.5e-4,
    1e-4,
    2e-4,
    5e-4,
    10e-4
]


# ---------------------------------------------------------
# 2. Calculate critical values for each viscosity
# ---------------------------------------------------------

results = []

print("\nVISCOSITY SWEEP: FARADAY INSTABILITY")
print(f"Driving frequency = {f} Hz")
print(f"Liquid depth = {h * 1e3:.2f} mm")
print("-" * 70)

print(f"{'nu (m^2/s)':>15} {'k_c (1/mm)':>14} "
      f"{'lambda_c (mm)':>16} {'a_c (m/s^2)':>16}")

print("-" * 70)

for nu in viscosities:

    # Create fluid with the current viscosity
    fluid = Fluid(
        nu=nu,
        rho=rho,
        sigma=sigma,
        h=h
    )

    # Calculate critical wavenumber and acceleration
    kc, ac = critical_infinite(f, fluid)

    # Calculate critical wavelength
    lambda_c = 2 * np.pi / kc

    # Store results
    results.append({
        "nu_m2_s": nu,
        "kc_per_mm": kc / 1e3,
        "lambda_mm": lambda_c * 1e3,
        "ac_m_s2": ac
    })

    print(f"{nu:15.2e} {kc / 1e3:14.4f} "
          f"{lambda_c * 1e3:16.3f} {ac:16.2f}")

print("-" * 70)


# ---------------------------------------------------------
# 3. Save results to CSV
# ---------------------------------------------------------

with open("viscosity_sweep_results.csv", "w", newline="") as file:

    writer = csv.DictWriter(
        file,
        fieldnames=[
            "nu_m2_s",
            "kc_per_mm",
            "lambda_mm",
            "ac_m_s2"
        ]
    )

    writer.writeheader()
    writer.writerows(results)

print("\nResults saved to viscosity_sweep_results.csv")


# ---------------------------------------------------------
# 4. Extract values for plotting
# ---------------------------------------------------------

nu_values = [r["nu_m2_s"] for r in results]
ac_values = [r["ac_m_s2"] for r in results]
lambda_values = [r["lambda_mm"] for r in results]


# ---------------------------------------------------------
# 5. Plot critical acceleration versus viscosity
# ---------------------------------------------------------

plt.figure(figsize=(7, 5))

plt.plot(nu_values, ac_values, "o-", linewidth=2)

plt.xlabel("Kinematic viscosity nu (m^2/s)")
plt.ylabel("Critical acceleration $a_c$ (m/s$^2$)")
plt.title(f"Critical acceleration versus viscosity ({f:g} Hz)")

plt.grid(True, alpha=0.3)
plt.tight_layout()

plt.savefig("viscosity_vs_acceleration.png", dpi=200)
plt.show()


# ---------------------------------------------------------
# 6. Plot critical wavelength versus viscosity
# ---------------------------------------------------------

plt.figure(figsize=(7, 5))

plt.plot(nu_values, lambda_values, "s-", linewidth=2)

plt.xlabel("Kinematic viscosity nu (m^2/s)")
plt.ylabel("Critical wavelength $\\lambda_c$ (mm)")
plt.title(f"Critical wavelength versus viscosity ({f:g} Hz)")

plt.grid(True, alpha=0.3)
plt.tight_layout()

plt.savefig("viscosity_vs_wavelength.png", dpi=200)
plt.show()

print("\nPlots saved successfully.")
