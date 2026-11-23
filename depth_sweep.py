
"""
depth_sweep.py

Study how liquid depth affects the critical Faraday instability
threshold and critical wavelength for an unbounded liquid layer.

Uses the validated solver functions from faraday_floquet.py.
"""

import numpy as np
import matplotlib.pyplot as plt
import csv

from faraday_floquet import Fluid, critical_infinite


# ---------------------------------------------------------
# 1. Fixed physical parameters
# ---------------------------------------------------------

f = 60.0                 # Driving frequency (Hz)
nu = 1e-4                # Kinematic viscosity (m^2/s)
rho = 1220.0             # Liquid density (kg/m^3)
sigma = 0.065            # Surface tension (N/m)

# Liquid depths to investigate (metres)
depths_mm = [1.0, 1.5, 2.0, 2.9, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0]


# ---------------------------------------------------------
# 2. Calculate critical values at each depth
# ---------------------------------------------------------

results = []

print("\nDEPTH SWEEP: FARADAY INSTABILITY")
print(f"Driving frequency = {f} Hz")
print("-" * 65)
print(f"{'Depth (mm)':>12} {'k_c (1/mm)':>14} "
      f"{'lambda_c (mm)':>16} {'a_c (m/s^2)':>16}")
print("-" * 65)

for h_mm in depths_mm:

    # Convert depth from mm to metres
    h = h_mm * 1e-3

    # Create fluid with the current depth
    fluid = Fluid(nu=nu, rho=rho, sigma=sigma, h=h)

    # Find critical wavenumber and threshold
    kc, ac = critical_infinite(f, fluid)

    # Convert wavenumber from 1/m to 1/mm
    kc_mm = kc / 1e3

    # Calculate critical wavelength
    lambda_c = 2 * np.pi / kc

    # Store results
    results.append({
        "depth_mm": h_mm,
        "kc_per_mm": kc_mm,
        "lambda_mm": lambda_c * 1e3,
        "ac_m_s2": ac
    })

    print(f"{h_mm:12.2f} {kc_mm:14.4f} "
          f"{lambda_c * 1e3:16.3f} {ac:16.2f}")

print("-" * 65)


# ---------------------------------------------------------
# 3. Save numerical results to CSV
# ---------------------------------------------------------

with open("depth_sweep_results.csv", "w", newline="") as file:

    writer = csv.DictWriter(
        file,
        fieldnames=["depth_mm", "kc_per_mm", "lambda_mm", "ac_m_s2"]
    )

    writer.writeheader()
    writer.writerows(results)

print("\nNumerical results saved to depth_sweep_results.csv")


# ---------------------------------------------------------
# 4. Extract values for plotting
# ---------------------------------------------------------

h_values = [r["depth_mm"] for r in results]
ac_values = [r["ac_m_s2"] for r in results]
lambda_values = [r["lambda_mm"] for r in results]


# ---------------------------------------------------------
# 5. Plot critical acceleration versus depth
# ---------------------------------------------------------

plt.figure(figsize=(7, 5))

plt.plot(h_values, ac_values, "o-", linewidth=2)

plt.xlabel("Liquid depth h (mm)")
plt.ylabel("Critical acceleration $a_c$ (m/s$^2$)")
plt.title(f"Critical acceleration versus depth ({f:g} Hz)")

plt.grid(True, alpha=0.3)
plt.tight_layout()

plt.savefig("depth_vs_acceleration.png", dpi=200)
plt.show()


# ---------------------------------------------------------
# 6. Plot critical wavelength versus depth
# ---------------------------------------------------------

plt.figure(figsize=(7, 5))

plt.plot(h_values, lambda_values, "s-", linewidth=2)

plt.xlabel("Liquid depth h (mm)")
plt.ylabel("Critical wavelength $\\lambda_c$ (mm)")
plt.title(f"Critical wavelength versus depth ({f:g} Hz)")

plt.grid(True, alpha=0.3)
plt.tight_layout()

plt.savefig("depth_vs_wavelength.png", dpi=200)
plt.show()

print("\nPlots saved successfully.")
