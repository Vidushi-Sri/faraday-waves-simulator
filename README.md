# Faraday Wave Instability: Theory and Numerical Modelling

A Python-based project for studying Faraday-wave instability in vertically vibrated liquid containers, using linear viscous Floquet theory and numerical analysis.

The project currently contains two main development tracks:

- **Phase 1:** Linear Faraday instability analysis for flat-bottom containers, based on Kumar (1996).
- **Phase 2:** Semi-analytical natural-frequency and mode-shape analysis for a horizontal cylindrical container.

---

## 1. Theoretical Background

Faraday waves are parametrically excited surface waves that arise when a liquid container is subjected to vertical periodic forcing.

The project investigates the onset of instability by calculating critical forcing amplitudes, unstable modes, natural frequencies and associated surface-wave behaviour.

### Phase 1: Flat-bottom containers

The main solver implements the linear viscous Floquet formulation described by:

K. Kumar, "Linear theory of Faraday instability in viscous liquids",
Proceedings of the Royal Society of London A, Vol. 452, pp. 1113–1126 (1996).

The implementation accounts for:

- Bulk viscosity
- Surface tension
- Finite liquid depth
- Periodic vertical forcing
- Subharmonic and harmonic responses

The solver supports several idealized container geometries:

- Infinite liquid layer
- Two-dimensional channel
- Rectangular container
- Upright cylindrical container

The container geometry determines the allowed horizontal wavenumbers.

**Modelling assumptions and limitations**

The side walls are treated as idealized boundaries. Side-wall boundary-layer damping and contact-line damping are not included. Consequently, predicted thresholds for small containers may underestimate the actual experimental thresholds.

The linear theory predicts instability onset and linear response. It does not predict saturated wave amplitudes or nonlinear pattern selection.

### Phase 2: Horizontal cylindrical containers

The second development track investigates the natural frequencies and free-surface mode shapes of a partially filled horizontal circular container.

The current implementation includes:

- Tank geometry calculations
- Liquid–gas density ratio and Atwood number
- Half-fill transformed-coordinate parameters
- Numerical evaluation of integral kernels
- Symmetric and antisymmetric eigenvalue problems
- Natural-frequency calculations
- Free-surface mode reconstruction
- Quadrature-order convergence studies

The current implementation is under development. Numerical convergence and physical validity of the extracted modes, including volume-conservation checks, remain important validation tasks.

---

## 2. Repository Structure

```text
Surface-waves/
│
├── README.md
├── requirements.txt
├── .gitignore
│
├── faraday_floquet.py
│
├── horizontal_cylinder.py
│
├── depth_sweep.py
├── viscosity_sweep.py
├── cylinder_frequency_sweep.py
│
├── make_figures.py
├── fit_faraday.py
│
├── acc_probe_table.csv
├── freq_sweep_probe_table.csv
├── lam_sweep_probe_table.csv
├── probe_table_fine_mesh.csv
│
├── depth_sweep_results.csv
├── viscosity_sweep_results.csv
├── cylinder_frequency_results.csv
│
├── figures/
│   ├── fig1_probe_envelopes_60Hz.png
│   ├── fig2_growth_rate_vs_forcing_60Hz.png
│   ├── fig3_tongue_60Hz.png
│   └── fig4_threshold_and_wavelength_vs_frequency.png
│
└── [Generated plots]
```

### **Main Python files**

| File                          | Purpose                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `faraday_floquet.py`          | Main linear viscous Floquet solver                                                |
| `horizontal_cylinder.py`      | Horizontal-cylinder natural-frequency and mode-shape analysis                     |
| `depth_sweep.py`              | Studies the effect of liquid depth on instability                                 |
| `viscosity_sweep.py`          | Studies the effect of kinematic viscosity                                         |
| `cylinder_frequency_sweep.py` | Compares cylindrical and infinite-layer thresholds over frequency                 |
| `make_figures.py`             | Reproduces the four main Faraday-wave figures                                     |
| `fit_faraday.py`              | Extracts growth rates and estimates instability thresholds from COMSOL probe data |

## **3. Installation**

### **Requirements**

- Python 3.10 or later
- NumPy
- SciPy
- Matplotlib
- Pandas

### **Clone the repository**

```
git clone <REPOSITORY_URL>
cd Surface-waves
```

### **Create a virtual environment**

Windows PowerShell:

```
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### **Install dependencies**

```
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## **4. Running the Simulations**

Run the commands from the repository root directory.

### **4.1 Flat-bottom Floquet solver**

The main solver requires the driving frequency, fluid properties and liquid depth.

Example: 60 Hz forcing with a prescribed acceleration amplitude.

```
python faraday_floquet.py --f 60 --accel 100 --nu 1e-4 --rho 1220 --sigma 0.065 --h 2.9e-3 --plots
```

Alternatively, specify the displacement amplitude instead of acceleration:

```
python faraday_floquet.py --f 60 --disp 1e-4 --nu 1e-4 --rho 1220 --sigma 0.065 --h 2.9e-3
```

The acceleration and displacement amplitudes are related by:

\\[ a = \omega^2 d,\qquad \omega=2\pi f. \\]

Supported geometries:

```
infinite
channel
box
cylinder
```

For geometry-specific parameters, use:

```
python faraday_floquet.py --help
```

### **4.2 Depth sweep**

```
python depth_sweep.py
```

Calculates critical acceleration and critical wavelength as functions of liquid depth.

Outputs:

- `depth_sweep_results.csv`
- `depth_vs_acceleration.png`
- `depth_vs_wavelength.png`

### **4.3 Viscosity sweep**

```
python viscosity_sweep.py
```

Studies the effect of kinematic viscosity on critical acceleration and wavelength.

Outputs:

- `viscosity_sweep_results.csv`
- `viscosity_vs_acceleration.png`
- `viscosity_vs_wavelength.png`

### **4.4 Cylindrical frequency sweep**

```
python cylinder_frequency_sweep.py
```

Calculates the frequency-dependent threshold and compares cylindrical-container results with infinite-layer subharmonic and harmonic thresholds.

Outputs:

- `cylinder_frequency_results.csv`
- `cylinder_threshold_vs_frequency.png`
- `cylinder_vs_infinite_threshold.png`

### **4.5 Reproducing the main figures**

The figure-generation script uses COMSOL-exported probe tables and theoretical calculations.

Ensure that the following files are present in the working directory:

- `acc_probe_table.csv`
- `lam_sweep_probe_table.csv`
- `freq_sweep_probe_table.csv`

Run:

```
python make_figures.py
```

The four figures are saved in the `figures/` directory.

### **4.6 Fitting COMSOL probe data**

```
python fit_faraday.py <probe_table.csv>
```

An optional reference threshold can also be supplied:

```
python fit_faraday.py <probe_table.csv> 91.19
```

The fitting script estimates growth rates and instability thresholds from the time-dependent probe data.

### **4.7 Horizontal-cylinder analysis**

```
python horizontal_cylinder.py
```

The current script performs natural-frequency and mode-reconstruction tests over multiple Legendre quadrature orders.

It evaluates symmetric and antisymmetric modes and reports volume-conservation diagnostics.

The horizontal-cylinder implementation is still under numerical and physical validation.

## **5. Selected Results**

The Phase 1 implementation has been used to reproduce the infinite-layer reference result for the 60 Hz Kumar Fig. 2 fluid configuration:

| Quantity              | Result      |
| --------------------- | ----------- |
| Driving frequency     | 60 Hz       |
| Critical wavenumber   | 0.7817 mm⁻¹ |
| Critical wavelength   | 8.038 mm    |
| Critical acceleration | 91.19 m/s²  |

These values correspond to the specified reference configuration and should not be interpreted as universal thresholds.

The project also includes parameter sweeps and comparisons with COMSOL probe-table results.

## **6. Current Development Status**

### **Phase 1 — Flat-bottom containers**

- Linear viscous Floquet solver implemented.
- Multiple idealized container geometries supported.
- Depth, viscosity and frequency studies implemented.
- COMSOL probe-data fitting and figure-generation tools available.
- Reference-case results reproduced.

### **Phase 2 — Horizontal cylindrical containers**

- Geometry and transformed-coordinate formulation implemented.
- Integral-kernel calculations implemented.
- Symmetric and antisymmetric eigenvalue problems implemented.
- Natural-frequency calculations and mode reconstruction implemented.
- Quadrature convergence and volume-conservation validation ongoing.

## **7. Future Work**

Potential extensions include:

- Further validation of horizontal-cylinder natural frequencies.
- Improved eigenmode extraction and volume-conservation enforcement.
- Floquet stability analysis using the horizontal-cylinder mode basis.
- Comparison with analytical and experimental results.
- Development of a user interface for running simulations and visualizing results.

## **8. References**

Kumar, K. (1996). Linear theory of Faraday instability in viscous liquids. Proceedings of the Royal Society of London A, 452, 1113–1126.

McIver, P. (1989). [Add the complete bibliographic details of the conformal-mapping reference used in the horizontal-cylinder formulation.]

**Note:** The McIver reference is deliberately marked for completion rather than assigning an unverified title or publication detail. We can add the exact citation from your research material later.
