
import numpy as np
from scipy.special import roots_legendre

# ============================================================
# 1. PHYSICAL PARAMETERS
# ============================================================

RHO_LIQUID = 998.0          # Liquid density (kg/m^3)
RHO_GAS = 1.2               # Approximate air density (kg/m^3)
G = 9.81                    # Gravitational acceleration (m/s^2)

RADIUS = 0.2                # Tank cross-section radius (m)
DEPTH = 0.2                 # Liquid depth measured from bottom (m)


# ============================================================
# 2. TANK GEOMETRY
# ============================================================

def tank_geometry(radius=RADIUS, depth=DEPTH):
    """
    Calculate the geometry of a horizontal circular tank.

    The liquid depth is measured vertically from the bottom
    of the circular cross-section.
    """

    c = radius
    h = depth

    if c <= 0:
        raise ValueError("Tank radius must be positive.")

    if not 0 < h < 2 * c:
        raise ValueError("Liquid depth must lie between 0 and 2R.")

    # Half-length of the liquid-gas interface
    e = np.sqrt(c**2 - (h - c)**2)

    return {
        "c": c,
        "h": h,
        "e": e
    }


# ============================================================
# 3. FLUID PROPERTIES
# ============================================================

def fluid_properties(rho1=RHO_LIQUID, rho2=RHO_GAS):
    """
    Calculate the density ratio and Atwood number.

    rho1: liquid density
    rho2: gas density
    """

    if rho1 <= 0 or rho2 < 0:
        raise ValueError("Invalid fluid densities.")

    r = rho2 / rho1

    if r >= 1:
        raise ValueError(
            "This implementation assumes the upper fluid "
            "is lighter than the lower fluid."
        )

    atwood = (1 - r) / (1 + r)

    return {
        "rho1": rho1,
        "rho2": rho2,
        "r": r,
        "atwood": atwood
    }


# ============================================================
# 4. HALF-FILL PARAMETERS
# ============================================================

def half_fill_parameters(radius=RADIUS, depth=DEPTH):
    """
    Return the transformed-coordinate parameters for half-fill.

    At half-fill:
        h = c = e
        beta1 = pi/2
        beta2 = -pi/2
    """

    geometry = tank_geometry(radius, depth)

    c = geometry["c"]
    h = geometry["h"]

    if not np.isclose(h, c):
        raise ValueError(
            "This function is currently implemented only "
            "for the half-filled tank."
        )

    return {
        "e": geometry["e"],
        "beta1": np.pi / 2,
        "beta2": -np.pi / 2
    }


# ============================================================
# 5. FUNCTION f(tau)
# ============================================================

def fluid_factor(tau, r):
    """
    Half-fill simplification from Colville et al.:

        f(tau) = 1 + r
    """

    return 1.0 + r


# ============================================================
# 6. ANALYTICAL INTEGRAL I(tau, tau_prime)
# ============================================================


def J(k):
    """
    Fourier cosine transform used in Colville et al. (2025):

        J(k) = integral_0^inf cos(k*alpha)
               / (1 + cosh(alpha)) d(alpha)

    Analytical result:
        J(k) = pi*abs(k) / sinh(pi*abs(k))

    Limiting value:
        J(0) = 1
    """
    x = np.pi * abs(k)

    if x < 1e-6:
        # x / sinh(x), expanded near zero
        return 1.0 - x**2 / 6.0 + 7.0 * x**4 / 360.0

    # Stable evaluation of x/sinh(x)
    return 2.0 * x * np.exp(-x) / (-np.expm1(-2.0 * x))


def kernel_I(tau, tau_prime, parity="symmetric"):
    """
    Analytical evaluation of Eq. (2.8).

    Symmetric:     m(x) = cos(x)
    Antisymmetric: m(x) = sin(x)
    """

    if tau <= 0 or tau_prime <= 0:
        raise ValueError("tau and tau_prime must be positive.")

    J_minus = J(tau - tau_prime)
    J_plus = J(tau + tau_prime)

    if parity == "symmetric":
        return (J_minus + J_plus) / np.pi

    elif parity == "antisymmetric":
        return (J_minus - J_plus) / np.pi

    else:
        raise ValueError(
            "parity must be 'symmetric' or 'antisymmetric'."
        )

# ============================================================
# 7. KERNEL K(tau, tau_prime)
# ============================================================

def kernel_K(tau, tau_prime, r, parity="symmetric"):
    """
    Evaluate the half-fill form of the Colville kernel:

    K(tau, tau') =
        sqrt( f(tau)*f(tau') /
              [tau*tau'*tanh(tau*beta1)*tanh(tau'*beta1)] )
        * I(tau, tau')
    """

    beta1 = np.pi / 2

    f1 = fluid_factor(tau, r)
    f2 = fluid_factor(tau_prime, r)

    denominator = (
        tau
        * tau_prime
        * np.tanh(tau * beta1)
        * np.tanh(tau_prime * beta1)
    )

    factor = np.sqrt((f1 * f2) / denominator)

    integral = kernel_I(tau, tau_prime, parity)

    return factor * integral

# ============================================================
# 8. GAUSS-LEGENDRE EIGENVALUE SOLVER
# ============================================================


def solve_natural_frequencies(N=12, parity="symmetric"):
    """
    Solve the half-fill horizontal-cylinder eigenvalue problem
    using N-point Gauss-Legendre quadrature.

    Returns natural frequencies in Hz, sorted in ascending order.
    """

    # --------------------------------------------------------
    # Step 1: Physical parameters
    # --------------------------------------------------------

    fluids = fluid_properties()
    geometry = tank_geometry()

    r = fluids["r"]
    e = geometry["e"]

    # --------------------------------------------------------
    # Step 2: Gauss-Legendre quadrature
    # --------------------------------------------------------

    u, weights = roots_legendre(N)

    # Transform Gauss-Legendre nodes to tau coordinates
    tau = -np.log((u + 1.0) / 2.0)

    # Transform the quadrature weights
    q = weights / (u + 1.0)

    # --------------------------------------------------------
    # Step 3: Construct the kernel matrix
    # --------------------------------------------------------

    K_matrix = np.zeros((N, N))

    for i in range(N):
        for j in range(N):
            K_matrix[i, j] = kernel_K(
                tau=tau[i],
                tau_prime=tau[j],
                r=r,
                parity=parity
            )

    # --------------------------------------------------------
    # Step 4: Symmetric matrix transformation
    # --------------------------------------------------------

    sqrt_q = np.sqrt(q)

    S_matrix = (
        sqrt_q[:, None]
        * K_matrix
        * sqrt_q[None, :]
    )

    # --------------------------------------------------------
    # Step 4A: Matrix endpoint diagnostics
    # --------------------------------------------------------

    print("\nMatrix endpoint diagnostic:")
    print("S_matrix shape:", S_matrix.shape)
    print(
        "Maximum absolute matrix entry:",
        np.max(np.abs(S_matrix))
    )
    print(
        "Maximum diagonal entry:",
        np.max(np.abs(np.diag(S_matrix)))
    )
    print(
        "Maximum absolute row sum:",
        np.max(np.sum(np.abs(S_matrix), axis=1))
    )

    # Inspect rows associated with the smallest tau values
    small_tau_indices = np.argsort(tau)[:5]

    print("\nRows corresponding to smallest tau:")

    for j in small_tau_indices:
        print(
            f"Index = {j}, "
            f"tau = {tau[j]:.8e}, "
            f"row norm = {np.linalg.norm(S_matrix[j, :]):.8e}, "
            f"diagonal = {S_matrix[j, j]:.8e}"
        )

    # Check whether the matrix is numerically symmetric
    symmetry_error = np.max(np.abs(S_matrix - S_matrix.T))

    print("\nMatrix symmetry error:", symmetry_error)

    # --------------------------------------------------------
    # Step 5: Solve the matrix eigenvalue problem
    # --------------------------------------------------------

    eigenvalues, eigenvectors = np.linalg.eigh(S_matrix)

    # --------------------------------------------------------
    # Step 5A: Small-tau and eigenvalue diagnostics
    # --------------------------------------------------------

    print("\nSmall-tau diagnostic:")
    print(f"Minimum tau = {np.min(tau):.10e}")
    print(f"Maximum tau = {np.max(tau):.10e}")

    print("\nEight smallest tau values:")

    for j in np.argsort(tau)[:8]:
        print(f"tau[{j}] = {tau[j]:.10e}")

    # Sort eigenvalues in descending order for diagnostics
    idx_desc = np.argsort(eigenvalues)[::-1]

    print("\nLargest eigenvalues:")

    for j in range(min(5, N)):
        print(
            f"lambda[{j}] = "
            f"{eigenvalues[idx_desc[j]]:.10e}"
        )

    # Inspect the eigenvector corresponding to the
    # largest eigenvalue
    print("\nEigenvector concentration:")

    v0 = eigenvectors[:, idx_desc[0]]
    contributions = np.abs(v0) ** 2

    for j in np.argsort(contributions)[::-1][:8]:
        print(
            f"tau = {tau[j]:.10e}, "
            f"contribution = {contributions[j]:.10e}"
        )

    # --------------------------------------------------------
    # Step 5B: Sort eigenvalues and corresponding eigenvectors
    # --------------------------------------------------------

    idx = np.argsort(eigenvalues)[::-1]

    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]

    # Keep only positive eigenvalues and their eigenvectors
    positive_mask = eigenvalues > 0

    positive_eigenvalues = eigenvalues[positive_mask]
    positive_eigenvectors = eigenvectors[:, positive_mask]

    if len(positive_eigenvalues) == 0:
        raise ValueError(
            "No positive eigenvalues were found. "
            "Check the kernel matrix and physical parameters."
        )

    # --------------------------------------------------------
    # Step 5C: Eigenvector diagnostic
    # --------------------------------------------------------

    print("\nEigenvector diagnostic:")
    print("Largest eigenvalue:", eigenvalues[0])

    if len(eigenvalues) > 1:
        print("Second-largest eigenvalue:", eigenvalues[1])

    v = eigenvectors[:, 0]
    contributions = np.abs(v) ** 2

    largest_components = np.argsort(contributions)[::-1][:8]

    for j in largest_components:
        print(
            f"tau = {tau[j]:.8e}, "
            f"|v_j|^2 = {contributions[j]:.8e}"
        )

    # --------------------------------------------------------
    # Step 6: Convert positive eigenvalues into frequencies
    # --------------------------------------------------------

    frequencies = (
        1.0 / (2.0 * np.pi)
        * np.sqrt(
            ((1.0 - r) * G)
            / (e * positive_eigenvalues)
        )
    )

    return {
        "frequencies": frequencies,
        "eigenvalues": positive_eigenvalues,
        "eigenvectors": positive_eigenvectors,
        "tau": tau,
        "quadrature_weights": q
    }

def reconstruct_mode(result, mode_index=0, parity="symmetric",
                     num_alpha=801, alpha_max=8.0):
    """
    Reconstruct the free-surface displacement using Colville et al.,
    equation (2.15).

    mode_index = 0 corresponds to the lowest-frequency mode.
    """

    # Retrieve solver results
    tau = result["tau"]
    q = result["quadrature_weights"]
    eigenvectors = result["eigenvectors"]

    fluids = fluid_properties()
    geometry = tank_geometry()

    r = fluids["r"]
    e = geometry["e"]

    beta1 = np.pi / 2
    f = 1.0 + r

    # Select the requested eigenvector
    v = eigenvectors[:, mode_index]

    # Recover B(tau) from the transformed eigenvector
    B = v / np.sqrt(q)

    # Interface coordinate alpha
    alpha = np.linspace(-alpha_max, alpha_max, num_alpha)

    # Select Fourier parity
    if parity == "symmetric":
        m = np.cos(np.outer(alpha, tau))
    elif parity == "antisymmetric":
        m = np.sin(np.outer(alpha, tau))
    else:
        raise ValueError("Invalid parity.")

    # Weight appearing in equation (2.15)
    spectral_factor = np.sqrt(
        tau * np.tanh(tau * beta1) / f
    )

    # Evaluate the integral using the existing quadrature
    integrand_weights = q * B * spectral_factor

    integral = m @ integrand_weights

    # Free-surface displacement
    eta = ((1.0 + np.cosh(alpha)) / e) * integral

    # Convert alpha to physical horizontal coordinate x
    x = -e * np.tanh(alpha / 2.0)

    # Sort by x for plotting
    order = np.argsort(x)

    x = x[order]
    eta = eta[order]

    # Normalize for shape comparison only
    eta_normalized = eta / np.max(np.abs(eta))

    return x, eta_normalized, eta

# ============================================================
# 9. MODE RECONSTRUCTION TESTS
# ============================================================

if __name__ == "__main__":

    import matplotlib.pyplot as plt

    # Quadrature orders to test
    N_values = [32, 48, 64, 80, 96, 128, 160, 192]

    # Modes to reconstruct for each parity
    mode_configurations = [
        ("symmetric", 0, "Symmetric Mode 1"),
        ("symmetric", 1, "Symmetric Mode 2"),
        ("antisymmetric", 0, "Antisymmetric Mode 1")
    ]

    for N in N_values:

        print(f"\n{'='*60}")
        print(f"MODE RECONSTRUCTION FOR N = {N}")
        print(f"{'='*60}")

        # Solve both parity eigenvalue problems
        symmetric_result = solve_natural_frequencies(
            N=N,
            parity="symmetric"
        )

        antisymmetric_result = solve_natural_frequencies(
            N=N,
            parity="antisymmetric"
        )

        results = {
            "symmetric": symmetric_result,
            "antisymmetric": antisymmetric_result
        }

        plt.figure(figsize=(10, 6))

        for parity, mode_index, label in mode_configurations:

            result = results[parity]

            x, eta_normalized, eta_raw = reconstruct_mode(
                result,
                mode_index=mode_index,
                parity=parity
            )

            frequency = result["frequencies"][mode_index]

            volume_integral = np.trapezoid(eta_raw, x)

            absolute_integral = np.trapezoid(
                np.abs(eta_raw), x
            )

            volume_residual = (
                abs(volume_integral) / absolute_integral
            )

            print(f"\n{label}:")
            print(f"  Frequency = {frequency:.8f} Hz")
            print(f"  Volume integral = {volume_integral:.8e}")
            print(f"  Volume residual = {volume_residual:.8e}")

            plt.plot(x, eta_normalized, label=label)

        plt.xlabel("Horizontal coordinate x (m)")
        plt.ylabel("Normalized surface displacement")
        plt.title(f"Horizontal Cylinder: Mode Shapes (N={N})")
        plt.grid(True)
        plt.legend()
        plt.tight_layout()

    plt.show()