
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

import faraday_floquet as ff


# --------------------------------------------------
# Physical parameters: COMSOL water-cylinder model
# --------------------------------------------------

nu = 1.002004008e-6
rho = 998.0
sigma = 0.072
h = 0.2
R = 0.2

fl = ff.Fluid(nu, rho, sigma, h)
container = ff.UprightCylinder(R)


# --------------------------------------------------
# Frequency sweep
# --------------------------------------------------

frequencies = np.arange(1.0, 3.01, 0.1)

results = []

print("\nCYLINDRICAL FREQUENCY SWEEP")
print("-" * 85)

print(
    f"{'f (Hz)':>7} {'ac (m/s2)':>12} "
    f"{'Mode':>12} {'Type':>18} "
    f"{'SH ref':>10} {'H ref':>10}"
)


for f in frequencies:

    # Infinite-layer references for both branches
    kc_SH, ac_SH = ff.critical_infinite(f, fl, 0.5)
    kc_H, ac_H = ff.critical_infinite(f, fl, 0.0)

    # Search beyond both reference wavenumbers
    kmax_factor = 10.0 * max(1.0, kc_H / kc_SH)

    # Calculate cylindrical mode thresholds
    res = ff.analyze(
        a=0.0,
        f=f,
        fl=fl,
        container=container,
        n_report=10,
        kmax_factor=kmax_factor
    )

    first = res["first"]

    # Check whether the selected mode remains unchanged
    # when the search range is increased
    res_check = ff.analyze(
        a=0.0,
        f=f,
        fl=fl,
        container=container,
        n_report=10,
        kmax_factor=1.25 * kmax_factor
    )

    first_check = res_check["first"]

    converged = (
        first["mode"] == first_check["mode"]
        and np.isclose(
            first["a_c"],
            first_check["a_c"],
            rtol=1e-4
        )
    )

    results.append({
        "frequency_Hz": f,
        "critical_acceleration_m_s2": first["a_c"],
        "mode": first["mode"],
        "response_type": first["type"],
        "k_critical_per_m": first["k"],
        "infinite_SH_threshold": ac_SH,
        "infinite_H_threshold": ac_H,
        "search_converged": converged
    })

    print(
        f"{f:7.2f} "
        f"{first['a_c']:12.4f} "
        f"{first['mode']:>12} "
        f"{first['type']:>18} "
        f"{ac_SH:10.4f} "
        f"{ac_H:10.4f}"
    )


# --------------------------------------------------
# Save numerical results
# --------------------------------------------------

df = pd.DataFrame(results)

df.to_csv("cylinder_frequency_results.csv", index=False)

print("\nResults saved to cylinder_frequency_results.csv")

print("\nSearch convergence:")
print(df["search_converged"].value_counts())


# --------------------------------------------------
# Plot 1: Critical acceleration vs frequency
# --------------------------------------------------

plt.figure(figsize=(8, 5))

plt.plot(
    df["frequency_Hz"],
    df["critical_acceleration_m_s2"],
    "o-"
)

plt.xlabel("Driving frequency (Hz)")
plt.ylabel("Critical acceleration (m/s²)")
plt.title("Cylindrical Faraday threshold vs frequency")
plt.grid(True)

plt.tight_layout()
plt.savefig("cylinder_threshold_vs_frequency.png", dpi=200)
plt.show()


# --------------------------------------------------
# Plot 2: Infinite-layer vs cylindrical threshold
# --------------------------------------------------

plt.figure(figsize=(8, 5))

plt.plot(
    df["frequency_Hz"],
    df["critical_acceleration_m_s2"],
    "o-",
    label="Cylinder"
)

plt.plot(
    df["frequency_Hz"],
    df["infinite_SH_threshold"],
    "s--",
    label="Infinite layer: subharmonic"
)

plt.plot(
    df["frequency_Hz"],
    df["infinite_H_threshold"],
    "^--",
    label="Infinite layer: harmonic"
)

plt.xlabel("Driving frequency (Hz)")
plt.ylabel("Critical acceleration (m/s²)")
plt.title("Cylinder vs infinite-layer thresholds")
plt.legend()
plt.grid(True)

plt.tight_layout()
plt.savefig("cylinder_vs_infinite_threshold.png", dpi=200)
plt.show()

print("\nPlots saved successfully.")
